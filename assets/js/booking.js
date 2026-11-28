// Phase 3: the booking-hold widget on bike.html. All pricing/availability
// decisions are made server-side (create_booking_hold/get_bike_blocked_ranges,
// supabase/migrations/20261128120000_booking_functions.sql) - this file only
// renders what the backend returns and never computes a price itself, per
// the "client never sends a price" hard rule (it also never INVENTS one for
// display - the on-page nights x price preview mirrors the same math the
// database will do, so there's no discrepancy, but the database result is
// always what actually gets stored).
import { supabase } from "./supabase-client.js";
import { getSession } from "./auth.js";
import { formatDate, formatRange } from "./format.js";

function istToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function initBookingWidget(container, bike) {
  const session = await getSession();
  const today = istToday();

  // get_bike_blocked_ranges is anon-callable by design (checking
  // availability shouldn't require an account) - render the ranges list
  // and the login-gated form/prompt as independent pieces so a logged-out
  // visitor actually gets to see it, instead of never reaching the code
  // path that calls it.
  container.innerHTML = `
    <h2>Book this bike</h2>
    <p id="bookingUnavailableRanges" class="booking-unavailable-note" aria-live="polite"></p>
    ${
      session
        ? `
    <form id="bookingForm" class="booking-form">
      <div class="booking-dates">
        <div class="booking-date-field">
          <label for="bookingStart" class="form-label">Pickup date</label>
          <input type="date" id="bookingStart" class="form-control" min="${today}" required>
        </div>
        <div class="booking-date-field">
          <label for="bookingEnd" class="form-label">Return date</label>
          <input type="date" id="bookingEnd" class="form-control" min="${today}" required>
        </div>
      </div>
      <p id="bookingSummary" class="booking-summary" aria-live="polite"></p>
      <p id="bookingError" class="booking-error" role="alert" hidden></p>
      <button type="submit" id="bookingSubmit" class="btn btn-primary">Check availability &amp; hold</button>
    </form>
    <div id="bookingHoldPanel" class="booking-hold-panel" hidden aria-live="polite"></div>
    `
        : `<p class="unavailable-note">Please <a href="login.html">log in</a> to book this bike online, or use the contact button below.</p>`
    }
  `;

  const rangesEl = container.querySelector("#bookingUnavailableRanges");

  async function loadUnavailableRanges() {
    const { data, error } = await supabase.rpc("get_bike_blocked_ranges", { p_bike_id: bike.id });
    if (error) {
      console.error("Failed to load availability:", error);
      rangesEl.textContent = "";
      return;
    }
    rangesEl.textContent = data && data.length
      ? `Currently unavailable: ${data.map((r) => formatRange(r.start_at, r.end_at)).join(", ")}`
      : "";
  }

  loadUnavailableRanges();

  if (!session) return;

  const form = container.querySelector("#bookingForm");
  const startInput = container.querySelector("#bookingStart");
  const endInput = container.querySelector("#bookingEnd");
  const summaryEl = container.querySelector("#bookingSummary");
  const errorEl = container.querySelector("#bookingError");
  const submitBtn = container.querySelector("#bookingSubmit");
  const holdPanel = container.querySelector("#bookingHoldPanel");

  let holdTimer = null;
  let currentBooking = null;

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.hidden = true;
    errorEl.textContent = "";
  }

  function updateSummary() {
    const start = startInput.value;
    const end = endInput.value;
    if (!start || !end) {
      summaryEl.textContent = "";
      return;
    }
    const nights = Math.round((new Date(end) - new Date(start)) / 86400000);
    if (nights <= 0) {
      summaryEl.textContent = "";
      return;
    }
    const amountRupees = ((nights * bike.price_paise) / 100).toFixed(0);
    summaryEl.textContent = `${nights} night${nights === 1 ? "" : "s"} × ₹${(bike.price_paise / 100).toFixed(0)}/day = ₹${amountRupees}`;
  }

  function renderCountdown(booking) {
    const msLeft = new Date(booking.hold_expires_at).getTime() - Date.now();
    if (msLeft <= 0) {
      clearInterval(holdTimer);
      holdPanel.innerHTML = `<p>Your hold on this booking has expired.</p><button type="button" id="bookingRestart" class="btn btn-wishlist">Start over</button>`;
      holdPanel.querySelector("#bookingRestart").addEventListener("click", () => window.location.reload());
      return;
    }
    const minutes = Math.floor(msLeft / 60000);
    const seconds = Math.floor((msLeft % 60000) / 1000);
    holdPanel.innerHTML = `
      <p>Booking held &mdash; reference <strong>${booking.reference}</strong>.</p>
      <p>${formatRange(booking.start_at, booking.end_at)} &middot; ₹${(booking.advance_amount_paise / 100).toFixed(0)} due</p>
      <p>Hold expires in <strong>${minutes}:${String(seconds).padStart(2, "0")}</strong>. Online payment isn't available yet &mdash; <a href="contact.html">contact us</a> to confirm this booking before the hold expires.</p>
      <button type="button" id="bookingCancel" class="btn btn-wishlist">Cancel hold</button>
    `;
    holdPanel.querySelector("#bookingCancel").addEventListener("click", cancelHold);
  }

  function showHold(booking) {
    currentBooking = booking;
    form.hidden = true;
    rangesEl.hidden = true;
    holdPanel.hidden = false;
    renderCountdown(booking);
    holdTimer = setInterval(() => renderCountdown(booking), 1000);
  }

  async function cancelHold() {
    if (!currentBooking) return;
    const bookingId = currentBooking.id;
    const cancelBtn = holdPanel.querySelector("#bookingCancel");
    if (cancelBtn) cancelBtn.disabled = true;

    const { error } = await supabase.rpc("cancel_booking_hold", { p_booking_id: bookingId });

    if (error) {
      console.error("Failed to cancel hold:", error);
      // Don't tear down currentBooking/holdTimer on failure - the hold is
      // still live server-side, so the countdown should keep running and
      // the Cancel button should keep working on retry, not silently
      // no-op forever because this cleared its own state too early. The
      // form (and its #bookingError) is hidden while a hold panel is
      // shown, so the error has to render inside the hold panel itself.
      if (cancelBtn) {
        cancelBtn.disabled = false;
        cancelBtn.insertAdjacentHTML(
          "afterend",
          `<p class="booking-error" role="alert">Couldn't cancel the hold. Please try again.</p>`
        );
      }
      return;
    }

    clearInterval(holdTimer);
    currentBooking = null;
    holdPanel.hidden = true;
    form.hidden = false;
    rangesEl.hidden = false;
    form.reset();
    updateSummary();
    loadUnavailableRanges();
  }

  startInput.addEventListener("change", () => {
    endInput.min = startInput.value;
    clearError();
    updateSummary();
  });
  endInput.addEventListener("change", () => {
    clearError();
    updateSummary();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    submitBtn.disabled = true;
    submitBtn.textContent = "Checking availability…";

    const { data, error } = await supabase.rpc("create_booking_hold", {
      p_bike_id: bike.id,
      p_start_date: startInput.value,
      p_end_date: endInput.value,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "Check availability & hold";

    if (error) {
      showError(error.message || "Couldn't create a hold for these dates. Please try different dates.");
      loadUnavailableRanges();
      return;
    }

    showHold(data);
  });

  loadUnavailableRanges();
}
