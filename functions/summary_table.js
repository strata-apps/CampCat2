// functions/summary_table.js
import { upsertCampaignDraft } from './db.js';

export function renderCampaignSummaryTable(mount, {
  progressRows = [],            // [{contact_id, outcome, response, notes, last_called_at}]
  contactsById = new Map(),     // contact_id -> contact row (with phone/email/name)
  campaignId = null,
  onRecall = null,              // (contact_id) => void  (optional)
} = {}) {
  mount.innerHTML = `
    <div class="card" style="grid-column:span 12;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div>
          <div class="kicker">Review</div>
          <div class="big">Calls in this Campaign</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="new-camp-name" type="text" placeholder="New campaign name"
                 style="padding:8px;border:1px solid rgba(0,0,0,.12);border-radius:10px;">
          <button id="mk-campaign" class="btn-add">Create Campaign from Filtered</button>
        </div>
      </div>

      <div style="margin-top:10px" class="label">Filter</div>
      <div class="latest-row" style="gap:8px;margin:8px 0">
        <input id="flt-contact" placeholder="contact_id" class="select-pill" style="min-width:120px">
        <input id="flt-outcome" placeholder="outcome" class="select-pill" style="min-width:120px">
        <input id="flt-response" placeholder="response" class="select-pill" style="min-width:120px">
        <input id="flt-notes" placeholder="notes" class="select-pill" style="min-width:120px">
      </div>

      <div style="overflow:auto; border:1px solid rgba(0,0,0,.08); border-radius:12px;">
        <table class="table" style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="text-align:left">
              <th style="padding:10px;border-bottom:1px solid rgba(0,0,0,.08)">contact_id</th>
              <th style="padding:10px;border-bottom:1px solid rgba(0,0,0,.08)">response</th>
              <th style="padding:10px;border-bottom:1px solid rgba(0,0,0,.08)">outcome</th>
              <th style="padding:10px;border-bottom:1px solid rgba(0,0,0,.08)">notes</th>
              <th style="padding:10px;border-bottom:1px solid rgba(0,0,0,.08)">call</th>
            </tr>
          </thead>
          <tbody id="tbl-body"></tbody>
        </table>
      </div>
    </div>
  `;

  const state = {
    rows: [...progressRows],
    filters: { contact: '', outcome: '', response: '', notes: '' },
  };

  const tbody = mount.querySelector('#tbl-body');

  function phoneFor(id) {
    const c = contactsById.get(id);
    if (!c) return null;
    const d = String((c.contact_phone || c.phone || c.mobile || '')).replace(/[^\d+]/g,'');
    if (!d) return null;
    const n = d.startsWith('+') ? d : (d.length===10 ? `+1${d}` : `+${d}`);
    return `tel:${n}`;
  }

  function applyFilters() {
    const { contact, outcome, response, notes } = state.filters;
    return state.rows.filter(r =>
      match(r.contact_id, contact) &&
      match(r.outcome, outcome) &&
      match(r.response, response) &&
      match(r.notes, notes));
  }
  function match(v, q) {
    const s = (v ?? '').toString().toLowerCase();
    const t = (q ?? '').toString().toLowerCase().trim();
    return !t || s.includes(t);
    }

  function renderBody() {
    const rows = applyFilters();
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="padding:12px" class="label">No rows match your filters.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const tel = phoneFor(r.contact_id);
      return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid rgba(0,0,0,.06)">${esc(r.contact_id)}</td>
          <td style="padding:10px;border-bottom:1px solid rgba(0,0,0,.06)">${esc(r.response ?? '—')}</td>
          <td style="padding:10px;border-bottom:1px solid rgba(0,0,0,.06)">${esc(r.outcome ?? '—')}</td>
          <td style="padding:10px;border-bottom:1px solid rgba(0,0,0,.06)">${esc(r.notes ?? '')}</td>
          <td style="padding:10px;border-bottom:1px solid rgba(0,0,0,.06)">
            ${tel
              ? `<a href="${tel}" class="btn-glass">Call</a>`
              : `<button class="btn" disabled style="opacity:.6">No Phone</button>`
            }
          </td>
        </tr>
      `;
    }).join('');
  }

  // Filters
  mount.querySelector('#flt-contact').oninput = (e)=>{ state.filters.contact = e.target.value; renderBody(); };
  mount.querySelector('#flt-outcome').oninput = (e)=>{ state.filters.outcome = e.target.value; renderBody(); };
  mount.querySelector('#flt-response').oninput = (e)=>{ state.filters.response = e.target.value; renderBody(); };
  mount.querySelector('#flt-notes').oninput = (e)=>{ state.filters.notes = e.target.value; renderBody(); };

  // Create campaign from filtered subset
  mount.querySelector('#mk-campaign').onclick = async () => {
    const name = mount.querySelector('#new-camp-name').value.trim() || 'Follow-up Campaign';
    const subset = applyFilters().map(r => r.contact_id);
    if (!subset.length) { alert('No filtered rows to seed a new campaign.'); return; }

    try {
      const campaign_id = crypto.randomUUID();
      await upsertCampaignDraft({
        campaign_id,
        campaign_name: name,
        contact_ids: subset,
        dates: null,
        survey_questions: [],  // start empty; user can add later
        survey_options: [],
        workflow: null,
      });
      alert('New campaign created!');
      // Navigate to create workflow or list (choose your route preference)
      // location.hash = `#/workflow?campaign=${encodeURIComponent(campaign_id)}`;
    } catch (e) {
      console.error('[summary_table] failed to create campaign', e);
      alert('Could not create campaign from selection.');
    }
  };

  renderBody();
}

function esc(s=''){return s.toString().replace(/[&<>"']/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
