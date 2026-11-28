// Single-step email login form for login.html. No typed code: the email
// is a plain click-to-log-in link only (see auth.js/requestOtp's
// emailRedirectTo). This replaced an earlier two-step request-code ->
// type-code design (2026-11-28) after discovering the hosted project's
// actual Magic Link email template has no {{ .Token }} in it - editing
// that template's content needs Supabase Dashboard access this session
// doesn't have, so the fix was to stop asking for a code the email never
// actually shows, not to keep chasing template content blind. Magic-link
// and typed-OTP are treated as equally secure in docs/threat-model.md
// (possession of the inbox is the credential either way), so this isn't
// a security downgrade - it's dropping a UI step the email never
// supported in practice. Session/nav state is handled separately by
// auth.js (loaded on every page).
import { requestOtp, getSession, onSignedIn } from "./auth.js";

const RESEND_COOLDOWN_SECONDS = 30;

const redirectAfterLogin = () => {
  const params = new URLSearchParams(window.location.search);
  window.location.replace(params.get("redirect") || "index.html");
};

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("otpRequestForm");
  if (!form) return;

  // A logged-in user landing here directly (bookmark, back button, already
  // had a session from an earlier visit) should never see the login form.
  const existingSession = await getSession();
  if (existingSession) {
    redirectAfterLogin();
    return;
  }

  // Covers the email's link being clicked in a DIFFERENT tab: that tab
  // creates the session, supabase-js syncs it here via storage, and this
  // listener fires so the still-open login tab updates too.
  onSignedIn(redirectAfterLogin);

  const emailInput = document.getElementById("loginEmail");
  const fullNameInput = document.getElementById("loginFullName");
  const sendLinkBtn = document.getElementById("sendLinkBtn");
  const statusEl = document.getElementById("authStatus");

  let resendTimer = null;

  const setStatus = (message, isError) => {
    statusEl.textContent = message;
    statusEl.classList.toggle("auth-status-error", Boolean(isError));
  };

  const startResendCooldown = () => {
    let remaining = RESEND_COOLDOWN_SECONDS;
    sendLinkBtn.disabled = true;
    sendLinkBtn.textContent = `Resend Link (${remaining}s)`;
    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(resendTimer);
        sendLinkBtn.disabled = false;
        sendLinkBtn.textContent = "Send Login Link";
      } else {
        sendLinkBtn.textContent = `Resend Link (${remaining}s)`;
      }
    }, 1000);
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const fullName = fullNameInput.value.trim();
    if (!email) return;

    sendLinkBtn.disabled = true;
    setStatus("Sending…", false);

    const { error } = await requestOtp(email, fullName);

    if (error) {
      sendLinkBtn.disabled = false;
      sendLinkBtn.textContent = "Send Login Link";
      setStatus(error.message || "Couldn't send the login link. Please try again.", true);
      return;
    }

    setStatus(
      `Check your email (${email}) and click the link to log in. This page updates automatically once you do.`,
      false
    );
    startResendCooldown();
  });
});
