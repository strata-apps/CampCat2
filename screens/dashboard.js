// screens/dashboard.js
// New Dashboard: 4-card navigation grid (Call Campaigns, Events, Tasks, Contacts)

export default async function Dashboard(root) {
  root.innerHTML = `
    <section class="page-head" style="margin-top:45px; margin-left: 20px;">
    </section>

    <style>
      /* Scoped styles for this screen only */
      .rp-dash-grid{
        display:grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap:16px;
        max-width: 780px;
      }
      @media (max-width: 620px){
        .rp-dash-grid{ grid-template-columns: 1fr; }
      }

      .rp-card{
        position:relative;
        border-radius:22px;
        padding:18px;
        min-height:140px;
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        text-decoration:none;
        border: 1px solid rgba(0,0,0,0.06);
        box-shadow: 0 10px 24px rgba(0,0,0,0.08);
        transition: transform .12s ease, box-shadow .12s ease;
        overflow:hidden;
      }
      .rp-card:hover{
        transform: translateY(-2px);
        box-shadow: 0 14px 30px rgba(0,0,0,0.12);
      }

      .rp-card-title{
        font-weight: 900;
        font-size: 18px;
        color:#0f172a;
        letter-spacing: .2px;
      }
      .rp-card-sub{
        margin-top:6px;
        font-size: 13px;
        color: rgba(15,23,42,0.72);
        max-width: 22ch;
        line-height: 1.25rem;
      }

      .rp-card-icon{
        width:72px;
        height:72px;
        border-radius:18px;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size: 40px;
        box-shadow: 0 10px 20px rgba(0,0,0,0.12);
        border: 1px solid rgba(255,255,255,0.55);
      }

      .rp-badge{
        position:absolute;
        right:12px;
        bottom:12px;
        width:30px;
        height:30px;
        border-radius:999px;
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight: 900;
        font-size: 12px;
        color:#0f172a;
        background: rgba(255,255,255,0.85);
        border: 1px solid rgba(0,0,0,0.08);
      }

      /* Card colors (match your screenshot vibe) */
      .rp-yellow { background: #fde047; }
      .rp-mint   { background: #86efac; }
      .rp-coral  { background: #fb7185; }
      .rp-lav    { background: #a5b4fc; }

      .rp-yellow .rp-card-icon { background: rgba(255,255,255,0.38); }
      .rp-mint   .rp-card-icon { background: rgba(255,255,255,0.38); }
      .rp-coral  .rp-card-icon { background: rgba(255,255,255,0.38); }
      .rp-lav    .rp-card-icon { background: rgba(255,255,255,0.38); }
    </style>

    <div class="rp-dash-grid">
      <a class="rp-card rp-yellow" href="#/calls" aria-label="Go to Call Campaigns">
        <div>
          <div class="rp-card-title">Call Campaigns</div>
          <div class="rp-card-sub">Launch, manage, and execute call lists.</div>
        </div>
        <div class="rp-card-icon" aria-hidden="true">📞</div>
        <div class="rp-badge" id="badgeCalls">—</div>
      </a>

      <a class="rp-card rp-mint" href="#/events" aria-label="Go to Events">
        <div>
          <div class="rp-card-title">Events</div>
          <div class="rp-card-sub">Track upcoming events and attendance.</div>
        </div>
        <div class="rp-card-icon" aria-hidden="true">📅</div>
        <div class="rp-badge" id="badgeEvents">—</div>
      </a>

      <a class="rp-card rp-coral" href="#/tasks" aria-label="Go to Tasks">
        <div>
          <div class="rp-card-title">Tasks</div>
          <div class="rp-card-sub">Your assigned to-dos and follow-ups.</div>
        </div>
        <div class="rp-card-icon" aria-hidden="true">✅</div>
        <div class="rp-badge" id="badgeTasks">—</div>
      </a>

      <a class="rp-card rp-lav" href="#/contacts" aria-label="Go to Contacts">
        <div>
          <div class="rp-card-title">Contacts</div>
          <div class="rp-card-sub">Search, edit, and organize your people.</div>
        </div>
        <div class="rp-card-icon" aria-hidden="true">👥</div>
        <div class="rp-badge" id="badgeContacts">—</div>
      </a>
    </div>

    <div id="dashChartsMount"></div>
  `;

  // Optional: populate the little number badges (safe fallbacks if tables differ)
  const sup = () => window.supabase;

  const setBadge = (id, val) => {
    const el = root.querySelector(id);
    if (el) el.textContent = (val === null || val === undefined) ? '—' : String(val);
  };

  try {
    // Calls badge: active call campaigns (falls back to total campaigns if no dates)
    let activeCalls = null;
    if (sup()?.from) {
      const { data: camps, error } = await sup()
        .from('call_campaigns')
        .select('*')
        .limit(2000);
      if (!error && Array.isArray(camps)) {
        const now = new Date();
        const isActive = (c) => {
          const end = c?.dates?.end ? new Date(c.dates.end) : null;
          return !end || end.getTime() >= now.getTime();
        };
        activeCalls = camps.some(c => c?.dates) ? camps.filter(isActive).length : camps.length;
      }
    }
    setBadge('#badgeCalls', activeCalls);

    // Events badge: events in next 30 days
    let upcomingEvents = null;
    if (sup()?.from) {
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const { data, error } = await sup()
        .from('events')
        .select('event_id, event_date')
        .gte('event_date', now.toISOString())
        .lt('event_date', in30.toISOString())
        .limit(5000);
      if (!error && Array.isArray(data)) upcomingEvents = data.length;
    }
    setBadge('#badgeEvents', upcomingEvents);

    // Tasks badge: tasks for current user
    let myTasks = null;
    if (sup()?.auth?.getUser && sup()?.from) {
      const { data: { user } } = await sup().auth.getUser();
      if (user) {
        const { count, error } = await sup()
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        if (!error && Number.isFinite(count)) myTasks = count;
      }
    }
    setBadge('#badgeTasks', myTasks);

    // Contacts badge: total contacts (common table name: "contacts")
    let contactsTotal = null;
    if (sup()?.from) {
      const { count, error } = await sup()
        .from('contacts')
        .select('*', { count: 'exact', head: true });
      if (!error && Number.isFinite(count)) contactsTotal = count;
    }
    setBadge('#badgeContacts', contactsTotal);
  } catch {
    // If anything fails, keep badges as "—"
  }

    // -------- Charts: Calls over time (call_progress grouped by call_time, split by campaign_id) --------
  try {
    const chartsMount = root.querySelector('#dashChartsMount');
    if (!chartsMount) return;

    // Compute BASE like app.js does (so imports work from any GitHub Pages subpath)
    const BASE = location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');

    // Load chart renderer
    const charts = await import(`${BASE}/functions/charts.js`);

    // Fetch rows from call_progress
    // NOTE: Adjust columns if your schema differs; these are the ones needed for this chart.
    let progressRows = [];
    if (window.supabase?.from) {
      // Keep it reasonably sized; expand if you want "all time"
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await window.supabase
        .from('call_progress')
        .select('campaign_id, call_time')
        .gte('call_time', since)
        .order('call_time', { ascending: true })
        .limit(10000);

      if (!error && Array.isArray(data)) progressRows = data;
    }

    // Build campaign_id → campaign_name map
    let campaignMap = {};

    if (window.supabase?.from) {
      const { data: campaigns } = await window.supabase
        .from('call_campaigns')
        .select('campaign_id, campaign_name');

      if (Array.isArray(campaigns)) {
        for (const c of campaigns) {
          if (c.campaign_id && c.campaign_name) {
            campaignMap[String(c.campaign_id)] = c.campaign_name;
          }
        }
      }
    }

    // Render chart
    charts.renderCallsOverTimeLine(chartsMount, { progressRows, campaignMap });
  } catch (e) {
    console.warn('[dashboard] charts render failed:', e);
  }

}
