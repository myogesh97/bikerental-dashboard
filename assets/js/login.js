// Two-step email-OTP login form for login.html. Session/nav state is
// handled separately by auth.js (loaded on every page); this file only
// drives the request-code -> verify-code UI on this one page.
import { requestOtp, verifyOtp, getSession, onSignedIn } from "./auth.js";

const RESEND_COOLDOWN_SECONDS = 30;

const redirectAfterLogin = () => {
  const params = new URLSearchParams(window.location.search);
  window.location.replace(params.get("redirect") || "index.html");
};

document.addEventListener("DOMContentLoaded", async () => {
  const requestForm = document.getElementById("otpRequestForm");
  const verifyForm = document.getElementById("otpVerifyForm");
  if (!requestForm || !verifyForm) return;

  // A logged-in user landing here directly (bookmark, back button, already
  // had a session from an earlier visit) should never see the login form.
  const existingSession = await getSession();
  if (existingSession) {
    redirectAfterLogin();
    return;
  }

  // Covers the email's link being clicked in a DIFFERENT tab: that tab
  // creates the session, supabase-js syncs it here via storage, and this
  // listener fires so we don't stay stuck showing the code-entry step.
  onSignedIn(redirectAfterLogin);

  const emailInput = document.getElementById("loginEmail");
  const fullNameInput = document.getElementById("loginFullName");
  const codeInput = document.getElementById("loginCode");
  const verifyingEmailLabel = document.getElementById("verifyingEmailLabel");
  const sendCodeBtn = document.getElementById("sendCodeBtn");
  const verifyCodeBtn = document.getElementById("verifyCodeBtn");
  const resendCodeBtn = document.getElementById("resendCodeBtn");
  const statusEl = document.getElementById("authStatus");

  let resendTimer = null;

  const setStatus = (message, isError) => {
    statusEl.textContent = message;
    statusEl.classList.toggle("auth-status-error", Boolean(isError));
  };

  const startResendCooldown = () => {
    let remaining = RESEND_COOLDOWN_SECONDS;
    resendCodeBtn.disabled = true;
    resendCodeBtn.textContent = `Resend Code (${remaining}s)`;
    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(resendTimer);
        resendCodeBtn.disabled = false;
        resendCodeBtn.textContent = "Resend Code";
      } else {
        resendCodeBtn.textContent = `Resend Code (${remaining}s)`;
      }
    }, 1000);
  };

  const sendCode = async () => {
    const email = emailInput.value.trim();
    const fullName = fullNameInput.value.trim();
    if (!email) return;

    sendCodeBtn.disabled = true;
    setStatus("Sending code…", false);

    const { error } = await requestOtp(email, fullName);

    sendCodeBtn.disabled = false;

    if (error) {
      setStatus(error.message || "Couldn't send the code. Please try again.", true);
      return;
    }

    verifyingEmailLabel.textContent = `Code sent to ${email}.`;
    requestForm.hidden = true;
    verifyForm.hidden = false;
    codeInput.focus();
    setStatus("Check your email for an 8-digit code.", false);
    startResendCooldown();
  };

  requestForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendCode();
  });

  resendCodeBtn.addEventListener("click", () => {
    sendCode();
  });

  verifyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const token = codeInput.value.trim();
    if (!email || !token) return;

    verifyCodeBtn.disabled = true;
    setStatus("Verifying…", false);

    const { error } = await verifyOtp(email, token);

    verifyCodeBtn.disabled = false;

    if (error) {
      setStatus(error.message || "That code didn't work. Please check it and try again.", true);
      return;
    }

    setStatus("Logged in! Redirecting…", false);
    redirectAfterLogin();
  });
});
