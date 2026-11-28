// Phase 5: the admin dashboard (admin.html). Bikes/bike_blocks/bookings
// state transitions are done as direct table writes (not new RPCs) -
// bikes_write_admin/bike_blocks_write_admin/bookings_update_admin RLS
// policies already grant an admin session unrestricted write access to
// these tables (see their migrations), so there's no extra authorization
// boundary a new SECURITY DEFINER function would add here; it would only
// duplicate logic a trusted admin role is already allowed to do directly.
// Business-rule guards (which actions are even offered) live in the UI,
// same as this project's "no fake features" convention of not building
// enforcement for a transition that can't realistically happen yet - e.g.
// "Mark picked up" only ever renders for a status='confirmed' booking,
// and no booking can reach status='confirmed' until Phase 4 (Razorpay)
// exists, so that specific button has no real row to act on yet.
import { supabase } from "./supabase-client.js";
import { getSession } from "./auth.js";
import { escapeHtml, formatDate, formatPgRange, rupees, statusPill } from "./format.js";

let currentUserId = null;
let noShowHours = 4;

document.addEventListener("DOMContentLoaded", async () => {
  const loadingEl = document.getElementById("adminLoading");
  const deniedEl = document.getElementById("adminDenied");
  const appEl = document.getElementById("adminApp");

  const session = await getSession();
  if (!session) {
    window.location.replace(`login.html?redirect=${encodeURIComponent("admin.html")}`);
    return;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  loadingEl.hidden = true;

  if (error || profile?.role !== "admin") {
    deniedEl.hidden = false;
    return;
  }

  currentUserId = session.user.id;
  appEl.hidden = false;

  const { data: config } = await supabase.from("business_config").select("no_show_hours").eq("id", 1).single();
  // no_show_hours=0 is a legitimate configured value (no grace period) -
  // a truthy check would wrongly treat it as "not set" and keep the
  // hardcoded default.
  if (config?.no_show_hours != null) noShowHours = config.no_show_hours;

  initTabs();
  loadBookings();
  loadBikes();
  loadBlocks();
});

function initTabs() {
  const buttons = document.querySelectorAll(".admin-tab-button");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => {
        b.classList.toggle("active", b === btn);
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      });
      document.querySelectorAll(".admin-tab-panel").forEach((panel) => {
        panel.hidden = panel.id !== btn.getAttribute("aria-controls");
      });
    });
  });
}

// ============ Bookings ============

async function loadBookings() {
  const tbody = document.getElementById("bookingsTableBody");
  const statusEl = document.getElementById("bookingsStatus");
  statusEl.textContent = "Loading bookings…";

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id,reference,start_at,end_at,status,amount_due_paise,hold_expires_at,bikes(name),customer:profiles!bookings_customer_id_fkey(full_name)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    statusEl.textContent = "Couldn't load bookings.";
    console.error("Failed to load bookings:", error);
    return;
  }

  statusEl.textContent = data.length ? "" : "No bookings yet.";
  tbody.innerHTML = data.map(renderBookingRow).join("");
  wireBookingActions();
}

function renderBookingRow(b) {
  const pastNoShowWindow = Date.now() > new Date(b.start_at).getTime() + noShowHours * 3600000;
  const canCancel = b.status === "held" || b.status === "confirmed";
  const canPickUp = b.status === "confirmed";
  const canReturn = b.status === "picked_up";
  const canNoShow = b.status === "confirmed" && pastNoShowWindow;

  const actions = [];
  if (canPickUp) actions.push(button(b.id, "pickup", "Mark picked up"));
  if (canReturn) actions.push(button(b.id, "return", "Mark returned"));
  if (canNoShow) actions.push(button(b.id, "noshow", "Mark no-show"));
  if (canCancel) actions.push(button(b.id, "cancel", "Cancel"));

  return `
    <tr>
      <td>${escapeHtml(b.reference)}</td>
      <td>${escapeHtml(b.bikes?.name) || "—"}</td>
      <td>${escapeHtml(b.customer?.full_name) || "—"}</td>
      <td>${formatDate(b.start_at)} – ${formatDate(b.end_at)}</td>
      <td>${statusPill(b.status)}</td>
      <td>${rupees(b.amount_due_paise)}</td>
      <td class="admin-actions-cell">${actions.join(" ") || "—"}</td>
    </tr>
    <tr class="admin-action-panel-row" id="actionPanel-${b.id}" hidden>
      <td colspan="7"><div class="admin-action-panel" id="actionPanelInner-${b.id}"></div></td>
    </tr>
  `;
}

function button(id, action, label) {
  return `<button type="button" class="btn btn-wishlist admin-action" data-action="${action}" data-id="${id}">${label}</button>`;
}

function wireBookingActions() {
  document.querySelectorAll(".admin-action").forEach((btn) => {
    btn.addEventListener("click", () => openActionPanel(btn.dataset.id, btn.dataset.action));
  });
}

function openActionPanel(bookingId, action) {
  const wasOpen = !document.getElementById(`actionPanel-${bookingId}`).hidden;
  document.querySelectorAll(".admin-action-panel-row").forEach((row) => {
    row.hidden = true;
  });
  if (wasOpen) return;

  const row = document.getElementById(`actionPanel-${bookingId}`);
  const inner = document.getElementById(`actionPanelInner-${bookingId}`);
  row.hidden = false;

  if (action === "cancel") {
    inner.innerHTML = `
      <label class="form-label" for="cancelReason-${bookingId}">Cancellation reason</label>
      <input type="text" class="form-control" id="cancelReason-${bookingId}" placeholder="e.g. customer called to cancel">
      <button type="button" class="btn btn-primary" id="confirmAction-${bookingId}">Confirm cancel</button>
    `;
    document.getElementById(`confirmAction-${bookingId}`).addEventListener("click", () =>
      updateBooking(bookingId, {
        status: "cancelled_by_admin",
        cancelled_at: new Date().toISOString(),
        cancellation_reason:
          document.getElementById(`cancelReason-${bookingId}`).value.trim() || "Cancelled by admin",
      })
    );
  } else if (action === "pickup") {
    inner.innerHTML = `
      <label class="form-label" for="idType-${bookingId}">ID type checked at pickup</label>
      <select class="form-control" id="idType-${bookingId}">
        <option value="driving_licence">Driving licence</option>
        <option value="aadhaar">Aadhaar</option>
        <option value="voter_id">Voter ID</option>
        <option value="passport">Passport</option>
      </select>
      <label class="form-label" for="deposit-${bookingId}">Deposit collected (&#8377;)</label>
      <input type="number" min="0" step="1" class="form-control" id="deposit-${bookingId}" value="0">
      <button type="button" class="btn btn-primary" id="confirmAction-${bookingId}">Confirm pickup</button>
    `;
    document.getElementById(`confirmAction-${bookingId}`).addEventListener("click", () =>
      updateBooking(bookingId, {
        status: "picked_up",
        id_type: document.getElementById(`idType-${bookingId}`).value,
        id_verified_at: new Date().toISOString(),
        id_verified_by: currentUserId,
        deposit_collected_at: new Date().toISOString(),
        deposit_collected_amount_paise: Math.round(
          Number(document.getElementById(`deposit-${bookingId}`).value || 0) * 100
        ),
      })
    );
  } else if (action === "return") {
    inner.innerHTML = `<button type="button" class="btn btn-primary" id="confirmAction-${bookingId}">Confirm return</button>`;
    document
      .getElementById(`confirmAction-${bookingId}`)
      .addEventListener("click", () => updateBooking(bookingId, { status: "returned" }));
  } else if (action === "noshow") {
    inner.innerHTML = `
      <p>Mark as no-show &mdash; no refund applies, per pricing-policy.html.</p>
      <button type="button" class="btn btn-primary" id="confirmAction-${bookingId}">Confirm no-show</button>
    `;
    document
      .getElementById(`confirmAction-${bookingId}`)
      .addEventListener("click", () => updateBooking(bookingId, { status: "no_show" }));
  }
}

async function updateBooking(id, patch) {
  const statusEl = document.getElementById("bookingsStatus");
  const { error } = await supabase.from("bookings").update(patch).eq("id", id);
  if (error) {
    statusEl.textContent = `Couldn't update booking: ${error.message}`;
    console.error("Failed to update booking:", error);
    return;
  }
  loadBookings();
}

// ============ Bikes ============

async function loadBikes() {
  const tbody = document.getElementById("bikesTableBody");
  const statusEl = document.getElementById("bikesStatus");
  statusEl.textContent = "Loading bikes…";

  const { data, error } = await supabase.from("bikes").select("*").order("name");

  if (error) {
    statusEl.textContent = "Couldn't load bikes.";
    console.error("Failed to load bikes:", error);
    return;
  }

  statusEl.textContent = "";
  tbody.innerHTML = data.map(renderBikeRow).join("");
  wireBikeRowActions();
  populateBlockBikeSelect(data);
}

function renderBikeRow(bike) {
  return `
    <tr>
      <td>${escapeHtml(bike.name)}</td>
      <td>${escapeHtml(bike.brand_label)}</td>
      <td>${escapeHtml(bike.category)}</td>
      <td><input type="number" class="form-control bike-price-input" data-id="${bike.id}" value="${(bike.price_paise / 100).toFixed(0)}" min="1"></td>
      <td><input type="checkbox" class="bike-active-checkbox" data-id="${bike.id}" ${bike.is_active ? "checked" : ""} aria-label="Active"></td>
      <td><button type="button" class="btn btn-wishlist save-bike-btn" data-id="${bike.id}">Save</button></td>
    </tr>
  `;
}

function wireBikeRowActions() {
  document.querySelectorAll(".save-bike-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const priceInput = document.querySelector(`.bike-price-input[data-id="${id}"]`);
      const activeInput = document.querySelector(`.bike-active-checkbox[data-id="${id}"]`);
      const statusEl = document.getElementById("bikesStatus");

      const { error } = await supabase
        .from("bikes")
        .update({
          price_paise: Math.round(Number(priceInput.value) * 100),
          is_active: activeInput.checked,
        })
        .eq("id", id);

      statusEl.textContent = error ? `Couldn't save: ${error.message}` : "Saved.";
      if (error) console.error("Failed to save bike:", error);
    });
  });
}

document.getElementById("addBikeForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById("addBikeStatus");

  const slug = document.getElementById("newBikeSlug").value.trim();
  const name = document.getElementById("newBikeName").value.trim();
  const brand = document.getElementById("newBikeBrand").value.trim();
  const brandLabel = document.getElementById("newBikeBrandLabel").value.trim();
  const category = document.getElementById("newBikeCategory").value;
  const priceRupees = Number(document.getElementById("newBikePrice").value);
  const imagePath = document.getElementById("newBikeImagePath").value.trim();
  const fuel = document.getElementById("newBikeFuel").value.trim();
  const engine = document.getElementById("newBikeEngine").value.trim();
  const gears = document.getElementById("newBikeGears").value.trim();
  const mileage = document.getElementById("newBikeMileage").value.trim();

  if (!slug || !name || !brand || !brandLabel || !priceRupees || !imagePath) {
    statusEl.textContent = "Please fill in all required fields.";
    return;
  }

  const { error } = await supabase.from("bikes").insert({
    slug,
    name,
    brand,
    brand_label: brandLabel,
    category,
    price_paise: Math.round(priceRupees * 100),
    image_path: imagePath,
    specs: { fuel, engine, gears, mileage },
  });

  if (error) {
    statusEl.textContent = `Couldn't add bike: ${error.message}`;
    console.error("Failed to add bike:", error);
    return;
  }

  statusEl.textContent = "Bike added.";
  document.getElementById("addBikeForm").reset();
  loadBikes();
});

// ============ Maintenance blocks ============

function populateBlockBikeSelect(bikes) {
  const select = document.getElementById("blockBikeSelect");
  if (!select) return;
  select.innerHTML = bikes.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("");
}

async function loadBlocks() {
  const tbody = document.getElementById("blocksTableBody");
  const statusEl = document.getElementById("blocksStatus");
  statusEl.textContent = "Loading maintenance blocks…";

  const { data, error } = await supabase
    .from("bike_blocks")
    .select("id,during,reason,bikes(name)")
    .order("during", { ascending: false });

  if (error) {
    statusEl.textContent = "Couldn't load maintenance blocks.";
    console.error("Failed to load blocks:", error);
    return;
  }

  statusEl.textContent = data.length ? "" : "No maintenance blocks.";
  tbody.innerHTML = data
    .map(
      (blk) => `
    <tr>
      <td>${escapeHtml(blk.bikes?.name) || "—"}</td>
      <td>${formatPgRange(blk.during)}</td>
      <td>${escapeHtml(blk.reason) || "—"}</td>
      <td><button type="button" class="btn btn-wishlist delete-block-btn" data-id="${blk.id}">Delete</button></td>
    </tr>
  `
    )
    .join("");

  document.querySelectorAll(".delete-block-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { error } = await supabase.from("bike_blocks").delete().eq("id", btn.dataset.id);
      if (error) {
        statusEl.textContent = `Couldn't delete block: ${error.message}`;
        console.error("Failed to delete block:", error);
        return;
      }
      loadBlocks();
    });
  });
}

document.getElementById("addBlockForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById("addBlockStatus");

  const bikeId = document.getElementById("blockBikeSelect").value;
  const start = document.getElementById("blockStart").value;
  const end = document.getElementById("blockEnd").value;
  const reason = document.getElementById("blockReason").value.trim();

  if (!bikeId || !start || !end) {
    statusEl.textContent = "Please choose a bike and both dates.";
    return;
  }

  const startIso = new Date(`${start}T00:00:00+05:30`).toISOString();
  const endIso = new Date(`${end}T00:00:00+05:30`).toISOString();

  // admin_create_bike_block (not a plain table insert) takes the same
  // per-bike advisory lock create_booking_hold does, closing the race
  // where a concurrent booking-hold attempt for this bike could land
  // between this insert and its own overlap check.
  const { error } = await supabase.rpc("admin_create_bike_block", {
    p_bike_id: bikeId,
    p_during: `[${startIso},${endIso})`,
    p_reason: reason || null,
  });

  if (error) {
    statusEl.textContent = `Couldn't add block: ${error.message}`;
    console.error("Failed to add block:", error);
    return;
  }

  statusEl.textContent = "Block added.";
  document.getElementById("addBlockForm").reset();
  loadBlocks();
});
