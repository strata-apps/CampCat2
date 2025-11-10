// screens/calls.js
export default function Calls(root) {
  root.innerHTML = `
    <section class="page-head">
      <h1 class="page-title">Call Campaigns</h1>
      <div style="display:flex; justify-content:right; margin-top:10px;">
        <a class="btn-add" href="#/create-calls" style="color:black; text-decoration:none;">New Campaign</a>
      </div>
    </section>

    <section id="calls-stats" class="cards" style="margin-bottom:14px">
      <div class="card" id="stat-total-calls">
        <div class="kicker">Engagement</div>
        <div class="big">—</div>
        <div class="label">Total calls made</div>
      </div>
      <div class="card" id="stat-active-campaigns">
        <div class="kicker">Calls</div>
        <div class="big">—</div>
        <div class="label">Active campaigns</div>
      </div>
    </section>

    <section id="calls-list" class="cards"></section>
  `;

  init();

  async function init() {
    const { campaigns, activeCampaigns } = await fetchCampaigns();
    const totalCalls = await fetchTotalCalls();
    updateStat('#stat-total-calls .big', totalCalls);
    updateStat('#stat-active-campaigns .big', activeCampaigns.length);
    renderCampaigns(activeCampaigns);
  }

  function updateStat(sel, val) {
    const el = root.querySelector(sel);
    if (el) el.textContent = Number.isFinite(val) ? val.toLocaleString() : '—';
  }

  function renderCampaigns(list) {
    const mount = root.querySelector('#calls-list');
    if (!mount) return; // guard against missing container

    if (!list.length) {
      mount.innerHTML = `
        <div class="card wide">
          <div>
            <div class="kicker">No active campaigns</div>
            <div class="big" style="margin-bottom:6px">You're all caught up</div>
            <p class="label">Create a new campaign to get started.</p>
          </div>
        </div>`;
      return;
    }

    mount.innerHTML = list.map(renderWideCard).join('');

    // 🔁 All click handling stays scoped here so `mount` exists
    mount.onclick = async (e) => {
      // Start Calling
      const start = e.target.closest('[data-start]');
      if (start) {
        const id = start.getAttribute('data-start');
        if (id) location.hash = `#/call-execution/${encodeURIComponent(id)}`;
        return;
      }

      // Edit Workflow
      const wf = e.target.closest('[data-workflow]');
      if (wf) {
        const id = wf.getAttribute('data-workflow');
        if (id) location.hash = `#/workflow?campaign=${encodeURIComponent(id)}`;
        return;
      }

      // Delete Campaign
      const btn = e.target.closest('button[data-del]');
      if (btn) {
        const id = btn.getAttribute('data-del');
        if (!id) return;
        if (!confirm('Delete this campaign? This cannot be undone.')) return;
        const ok = await deleteCampaign(id);
        if (ok) {
          btn.closest('.card.wide')?.remove();
          const n = mount.querySelectorAll('.card.wide').length;
          updateStat('#stat-active-campaigns .big', n);
        } else {
          alert('Failed to delete. Please try again.');
        }
      }
    };
  }

  // Card renderer
  function renderWideCard(c) {
    const idShort = (c.campaign_id || '').toString().slice(0, 8);
    const qCount = Array.isArray(c.survey_questions) ? c.survey_questions.length : 0;
    const oCount = Array.isArray(c.survey_options) ? c.survey_options.length : 0;
    const recipients = Array.isArray(c.student_ids) ? c.student_ids.length : (c.recipient_count ?? 0);
    const updatedStr = formatRelative(c.updated_at);
    const createdStr = formatShortDate(c.created_at);

    return `
      <div class="card wide">
        <div style="flex:1; min-width:0">
          <div class="kicker">Campaign</div>
          <div class="big" style="margin-bottom:6px">${escapeHtml(c.campaign_name || 'Untitled Campaign')}</div>
          <div class="latest-row" style="gap:8px; flex-wrap:wrap">
            <span class="badge">ID: ${idShort}…</span>
            <span class="badge">Questions: ${qCount}</span>
            <span class="badge">Options: ${oCount}</span>
            <span class="badge">Recipients: ${recipients}</span>
            ${c.workflow ? `<span class="badge">Workflow ✓</span>` : `<span class="badge">No workflow</span>`}
          </div>
          <p class="label" style="margin-top:8px">
            Updated ${updatedStr} • Created ${createdStr}
          </p>
        </div>

        <div style="display:flex; align-items:flex-start; gap:8px;">
          <a class="btn-add" href="#/call-execution/${encodeURIComponent(c.campaign_id)}" data-start="${c.campaign_id}" style="text-decoration:none;">Start Calling</a>
          <button class="btn-glass" data-workflow="${c.campaign_id}">Edit Workflow</button>
          <button class="btn-delete" data-del="${c.campaign_id}">Delete</button>
        </div>
      </div>
    `;
  }

  async function fetchCampaigns() {
    if (globalThis.supabase?.from) {
      const { data, error } = await supabase
        .from('call_campaigns')
        .select('*')
        .order('updated_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        const now = new Date();
        const act = data.filter((c) => isActive(c, now));
        return { campaigns: data, activeCampaigns: act };
      }
    }
    // demo fallback
    const demo = [
      {
        campaign_id: crypto.randomUUID(),
        campaign_name: 'STEM Night RSVPs',
        filters: { interest: 'STEM' },
        student_ids: Array.from({ length: 92 }, () => crypto.randomUUID()),
        dates: { start: '2025-11-01T19:00:00Z', end: '2025-11-08T19:00:00Z' },
        created_at: '2025-11-01T18:03:00Z',
        survey_questions: ['Can you attend this event?'],
        survey_options: ['Yes','No','Maybe'],
        updated_at: '2025-11-07T22:17:00Z',
      },
      {
        campaign_id: crypto.randomUUID(),
        campaign_name: 'Fall Outreach — Seniors',
        filters: { grade: 12 },
        student_ids: Array.from({ length: 180 }, () => crypto.randomUUID()),
        dates: { start: '2025-10-12T17:00:00Z', end: '2025-11-20T17:00:00Z' },
        created_at: '2025-10-10T21:12:00Z',
        survey_questions: ['Will you attend tutoring?'],
        survey_options: ['Yes','No','Maybe'],
        updated_at: '2025-11-05T19:44:00Z',
      },
    ];
    const now = new Date();
    return { campaigns: demo, activeCampaigns: demo.filter((c) => isActive(c, now)) };
  }

  function isActive(c, now = new Date()) {
    const end = c?.dates?.end ? new Date(c.dates.end) : null;
    return !end || end.getTime() >= now.getTime();
  }

  async function fetchTotalCalls() {
    if (globalThis.supabase?.from) {
      const { count, error } = await supabase
        .from('call_progress')
        .select('*', { count: 'exact', head: true });
      if (!error && Number.isFinite(count)) return count;
    }
    return 92 + 180; // demo
  }

  async function deleteCampaign(campaignId) {
    if (!campaignId) return false;
    if (globalThis.supabase?.from) {
      const { error } = await supabase.from('call_campaigns').delete().eq('campaign_id', campaignId);
      return !error;
    }
    return true;
  }
}

function formatShortDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d) ? '—' : d.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
}
function formatRelative(iso) {
  const d = new Date(iso); if (Number.isNaN(d)) return '—';
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
function escapeHtml(s=''){return s.replace(/[&<>"']/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
