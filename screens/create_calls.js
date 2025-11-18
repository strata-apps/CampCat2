// screens/create_calls.js
import { upsertCampaignDraft, fetchContacts as dbFetchContacts } from '../db.js';

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

    <!-- Step 1: Filter Contacts (dynamic field filter) -->
    <div class="card wide">
      <div style="flex:1;min-width:0">
        <div class="kicker">Step 1</div>
        <div class="big" style="margin-bottom:6px">Filter Contacts</div>

        <!-- Dynamic field/operator/value UI -->
        <div id="cc-filter-ui" class="latest-row" style="margin-top:8px;gap:10px;flex-wrap:wrap"></div>

        <!-- Actions -->
        <div class="latest-row" style="margin-top:10px;gap:10px;flex-wrap:wrap">
          <button id="cc-run-filter" class="btn">Run Filter</button>
          <button id="cc-select-all" class="btn">Select All</button>
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

  // All contacts loaded from DB (so we can filter client-side on ANY column)
  let allContacts = [];

  // Initialize dynamic filters once we know contact columns
  initDynamicFilters();

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

  // ---------- Dynamic filter UI ----------

  async function initDynamicFilters() {
    try {
      // Load all contacts once; we’ll filter in-memory by any column
      allContacts = await dbFetchContacts({}) || [];
      const columns = allContacts[0] ? Object.keys(allContacts[0]) : [];

      buildFilterUI(columns);
    } catch (e) {
      console.error('Failed to init dynamic filters:', e);
      const mount = root.querySelector('#cc-filter-ui');
      if (mount) {
        mount.innerHTML = `<p class="label">Could not load contacts for filtering.</p>`;
      }
    }
  }

  function buildFilterUI(columns) {
    const mount = root.querySelector('#cc-filter-ui');
    if (!mount) return;

    if (!columns.length) {
      mount.innerHTML = `<p class="label">No contacts available to filter.</p>`;
      return;
    }

    const optionsHtml = columns.map((col) => {
      return `<option value="${escapeHtml(col)}">${escapeHtml(prettyLabel(col))}</option>`;
    }).join('');

    mount.innerHTML = `
      <select id="cc-field" class="select-pill">
        ${optionsHtml}
      </select>
      <select id="cc-operator" class="select-pill">
        <option value="contains">Contains</option>
        <option value="equals">Equals</option>
        <option value="is_null">Is empty</option>
        <option value="not_null">Is not empty</option>
      </select>
      <input id="cc-value" class="select-pill" placeholder="Filter value (for contains/equals)"
             style="min-width:180px;">
    `;
  }

  function getActiveFilter() {
    const fieldEl = root.querySelector('#cc-field');
    const opEl    = root.querySelector('#cc-operator');
    const valEl   = root.querySelector('#cc-value');

    if (!fieldEl || !opEl) return null;

    const field = fieldEl.value;
    const operator = opEl.value || 'contains';
    const value = valEl ? valEl.value.trim() : '';

    if (!field) return null;

    // For "is_null" / "not_null" no value is needed
    if (operator === 'is_null' || operator === 'not_null') {
      return { field, operator, value: null };
    }

    // For equals/contains we require a value
    if (!value) return null;

    return { field, operator, value };
  }

  // ---------- Functions ----------

  async function onDesignWorkflow() {
    try {
      const campaign_id = crypto.randomUUID();
      const name = root.querySelector('#cc-name')?.value?.trim() || 'Untitled Campaign';

      // Selected contacts from current result list
      const contact_ids  = Array.from(root.querySelectorAll('input[data-contact-id]:checked'))
        .map(b => b.getAttribute('data-contact-id'));

      // Clean Qs/Opts
      const qs = (Array.isArray(questions) ? questions : []).map(q => String(q || '').trim()).filter(Boolean);
      const os = (Array.isArray(options)   ? options   : []).map(o => String(o || '').trim()).filter(Boolean);

      // Snapshot chosen filter for persistence (simple { field: value } shape)
      const activeFilter = getActiveFilter(); // { field, operator, value } or null
      let filtersPayload = null;
      if (activeFilter && activeFilter.value != null) {
        filtersPayload = { [activeFilter.field]: activeFilter.value };
      }

      await upsertCampaignDraft({
        campaign_id,
        campaign_name: name,
        filters: filtersPayload,
        contact_ids,
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
    try {
      // Make sure we have contacts loaded
      if (!Array.isArray(allContacts) || !allContacts.length) {
        allContacts = await dbFetchContacts({}) || [];
      }

      const filter = getActiveFilter(); // { field, operator, value } or null
      let rows = [...allContacts];

      if (filter && filter.field) {
        const { field, operator, value } = filter;

        rows = rows.filter((r) => {
          const raw = r[field];
          const str = raw == null ? '' : String(raw);

          switch (operator) {
            case 'equals':
              return str === String(value ?? '');
            case 'contains':
              return str.toLowerCase().includes(String(value ?? '').toLowerCase());
            case 'is_null':
              return raw == null || str === '';
            case 'not_null':
              return !(raw == null || str === '');
            default:
              return true;
          }
        });
      }

      renderResults(rows);
    } catch (e) {
      console.error('Failed to run filter:', e);
      alert('Error running filter. See console for details.');
    }
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

  function prettyLabel(key) {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }
}

// Escape util
function escapeHtml(s=''){return s.replace(/[&<>"']/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
