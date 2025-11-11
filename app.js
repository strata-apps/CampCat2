// app.js (ES module)

// Compute a repo-agnostic base like "/ReachPoint-general"
const BASE = location.pathname
  .replace(/\/index\.html$/, '')
  .replace(/\/$/, '');

// Ensure Supabase client is available (in case index.html didn't import it first)
let supabase = globalThis.supabase;
if (!supabase) {
  const mod = await import(`${BASE}/supabaseClient.js`);
  supabase = mod?.supabase || globalThis.supabase;
  if (!supabase) {
    throw new Error('Supabase client failed to load');
  }
}

// --- AUTH EVENT LISTENER ---
// Redirect the user immediately if their session expires, logs out, or refresh fails.
try {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      // Session expired or logged out
      if (location.hash !== '#/signin') location.hash = '#/signin';
    } else {
      // Signed in while on signin page
      if (location.hash === '#/signin') location.hash = '#/dashboard';
    }
  });
} catch (e) {
  console.warn('onAuthStateChange attach failed:', e);
}


// ---- Routes ----
const routes = {
  '#/dashboard': async (root) => {
    const module = await import(`${BASE}/screens/dashboard.js`);
    return module.default(root);
  },

  '#/calls': async (root) => {
    const module = await import(`${BASE}/screens/calls.js`);
    return module.default(root);
  },

  '#/create-calls': async (root) => {
    const module = await import(`${BASE}/screens/create_calls.js`);
    return module.default(root);
  },

  // Workflow Designer
  '#/workflow': async (root) => {
    const module = await import(`${BASE}/screens/designworkflow.js`);
    return module.default(root);
  },

  // Email campaigns
  '#/emails': async (root) => {
    const module = await import(`${BASE}/screens/emails.js`);
    return module.default(root);
  },

  '#/create-emails': async (root) => {
    const module = await import(`${BASE}/screens/create_emails.js`);
    return module.default(root);
  },

  '#/call-execution': async (root) => {
    const module = await import(`${BASE}/screens/call_execution.js`);
    return module.default(root);
  },

  // Auth
  '#/signin': async (root) => {
    const module = await import(`${BASE}/screens/signin.js`);
    return module.default(root);
  },

  // tasks
  '#/tasks': async (root) => {
    const module = await import(`${BASE}/screens/tasks.js`);
    return module.default(root);
  },

  // contacts
  '#/contacts': async (root) => {
    const module = await import(`${BASE}/screens/contacts.js`);
    return module.default(root);
  },

  // events
  '#/events': async (root) => {
    const module = await import(`${BASE}/screens/events.js`);
    return module.default(root);
  }, 

  // Stubs
  // '#/tasks': (root) => showPlaceholder(root, 'Tasks'),
  //'#/insights': (root) => showPlaceholder(root, 'Insights'),
  //'#/contacts': (root) => showPlaceholder(root, 'Contacts'),
};

const DEFAULT_ROUTE = '#/dashboard';
const appRoot = document.getElementById('app');
const topbar = document.getElementById('topbar');
const menuBtn = document.getElementById('menu-btn');

function setActiveTab(hash) {
  const links = document.querySelectorAll('.tab-link');
  const hp = String(hash || '');
  const m = hp.match(/^#\/([A-Za-z0-9\-]+)/);   // get 1st segment only
  const normalized = m ? `#/${m[1]}` : hp;
  links.forEach((a) => {
    const route = a.getAttribute('data-route');
    a.classList.toggle('active', route === normalized);
  });
}

async function renderRoute() {
  const rawHash = location.hash || DEFAULT_ROUTE;

  // keep query separate, then normalize dynamic routes
  const hashPath = rawHash.split('?')[0];
  const m = hashPath.match(/^#\/([A-Za-z0-9\-]+)/);     // "#/call-execution/123" -> "call-execution"
  const base = m ? `#/${m[1]}` : hashPath;

  if (!routes[base]) {
    location.hash = DEFAULT_ROUTE;
    return;
  }

  // ---- Auth gate ----
  // Only allow unauthenticated users on #/signin
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user && base !== '#/signin') {
      location.hash = '#/signin';
      return;
    }
    if (user && base === '#/signin') {
      location.hash = '#/dashboard';
      return;
    }
  } catch (e) {
    console.warn('Auth check failed:', e);
    // If auth check fails, send to signin (failsafe)
    if (base !== '#/signin') {
      location.hash = '#/signin';
      return;
    }
  }

  setActiveTab(rawHash);
  appRoot.innerHTML = '';

  try {
    await routes[base](appRoot);
  } catch (err) {
    console.error(err);
    appRoot.innerHTML = `<div class="centered">There was an error loading this screen.</div>`;
  }

  // Close mobile menu after navigating
  if (topbar?.classList.contains('open')) {
    topbar.classList.remove('open');
    menuBtn?.setAttribute('aria-expanded', 'false');
  }
}

function showPlaceholder(root, title) {
  root.innerHTML = `
    <section class="page-head"><h1 class="page-title">${title}</h1></section>
    <div class="card wide">
      <div>
        <div class="kicker">Coming soon</div>
        <div class="big" style="margin-bottom:6px">This screen is a stub</div>
        <p class="label" style="max-width:720px">
          Create <code>${BASE}/screens/${title.toLowerCase().replace(' ', '-')}.js</code>
          and export <code>default (root) =&gt; { /* render */ }</code>.
        </p>
      </div>
    </div>`;
}

// Top bar links update hash (force re-render if the same tab is clicked)
document.getElementById('top-tabs')?.addEventListener('click', (e) => {
  const a = e.target.closest('.tab-link');
  if (!a) return;
  e.preventDefault();

  const route = a.getAttribute('data-route');
  if (!route) return;

  const currentBase = (location.hash || '').split('?')[0];
  if (route === currentBase) {
    // Same route: force a re-render so the screen reloads cleanly
    renderRoute();
  } else {
    location.hash = route;
  }
});

// If we come back to a blank app (rare race), refresh the current route
window.addEventListener('visibilitychange', () => {
  if (!document.hidden && appRoot && !appRoot.hasChildNodes()) {
    renderRoute();
  }
});

// Mobile menu toggle
menuBtn?.addEventListener('click', () => {
  const open = topbar.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', String(open));
});

// Route on initial load + on hash change
window.addEventListener('hashchange', renderRoute);
window.addEventListener('DOMContentLoaded', () => {
  if (!location.hash) location.hash = DEFAULT_ROUTE;
  renderRoute();
});

// Log out button
document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
  e.preventDefault();
  try { await supabase.auth.signOut(); } catch {}
  location.hash = '#/signin';
});

