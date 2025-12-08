// supabaseClient.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ✅ Your existing values
const SUPABASE_URL = 'https://cjitnxbcziyiyvtahklo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqaXRueGJjeml5aXl2dGFoa2xvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1NDQ4MjQsImV4cCI6MjA3ODEyMDgyNH0.qh0tKBv860UxTuf9UwHYynZLYFng7GO_xf4ewBrsvYM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Back-compat
if (!window.supabase) window.supabase = supabase;

/* ---------------- Inactivity Logout (10 min) ---------------- */

const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutes
let idleTimer = null;

// write last activity to localStorage so it syncs across tabs
function bumpActivity() {
  localStorage.setItem('rp:lastActivity', String(Date.now()));
  resetIdleTimer();
}

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    // Double-check last activity in case of race
    const last = Number(localStorage.getItem('rp:lastActivity') || '0');
    if (Date.now() - last >= INACTIVITY_MS) {
      try { await supabase.auth.signOut(); } catch {}
      // Notify other tabs and redirect
      localStorage.setItem('rp:forceLogout', String(Date.now()));
      location.hash = '#/signin';
    } else {
      resetIdleTimer();
    }
  }, INACTIVITY_MS + 250); // small cushion
}

// Sync across tabs: another tab may force logout or activity bump
window.addEventListener('storage', (e) => {
  if (e.key === 'rp:forceLogout' && e.newValue) {
    // another tab logged out
    supabase.auth.signOut().finally(() => (location.hash = '#/signin'));
  }
  if (e.key === 'rp:lastActivity' && e.newValue) {
    resetIdleTimer();
  }
});

// Consider user actions as "activity"
['click', 'keydown', 'mousemove', 'scroll', 'touchstart', 'visibilitychange'].forEach((ev) => {
  window.addEventListener(ev, bumpActivity, { passive: true });
});

// Initialize
bumpActivity();

export default supabase;

