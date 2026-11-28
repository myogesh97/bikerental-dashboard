// Shared auth helpers + nav login/logout state, loaded on every page.
// Email OTP only (no passwords) - see docs/adr/0001-backend-architecture.md
// and docs/threat-model.md. verifyOtp's `type: "email"` covers the typed
// 8-digit code flow (distinct from the legacy "magiclink" type). The
// code length is set by auth.email.otp_length on the hosted project,
// independent of supabase/config.jsonc's local default.
import { supabase } from "./supabase-client.js";

export async function requestOtp(email, fullName) {
  const options = {
    emailRedirectTo: new URL("index.html", window.location.href).toString(),
  };
  if (fullName) options.data = { full_name: fullName };
  return supabase.auth.signInWithOtp({ email, options });
}

export async function verifyOtp(email, token) {
  return supabase.auth.verifyOtp({ email, token, type: "email" });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Fires on a session appearing via ANY path - typed-code verify in this
// tab, or the magic-link in the same email clicked in another tab (synced
// here via supabase-js's cross-tab storage listener). login.html needs
// this so it doesn't stay stuck on the code-entry step if the link gets
// clicked elsewhere first.
export function onSignedIn(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) callback(session);
  });
}

async function updateNavAuthUI(session) {
  const guestItem = document.getElementById("navAuthGuest");
  const userItem = document.getElementById("navAuthUser");
  const userNameEl = document.getElementById("navUserName");

  if (guestItem) guestItem.hidden = Boolean(session);
  if (userItem) userItem.hidden = !session;
  if (!session || !userItem) return;

  if (userNameEl) {
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", session.user.id)
      .single();
    const firstName = !error && data?.full_name ? data.full_name.split(" ")[0] : null;
    userNameEl.textContent = firstName || session.user.email;
  }
}

export function initNavAuthUI() {
  const logoutLink = document.getElementById("navLogout");
  if (logoutLink) {
    logoutLink.addEventListener("click", async (e) => {
      e.preventDefault();
      await signOut();
      window.location.href = "index.html";
    });
  }

  supabase.auth.getSession().then(({ data }) => updateNavAuthUI(data.session));
  supabase.auth.onAuthStateChange((_event, session) => updateNavAuthUI(session));
}

document.addEventListener("DOMContentLoaded", initNavAuthUI);
