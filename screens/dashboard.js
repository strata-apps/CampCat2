// screens/dashboard.js
// Live-wired Dashboard: Call Campaigns, Email Campaigns, Tasks, Upcoming Events
// Requires window.supabase (auth + from)

export default function Dashboard(root) {
  root.innerHTML = `
    <!-- Page Header -->
    <section class="page-head">
      <h1 class="page-title">Dashboard</h1>
      <div class="subtle">Welcome back — here’s your overview.</div>
    </section>

    <div class="dashboard-container">
      <div class="dashboard-canvas"></div>

      <div class="dashboard-stage">

        <!-- Mini Navigation -->
        <nav class="mini-nav" id="miniNav">
          ${mini("Call Campaigns")}
          ${mini("Email Campaigns")}
          ${mini("Tasks")}
          ${mini("Upcoming Events")}
        </nav>

        <section id="dashMount"></section>
      </div>
    </div>
  `;

  // Default tab
  setActive("Call Campaigns");
  renderCallCampaigns();

  // Mini-nav clicks
  root.querySelector("#miniNav").addEventListener("click", (e) => {
    const btn = e.target.closest(".mini-btn");
    if (!btn) return;
    const label = btn.dataset.label;
    setActive(label);

    if (label === "Call Campaigns") renderCallCampaigns();
    if (label === "Email Campaigns") renderEmailCampaigns();
    if (label === "Tasks") renderTasks();
    if (label === "Upcoming Events") renderUpcomingEvents();
  });

  /* ---------------- Helpers ---------------- */
  function mini(label) {
    return `<a href="#" class="mini-btn" data-label="${label}">${label}</a>`;
  }
  function setActive(label) {
    root.querySelectorAll(".mini-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.label === label);
    });
  }
  function mount() {
    return root.querySelector("#dashMount");
  }
  const fmtShort = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d) ? "—" : d.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
  };
  const fmtRel = (iso) => {
    const d = new Date(iso); if (Number.isNaN(d)) return "—";
    const mins = Math.round((Date.now() - d) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    return `${days}d ago`;
  };
  const escapeHtml = (s='') => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const sup = () => globalThis.supabase;

  // Reuse Calls screen’s "active" definition (dates.end >= now or missing). :contentReference[oaicite:4]{index=4}
  function isActive(c, now = new Date()) {
    const end = c?.dates?.end ? new Date(c.dates.end) : null;
    return !end || end.getTime() >= now.getTime();
  }

  /* ---------------- Sections ---------------- */

  // CALL CAMPAIGNS: active campaigns + total calls made (call_progress)
  async function renderCallCampaigns() {
    const m = mount();
    m.innerHTML = loader();

    let activeCount = 0;
    let callsTotal = 0;

    if (sup()?.from) {
      // campaigns
      const { data: camps, error: errC } = await sup()
        .from('call_campaigns')
        .select('*')
        .order('updated_at', { ascending: false });
      if (!errC && Array.isArray(camps)) {
        const now = new Date();
        activeCount = camps.filter(c => isActive(c, now)).length; // same logic as Calls screen :contentReference[oaicite:5]{index=5}
      }

      // total calls
      const { count, error: errP } = await sup()
        .from('call_progress')
        .select('*', { count: 'exact', head: true });
      if (!errP && Number.isFinite(count)) callsTotal = count;
    }

    m.innerHTML = `
      <div class="cards">
        <div class="card">
          <div class="kicker">Campaigns</div>
          <div class="big">${Number.isFinite(activeCount) ? activeCount : '—'}</div>
          <div class="label">Active call campaigns</div>
        </div>

        <div class="card">
          <div class="kicker">Calls Completed</div>
          <div class="big">${Number.isFinite(callsTotal) ? callsTotal.toLocaleString() : '—'}</div>
          <div class="label">All time (call_progress)</div>
        </div>

        <div class="card wide">
          <div class="kicker">Quick Links</div>
          <div class="latest-row" style="gap:8px;flex-wrap:wrap">
            <a class="btn" href="#/calls">Open Call Campaigns</a>
            <a class="btn" href="#/create-calls">Create Call Campaign</a>
          </div>
          <p class="label" style="margin-top:8px">Manage campaigns and start calling from the Calls tab.</p>
        </div>
      </div>
    `;
  }

  // EMAIL CAMPAIGNS: total campaign count (email_campaigns) :contentReference[oaicite:6]{index=6}
  async function renderEmailCampaigns() {
    const m = mount();
    m.innerHTML = loader();

    let totalEmailCampaigns = 0;
    if (sup()?.from) {
      const { count, error } = await sup()
        .from('email_campaigns')
        .select('*', { count: 'exact', head: true });
      if (!error && Number.isFinite(count)) totalEmailCampaigns = count;
    }

    m.innerHTML = `
      <div class="cards">
        <div class="card">
          <div class="kicker">Campaigns</div>
          <div class="big">${Number.isFinite(totalEmailCampaigns) ? totalEmailCampaigns : '—'}</div>
          <div class="label">Total email campaigns</div>
        </div>

        <div class="card wide">
          <div class="kicker">Quick Links</div>
          <div class="latest-row" style="gap:8px;flex-wrap:wrap">
            <a class="btn" href="#/emails">Open Email Campaigns</a>
          </div>
          <p class="label" style="margin-top:8px">Create, edit, and execute newsletters from the Emails tab.</p>
        </div>
      </div>
    `;
  }

  // TASKS: active tasks for current user (delete-on-complete model) :contentReference[oaicite:7]{index=7}
  async function renderTasks() {
    const m = mount();
    m.innerHTML = loader();

    let activeCount = 0;
    if (sup()?.auth?.getUser && sup()?.from) {
      const { data: { user } } = await sup().auth.getUser();
      if (user) {
        const { count, error } = await sup()
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        if (!error && Number.isFinite(count)) activeCount = count;
      }
    }

    m.innerHTML = `
      <div class="cards">
        <div class="card">
          <div class="kicker">Open</div>
          <div class="big">${Number.isFinite(activeCount) ? activeCount : '—'}</div>
          <div class="label">Active tasks assigned to you</div>
        </div>

        <div class="card wide">
          <div class="kicker">Quick Links</div>
          <div class="latest-row" style="gap:8px;flex-wrap:wrap">
            <a class="btn" href="#/tasks">Open Tasks</a>
          </div>
          <p class="label" style="margin-top:8px">Create, assign, and complete tasks from the Tasks tab.</p>
        </div>
      </div>
    `;
  }

  // UPCOMING EVENTS: events within 30 days from today (replace Insights) :contentReference[oaicite:8]{index=8}
  async function renderUpcomingEvents() {
    const m = mount();
    m.innerHTML = loader();

    let events = [];
    if (sup()?.from) {
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const { data, error } = await sup()
        .from('events')
        .select('event_id, event_name, event_date, contact_ids, updated_at, created_at')
        .gte('event_date', now.toISOString())
        .lt('event_date', in30.toISOString())
        .order('event_date', { ascending: true })
        .limit(1000);
      if (!error && Array.isArray(data)) events = data;
    }

    const list = events.map(ev => {
      const count = Array.isArray(ev.contact_ids) ? ev.contact_ids.length : 0;
      return `
        <div class="card wide">
          <div style="flex:1;min-width:0">
            <div class="kicker">Event</div>
            <div class="big" style="margin-bottom:6px">${escapeHtml(ev.event_name || 'Untitled')}</div>
            <div class="latest-row" style="gap:8px;flex-wrap:wrap">
              <span class="badge">Date: ${fmtShort(ev.event_date)}</span>
              <span class="badge">Attendance: ${count}</span>
              <span class="badge">Updated ${fmtRel(ev.updated_at)}</span>
            </div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:8px">
            <a class="btn" href="#/events">Open Events</a>
          </div>
        </div>
      `;
    }).join('');

    m.innerHTML = `
      <div class="cards">
        <div class="card">
          <div class="kicker">Window</div>
          <div class="big">30 days</div>
          <div class="label">Showing events within a month from today</div>
        </div>

        <div class="card">
          <div class="kicker">Upcoming</div>
          <div class="big">${events.length}</div>
          <div class="label">Scheduled in next month</div>
        </div>

        ${events.length
          ? `<div class="card wide"><div class="kicker">Upcoming Events</div><div style="margin-top:6px"></div>${list}</div>`
          : `<div class="card wide"><div class="kicker">Upcoming Events</div><p class="label">No events in the next 30 days.</p></div>`
        }
      </div>
    `;
  }

  /* ---------------- Small UI helpers ---------------- */
  function loader() {
    return `
      <div class="cards">
        <div class="card">
          <div class="kicker">Loading</div>
          <div class="big">…</div>
          <div class="label">Fetching latest data</div>
        </div>
      </div>
    `;
  }
}
