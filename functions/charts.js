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
