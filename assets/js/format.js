// Shared formatting helpers for admin.js/my-bookings.js/booking.js. Pulled
// out after a code review found formatDate/rupees/STATUS_LABELS pasted
// near-verbatim into all three files and already drifting (admin.js and
// my-bookings.js had diverged on the cancelled-status wording) - and after
// the same review found a stored-XSS hole: admin.js was interpolating a
// customer-controlled value (profiles.full_name, settable by any visitor
// at login) straight into innerHTML with no escaping, executing in the
// ADMIN's own authenticated session. escapeHtml exists specifically so
// every file that renders user-controlled text into innerHTML has no
// excuse to skip it.
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function formatRange(startIso, endIso) {
  return `${formatDate(startIso)} – ${formatDate(endIso)}`;
}

// PostgREST serializes a tstzrange as e.g. ["2027-05-01 00:00:00+05:30","2027-05-05 00:00:00+05:30")
export function formatPgRange(rangeText) {
  const match = rangeText.match(/[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]/);
  if (!match) return rangeText;
  return formatRange(match[1], match[2]);
}

export function rupees(paise) {
  return `₹${(paise / 100).toFixed(0)}`;
}

// A base label map every page shares, with room for a per-page override
// (e.g. a customer-facing page wanting shorter wording) applied via
// `{...STATUS_LABELS, cancelled_by_customer: "Cancelled"}` at the call
// site, rather than a second hand-maintained copy of the whole map.
export const STATUS_LABELS = {
  held: "Held",
  confirmed: "Confirmed",
  picked_up: "Picked up",
  returned: "Returned",
  expired: "Expired",
  cancelled_by_customer: "Cancelled (customer)",
  cancelled_by_admin: "Cancelled (admin)",
  no_show: "No-show",
};

export function statusPill(status, labels = STATUS_LABELS) {
  return `<span class="status-pill status-${escapeHtml(status)}">${escapeHtml(labels[status] ?? status)}</span>`;
}
