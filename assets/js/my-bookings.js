// Phase 6 (partial): customer-facing booking history (my-bookings.html).
// Only the no-Razorpay-dependency slice of Phase 6 - cancelling a still-
// held booking reuses Phase 3's cancel_booking_hold RPC. Cancelling a
// CONFIRMED booking with refund-percentage math is NOT built here: that
// needs a real payment to refund against, which doesn't exist until
// Phase 4 (Razorpay) ships - building it now would mean inventing a
// refund for a payment this system never actually took, which is exactly
// the "no fake features" hard rule.
import { supabase } from "./supabase-client.js";
import { getSession } from "./auth.js";

const STATUS_LABELS = {
  held: "Held",
  confirmed: "Confirmed",
  picked_up: "Picked up",
  returned: "Returned",
  expired: "Expired",
  cancelled_by_customer: "Cancelled",
  cancelled_by_admin: "Cancelled by us",
  no_show: "No-show",
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function rupees(paise) {
  return `₹${(paise / 100).toFixed(0)}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const loadingEl = document.getElementById("bookingsLoading");
  const signedOutEl = document.getElementById("bookingsSignedOut");
  const appEl = document.getElementById("myBookingsApp");

  const session = await getSession();
  loadingEl.hidden = true;

  if (!session) {
    signedOutEl.hidden = false;
    return;
  }

  appEl.hidden = false;
  loadBookings(session.user.id);
});

async function loadBookings(customerId) {
  const tbody = document.getElementById("myBookingsTableBody");
  const statusEl = document.getElementById("myBookingsStatus");
  statusEl.textContent = "Loading…";

  const { data, error } = await supabase
    .from("bookings")
    .select("id,reference,start_at,end_at,status,amount_due_paise,hold_expires_at,bikes(name,slug)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) {
    statusEl.textContent = "Couldn't load your bookings.";
    console.error("Failed to load bookings:", error);
    return;
  }

  if (!data.length) {
    statusEl.innerHTML = `You don't have any bookings yet. <a href="bike-shop.html">Browse our fleet</a>.`;
    tbody.innerHTML = "";
    return;
  }

  statusEl.textContent = "";
  tbody.innerHTML = data.map(renderRow).join("");
  wireCancelButtons();
}

function renderRow(b) {
  const canCancel = b.status === "held";
  const bikeLink = b.bikes?.slug ? `<a href="bike.html?slug=${b.bikes.slug}">${b.bikes.name}</a>` : (b.bikes?.name ?? "—");

  return `
    <tr>
      <td>${b.reference}</td>
      <td>${bikeLink}</td>
      <td>${formatDate(b.start_at)} – ${formatDate(b.end_at)}</td>
      <td><span class="status-pill status-${b.status}">${STATUS_LABELS[b.status] ?? b.status}</span></td>
      <td>${rupees(b.amount_due_paise)}</td>
      <td>${canCancel ? `<button type="button" class="btn btn-wishlist cancel-booking-btn" data-id="${b.id}">Cancel</button>` : "—"}</td>
    </tr>
  `;
}

function wireCancelButtons() {
  document.querySelectorAll(".cancel-booking-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const statusEl = document.getElementById("myBookingsStatus");
      const { error } = await supabase.rpc("cancel_booking_hold", { p_booking_id: btn.dataset.id });
      if (error) {
        statusEl.textContent = `Couldn't cancel: ${error.message}`;
        console.error("Failed to cancel booking:", error);
        return;
      }
      getSession().then((s) => loadBookings(s.user.id));
    });
  });
}
