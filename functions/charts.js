// functions/charts.js
// Renders left-side "Insights" panel for a campaign
// Expects Chart.js to be available globally (window.Chart)

export function renderCampaignInsights(mount, { progressRows = [] } = {}) {
  mount.innerHTML = `
    <div class="card" style="grid-column:span 12;">
      <div class="kicker">Insights</div>
      <div class="big" style="margin-bottom:8px">Campaign Summary</div>
      <div id="insight-totals" class="label" style="margin-bottom:10px"></div>

      <div class="cards" style="gap:12px">
        <div class="card" style="grid-column:span 12;">
          <div class="label">Calls by Outcome</div>
          <canvas id="chart-outcomes" height="110"></canvas>
        </div>
        <div class="card" style="grid-column:span 12;">
          <div class="label">Responses (Yes/No/Maybe...)</div>
          <canvas id="chart-responses" height="110"></canvas>
        </div>
      </div>
    </div>
  `;

  // Aggregate
  const totalCalls = progressRows.length;

  const outcomeCounts = countBy(progressRows, r => norm(r.outcome));
  const responseCounts = countBy(progressRows, r => norm(r.response));

  // Totals text
  const tot = mount.querySelector('#insight-totals');
  const lines = [
    `Total calls: ${totalCalls}`,
    ...Object.entries(outcomeCounts).map(([k,v]) => `${k || '—'}: ${v}`),
  ];
  tot.textContent = lines.join(' • ');

  // Charts (progressive easing vibe from your past version)
  try {
    const easing = (window.Chart?.helpers?.easingEffects?.easeOutQuad) || ((t)=>t);

    // Outcomes
    const ctx1 = mount.querySelector('#chart-outcomes').getContext('2d');
    makeBar(ctx1, {
      labels: Object.keys(outcomeCounts),
      data: Object.values(outcomeCounts),
      easing,
    });

    // Responses
    const ctx2 = mount.querySelector('#chart-responses').getContext('2d');
    makeBar(ctx2, {
      labels: Object.keys(responseCounts),
      data: Object.values(responseCounts),
      easing,
    });
  } catch (e) {
    console.warn('[charts] Chart.js not found? Falling back to text only.', e);
  }
}

// --- NEW: Calls over time line chart (grouped by day, split by campaign_id) ---
export function renderCallsOverTimeLine(
  mount,
  { progressRows = [], campaignMap = {} } = {}
  ) {
  mount.innerHTML = `
    <div class="card wide" style="margin-top:16px;">
      <div class="kicker">Insights</div>
      <div class="big" style="margin-bottom:8px; text-align: center; font-size: 24px;">Recent Call Activity</div>
      <div class="label" style="margin-bottom:10px">
      </div>
      <canvas id="chart-calls-over-time" height="130"></canvas>
    </div>
  `;

  try {
    if (!window.Chart) throw new Error('Chart.js not found on window.Chart');

    // 1) Bucket counts by day + campaign_id
    const byDay = new Map(); // day -> Map(campaign -> count)
    const campaigns = new Set();

    for (const r of progressRows) {
      const day = toDayKey(r.call_time);
      const camp = String(r.campaign_id ?? '—');
      campaigns.add(camp);

      if (!byDay.has(day)) byDay.set(day, new Map());
      const m = byDay.get(day);
      m.set(camp, (m.get(camp) || 0) + 1);
    }

    // 2) Sorted day labels
    const labels = Array.from(byDay.keys()).sort(); // YYYY-MM-DD sorts correctly

    // 3) Build datasets (one line per campaign)
    const campList = Array.from(campaigns).sort();
    const palette = [
      '#2563eb', '#16a34a', '#f97316', '#a855f7',
      '#ef4444', '#0ea5e9', '#84cc16', '#f59e0b',
    ];

    const datasets = campList.map((camp, i) => ({
      label: campaignMap[camp] || `Campaign ${camp}`, // ← name first, fallback to ID
      data: labels.map((d) => (byDay.get(d)?.get(camp) || 0)),
      borderColor: palette[i % palette.length],
      backgroundColor: palette[i % palette.length],
      tension: 0.25,
      pointRadius: 2,
      pointHoverRadius: 4,
    }));


    const ctx = mount.querySelector('#chart-calls-over-time').getContext('2d');
    makeLine(ctx, { labels, datasets });
  } catch (e) {
    console.warn('[charts] Calls-over-time chart failed:', e);
    // Fall back to a tiny text summary
    const total = progressRows.length;
    mount.querySelector('.label').textContent = `Total calls in view: ${total}`;
  }
}

// ------------------------------------------------------
// NEW: timeInteractions — click points to view details
// Pulls last 365 days of interactions for a contact
// ------------------------------------------------------
// ------------------------------------------------------
// REPLACEMENT: timeInteractions — chart view of interaction history
// Mirrors interactions.js behavior (single_calls + call_progress),
// and optionally includes interactions table if present.
// ------------------------------------------------------
export async function timeInteractions(mount, { contact_id, campaign_id = null } = {}) {
  mount.innerHTML = `
    <div class="card wide" style="margin-top:16px;">
      <div class="kicker">Insights</div>
      <div class="big" style="margin-bottom:8px; text-align:center; font-size:24px;">
        Interactions (Last 365 Days)
      </div>

      <div class="label" style="margin-bottom:10px; text-align:center;">
        Click a point to view details.
      </div>

      <canvas id="chart-interactions" height="110"></canvas>

      <div id="interaction-detail" class="card" style="grid-column:span 12; margin-top:12px; display:none;">
        <div class="label" style="font-weight:800; margin-bottom:6px;">Interaction Details</div>
        <div id="interaction-detail-body" class="label"></div>
      </div>
    </div>
  `;

  const canvas = mount.querySelector('#chart-interactions');
  const detail = mount.querySelector('#interaction-detail');
  const detailBody = mount.querySelector('#interaction-detail-body');

  const setStatus = (msg) => {
    const label = mount.querySelector('.label');
    if (label) label.textContent = msg;
  };

  try {
    if (!window.Chart) throw new Error('Chart.js not found on window.Chart');
    if (!window.supabase) throw new Error('Supabase client not found on window.supabase');
    if (!contact_id) throw new Error('timeInteractions requires contact_id');

    const s = window.supabase;

    // Rolling window (we filter AFTER we normalize timestamps so we don’t accidentally drop rows)
    const sinceDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    // -----------------------------------------
    // 1) Pull data like interactions.js does
    // -----------------------------------------

    // --- single_calls (has outcome/response/notes) ---
    let scq = s.from('single_calls')
      .select('call_time, user_id, outcome, response, notes, contact_id')
      .eq('contact_id', contact_id)
      .order('call_time', { ascending: false })
      .limit(500);

    const { data: scData, error: scErr } = await scq;
    if (scErr) throw scErr;

    // --- call_progress (campaign calls) ---
    let cpq = s.from('call_progress')
      .select('campaign_id, contact_id, outcome, notes, last_called_at, update_time, call_time')
      .eq('contact_id', contact_id)
      .order('update_time', { ascending: false })
      .limit(1000);

    if (campaign_id) cpq = cpq.eq('campaign_id', campaign_id);

    const { data: cpData, error: cpErr } = await cpq;
    if (cpErr) throw cpErr;

    // -----------------------------------------
    // 2) Optionally pull interactions (if your execution screen writes there)
    //    Use created_at fallback because call_time is often null/missing.
    // -----------------------------------------
    let iData = [];
    try {
      let iq = s.from('interactions')
        .select('call_time, created_at, user_id, campaign_id, contact_id')
        .eq('contact_id', contact_id)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (campaign_id) iq = iq.eq('campaign_id', campaign_id);

      const { data, error } = await iq;
      if (!error && Array.isArray(data)) iData = data;
    } catch (_ignored) {
      // If table doesn't exist or schema differs, we simply skip it.
      iData = [];
    }

    // -----------------------------------------
    // 3) Normalize timestamps (THIS is the key difference)
    // -----------------------------------------
    const pickTime = (r) =>
      r?.call_time ||
      r?.last_called_at ||
      r?.update_time ||
      r?.created_at ||
      r?.at ||
      null;

    const fromSingle = (r) => ({
      at: pickTime(r),
      source: 'single_call',
      user_id: r.user_id || null,
      campaign_id: null,
      outcome: r.outcome || null,
      response: r.response || null,
      notes: r.notes || null,
    });

    const fromCampaign = (r) => ({
      at: pickTime(r),
      source: 'campaign_call',
      user_id: null,
      campaign_id: r.campaign_id || null,
      outcome: r.outcome || null,
      response: null,
      notes: r.notes || null,
    });

    const fromInteraction = (r) => ({
      at: pickTime(r),
      source: 'interaction',
      user_id: r.user_id || null,
      campaign_id: r.campaign_id || null,
      outcome: null,
      response: null,
      notes: null,
    });

    // Merge + filter
    const mergedRaw = [
      ...(Array.isArray(scData) ? scData.map(fromSingle) : []),
      ...(Array.isArray(cpData) ? cpData.map(fromCampaign) : []),
      ...(Array.isArray(iData) ? iData.map(fromInteraction) : []),
    ].filter(x => !!x.at);

    const merged = mergedRaw.filter(x => {
      const d = new Date(x.at);
      return !Number.isNaN(d) && d >= sinceDate;
    });

    // Debug counters so you can see what’s feeding the chart
    console.log('[timeInteractions] counts', {
      single_calls: scData?.length || 0,
      call_progress: cpData?.length || 0,
      interactions: iData?.length || 0,
      merged_in_window: merged.length,
    });

    // Sort oldest -> newest for an x-axis timeline
    merged.sort((a, b) => new Date(a.at) - new Date(b.at));

    if (!merged.length) {
      setStatus('No interactions in the last 365 days.');
      return;
    }

    // -----------------------------------------
    // 4) Build chart points
    // -----------------------------------------
    const labels = merged.map(x => formatLabel(x.at));
    const values = merged.map(() => 1);

    if (canvas.__chart) {
      canvas.__chart.destroy();
      canvas.__chart = null;
    }

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Interaction',
          data: values,
          tension: 0.2,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2,
          fill: false,
        }]
      },
      options: {
        responsive: true,
        animation: { duration: 800, easing: 'easeOutQuad' },
        plugins: {
          legend: { display: false },
          tooltip: {
            intersect: true,
            mode: 'nearest',
            callbacks: {
              label: (ctx) => {
                const row = merged[ctx.dataIndex];
                const out = row?.outcome ? `Outcome: ${row.outcome}` : 'Outcome: —';
                const resp = row?.response ? `Response: ${row.response}` : 'Response: —';
                const src =
                  row?.source === 'single_call' ? 'Source: Single Call' :
                  row?.source === 'campaign_call' ? 'Source: Campaign Call' :
                  'Source: Interaction';
                return [src, out, resp];
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 2,
            ticks: { display: false },
            grid: { display: false },
          },
          x: { grid: { display: false } }
        },
        onClick: (_evt, els) => {
          if (!els?.length) return;
          const idx = els[0].index;
          const row = merged[idx];
          if (!row) return;

          const sourceLabel =
            row.source === 'single_call' ? 'Single Call' :
            row.source === 'campaign_call' ? 'Campaign Call' :
            'Interaction';

          detail.style.display = 'block';
          detailBody.innerHTML = `
            <div><b>When:</b> ${row.at ? new Date(row.at).toLocaleString() : '—'}</div>
            <div><b>Source:</b> ${escapeHtml(sourceLabel)}</div>
            <div><b>Campaign:</b> ${escapeHtml(row.campaign_id || '—')}</div>
            <div><b>Outcome:</b> ${escapeHtml(row.outcome || '—')}</div>
            <div><b>Response:</b> ${escapeHtml(row.response || '—')}</div>
            <div><b>Notes:</b> ${escapeHtml(row.notes || '—')}</div>
          `;
          detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    });

    canvas.__chart = chart;
  } catch (e) {
    console.warn('[charts] timeInteractions failed:', e);
    setStatus('Could not load interaction timeline.');
  }
}


function formatLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d)) return '—';
  // compact: "Jan 5" / "Jan 5, 14:30" depending on density
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function toDayKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d)) return '—';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function makeLine(ctx, { labels = [], datasets = [] }) {
  if (!window.Chart) return;
  return new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      animation: { duration: 900, easing: 'easeOutQuad' },
      plugins: {
        legend: { display: true, position: 'bottom' },
        tooltip: { intersect: false, mode: 'index' },
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
}


function countBy(arr, fn) {
  const m = {};
  for (const x of arr) {
    const k = fn(x);
    m[k ?? '—'] = (m[k ?? '—'] || 0) + 1;
  }
  return m;
}
const norm = (s) => (s == null ? null : String(s).trim().toLowerCase());

// Minimal bar chart with progressive animation (no custom colors per your rule)
function makeBar(ctx, { labels = [], data = [], easing }) {
  if (!window.Chart) return;
  const ch = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Count', data }]
    },
    options: {
      responsive: true,
      animation: {
        duration: 900,
        easing: 'easeOutQuad' // keep the feel from previous insights.js
      },
      plugins: {
        legend: { display: false },
        tooltip: { intersect: false, mode: 'index' }
      },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
    }
  });
  return ch;
}
