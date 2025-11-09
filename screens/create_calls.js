// screens/create_calls.js
import { upsertCampaignDraft, fetchContacts as dbFetchContacts } from '../functions/db.js';
import { mountContactFilters, getSelectedFilter } from '../functions/filters.js';

export default function CreateCalls(root) {
  root.innerHTML = `
    <style>
      /* Force all cards to white to match your current theme ask */
      .card, .card.wide { background: #ffffff !important; }
      .select-pill {
        appearance: none;
        border: 1px solid rgba(0,0,0,.12);
        border-radius: 12px;
        padding: 10px 12px;
        font-weight: 700;
        letter-spacing: .2px;
        background: var(--lg-bg);
        backdrop-filter: blur(calc(var(--lg-blur)*.6)) saturate(var(--lg-sat));
        -webkit-backdrop-filter: blur(calc(var(--lg-blur)*.6)) saturate(var(--lg-sat));
      }
    </style>

    <section class="page-head">
      <h1 class="page-title">Create Call Campaign</h1>
    </section>

    <!-- Campaign name -->
    <div class="cards" style="margin-bottom:14px">
      <div class="card" style="grid-column:span 12;">
        <div class="kicker">Campaign</div>
        <label class="label" style="display:block;margin-top:8px;">Campaign name</label>
        <input id="cc-name" type="text" placeholder="e.g., STEM Night RSVPs"
               style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(0,0,0,.12);">
      </div>
    </div>

    <!-- Step 1: Filter Contacts (dropdown-driven) -->
    <div class="card wide">
      <div style="flex:1;min-width:0">
        <div class="kicker">Step 1</div>
        <div class="big" style="margin-bottom:6px">Filter Contacts</div>

        <!-- Dynamic dropdown filter UI -->
        <div id="cc-filter-ui" class="latest-row" style="margin-top:8px;gap:10px;flex-wrap:wrap"></div>

        <!-- Actions -->
        <div class="latest-row" style="margin-top:10px;gap:10px;flex-wrap:wrap">
          <button id="cc-run-filter" class="btn-glass">Run Filter</button>
          <button id="cc-select-all" class="btn-glass">Select All</button>
          <span class="badge" id="cc-count">Selected: 0</span>
        </div>

        <div id="cc-results" class="cards" style="margin-top:12px;"></div>
      </div>
    </div>

    <!-- Step 2: Survey -->
    <div class="card wide" style="margin-top:14px">
      <div style="flex:1;min-width:0">
        <div class="kicker">Step 2</div>
        <div class="big" style="margin-bottom:6px">Survey Questions & Options</div>

        <div class="label" style="margin-top:8px">Questions</div>
        <div id="cc-questions"></div>
        <button id="cc-add-q" class="btn-add" style="margin-top:8px">+ Add Question</button>

        <div class="label" style="margin-top:18px">Answer Options (global)</div>
        <div id="cc-options"></div>
        <button id="cc-add-opt" class="btn-add" style="margin-top:8px">+ Add Option</button>

        <!-- Centered Workflow Button -->
        <div style="width:100%;display:flex;justify-content:center;margin-top:28px;">
          <button id="cc-design-workflow" class="btn-add">
            Design Workflow
          </button>
        </div>
      </div>
    </div>
  `;

  // ---------- State ----------
  const selected = new Set();
  let questions = ['Can you attend this event?'];
  let options   = ['Yes','No','Maybe'];

  // ---------- Build filter dropdowns ----------
  // Mounts a "Field" select and a "Value" select, using distinct values from Supabase
  mountContactFilters(root.querySelector('#cc-filter-ui'));

  // ---------- Wire controls ----------
  root.querySelector('#cc-run-filter')?.addEventListener('click', runFilter);
  root.querySelector('#cc-select-all')?.addEventListener('click', () => {
    const boxes = root.querySelectorAll('input[data-contact-id]');
    boxes.forEach(b => { b.checked = true; selected.add(b.getAttribute('data-contact-id')); });
    updateSelectedBadge();
  });

  // Workflow button: save campaign draft then route to designer
  root.querySelector('#cc-design-workflow')?.addEventListener('click', onDesignWorkflow);

  // Survey editors
  root.querySelector('#cc-add-q')?.addEventListener('click', () => { questions.push(''); renderQuestions(); });
  root.querySelector('#cc-add-opt')?.addEventListener('click', () => { options.push(''); renderOptions(); });

  // Initial render
  renderQuestions();
  renderOptions();

  // ---------- Functions ----------
  async function onDesignWorkflow() {
    try {
      const campaign_id = crypto.randomUUID();
      const name = root.querySelector('#cc-name')?.value?.trim() || 'Untitled Campaign';

      // Selected contacts from current result list
      const student_ids = Array.from(root.querySelectorAll('input[data-contact-id]:checked'))
        .map(b => b.getAttribute('data-contact-id'));

      // Clean Qs/Opts
      const qs = (Array.isArray(questions) ? questions : []).map(q => String(q || '').trim()).filter(Boolean);
      const os = (Array.isArray(options)   ? options   : []).map(o => String(o || '').trim()).filter(Boolean);

      // Snapshot chosen dropdown filter for persistence
      const activeFilter = getSelectedFilter(root.querySelector('#cc-filter-ui')); // { field, value } or null
      const filtersPayload = activeFilter ? { [activeFilter.field]: activeFilter.value } : null;

      await upsertCampaignDraft({
        campaign_id,
        campaign_name: name,
        filters: filtersPayload,
        student_ids,
        dates: null,
        survey_questions: qs,
        survey_options: os,
        workflow: null
      });

      location.hash = `#/workflow?campaign=${encodeURIComponent(campaign_id)}`;
    } catch (e) {
      console.error('Failed to create draft campaign:', e);
      alert('Could not create campaign draft. Please try again.');
    }
  }

  async function runFilter() {
    const filter = getSelectedFilter(root.querySelector('#cc-filter-ui')); // { field, value } or null
    const filters = {}; // compatible with dbFetchContacts signature

    // Ask DB for rows (db helper may use ILIKE; we’ll post-filter below if a strict dropdown was chosen)
    let rows = await dbFetchContacts(filters);

    if (filter && filter.field && filter.value != null && filter.value !== '') {
      // Strict client-side post-filter to the EXACT selected value
      rows = rows.filter(r => {
        const v = (r[filter.field] ?? '').toString();
        return v === filter.value;
      });
    }

    renderResults(rows);
  }

  function renderQuestions() {
    const mount = root.querySelector('#cc-questions');
    mount.innerHTML = questions.map((q, i) => `
      <div class="latest-row" style="gap:8px;margin-top:8px">
        <input data-q="${i}" value="${escapeHtml(q)}" placeholder="Question text"
               style="flex:1;padding:8px;border-radius:10px;border:1px solid rgba(0,0,0,.12);">
        <button class="btn-delete" data-q-del="${i}">Remove</button>
      </div>
    `).join('') || `<p class="label">No questions yet — add one.</p>`;

    mount.oninput = (e) => {
      const inp = e.target.closest('input[data-q]');
      if (!inp) return;
      const idx = Number(inp.getAttribute('data-q'));
      questions[idx] = inp.value;
    };
    mount.onclick = (e) => {
      const del = e.target.closest('button[data-q-del]');
      if (!del) return;
      const idx = Number(del.getAttribute('data-q-del'));
      questions.splice(idx, 1);
      renderQuestions();
    };
  }

  function renderOptions() {
    const mount = root.querySelector('#cc-options');
    mount.innerHTML = options.map((opt, i) => `
      <div class="latest-row" style="gap:8px;margin-top:8px">
        <input data-opt="${i}" value="${escapeHtml(opt)}" placeholder="Option text"
               style="flex:1;padding:8px;border-radius:10px;border:1px solid rgba(0,0,0,.12);">
        <button class="btn-delete" data-opt-del="${i}">Remove</button>
      </div>
    `).join('') || `<p class="label">No options yet — add one.</p>`;

    mount.oninput = (e) => {
      const inp = e.target.closest('input[data-opt]');
      if (!inp) return;
      const idx = Number(inp.getAttribute('data-opt'));
      options[idx] = inp.value;
    };
    mount.onclick = (e) => {
      const del = e.target.closest('button[data-opt-del]');
      if (!del) return;
      const idx = Number(del.getAttribute('data-opt-del'));
      options.splice(idx, 1);
      renderOptions();
    };
  }

  function renderResults(rows) {
    const mount = root.querySelector('#cc-results');
    if (!rows.length) {
      mount.innerHTML = `
        <div class="card" style="grid-column:span 12;">
          <div class="kicker">Contacts</div>
          <div class="big" style="margin-bottom:6px">No matches</div>
          <p class="label">Try a different filter.</p>
        </div>`;
      return;
    }

    mount.innerHTML = rows.map(row => `
      <div class="card" style="grid-column:span 6;">
        <div class="card-header" style="justify-content:space-between">
          <div>
            <div class="big" style="font-size:18px">${escapeHtml(row.contact_first || '')} ${escapeHtml(row.contact_last || '')}</div>
            <div class="label">${escapeHtml(row.contact_email || '—')} • ${escapeHtml(row.contact_phone || '—')}</div>
          </div>
          <div>
            <label class="label" style="display:flex;align-items:center;gap:8px">
              <input type="checkbox" data-contact-id="${row.contact_id}">
              Select
            </label>
          </div>
        </div>
      </div>
    `).join('');

    mount.onchange = (e) => {
      const box = e.target.closest('input[data-contact-id]');
      if (!box) return;
      const id = box.getAttribute('data-contact-id');
      if (box.checked) selected.add(id); else selected.delete(id);
      updateSelectedBadge();
    };
  }

  function updateSelectedBadge() {
    const badge = root.querySelector('#cc-count');
    if (badge) badge.textContent = `Selected: ${selected.size}`;
  }
}

// Escape util
function escapeHtml(s=''){return s.replace(/[&<>"']/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
