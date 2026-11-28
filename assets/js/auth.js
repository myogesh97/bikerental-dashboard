// Shared auth helpers + nav login/logout state, loaded on every page.
// Email magic-link only (no passwords, no typed code) - see
// docs/adr/0001-backend-architecture.md and docs/threat-model.md. There
// is no verifyOtp/typed-code path: the hosted project's actual Magic
// Link email template has no {{ .Token }} in it (Dashboard content this
// session can't edit), so login.js only ever sends the link and waits
// for onSignedIn - see login.js's header comment for the full story.
import { supabase } from "./supabase-client.js";

export async function requestOtp(email, fullName) {
  const options = {
    emailRedirectTo: new URL("index.html", window.location.href).toString(),
  };
  if (fullName) options.data = { full_name: fullName };
  return supabase.auth.signInWithOtp({ email, options });
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

  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", session.user.id)
    .single();

  if (userNameEl) {
    const firstName = !error && data?.full_name ? data.full_name.split(" ")[0] : null;
    userNameEl.textContent = firstName || session.user.email;
  }

  // Phase 5/6: inject "My Bookings" (every signed-in user) and "Admin
  // Dashboard" (admins only) links into the existing account dropdown -
  // done in JS rather than editing all 11 pages' nav markup, since every
  // page already has this same dropdown structure to hook into.
  const dropdown = userItem.querySelector(".dropdown");
  const logoutItem = document.getElementById("navLogout")?.closest("li");
  const isAdmin = !error && data?.role === "admin";

  if (dropdown && logoutItem && !document.getElementById("navMyBookingsLink")) {
    const myBookingsItem = document.createElement("li");
    myBookingsItem.innerHTML = `<a href="my-bookings.html" id="navMyBookingsLink">My Bookings</a>`;
    dropdown.insertBefore(myBookingsItem, logoutItem);
  }

  const existingAdminLink = document.getElementById("navAdminLink");
  if (isAdmin && dropdown && logoutItem && !existingAdminLink) {
    const adminItem = document.createElement("li");
    adminItem.innerHTML = `<a href="admin.html" id="navAdminLink">Admin Dashboard</a>`;
    dropdown.insertBefore(adminItem, logoutItem);
  } else if (!isAdmin && existingAdminLink) {
    existingAdminLink.closest("li").remove();
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
