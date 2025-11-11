// screens/call_execution.js
// Route pattern supported: "#/execute/<campaign_id>" or "#/call-execution/<campaign_id>"

import { renderContactInfo } from '../functions/contact_info.js';
import { renderInteractions } from '../functions/interactions.js';
import { createDataCollection } from '../functions/data_collection.js';
import { renderTasks } from '../functions/tasks_function.js';
import { renderCampaignInsights } from '../functions/charts.js'; 
import { renderCampaignSummaryTable } from '../functions/summary_table.js';

/* ------------------------- route helpers ------------------------- */
function readCampaignId() {
  const h = String(location.hash || '');
  // 1) support "#/execute/<id>" and "#/call-execution/<id>"
  let m = h.match(/#\/execute\/([^/?#]+)/i);
  if (!m) m = h.match(/#\/call-execution\/([^/?#]+)/i);
  if (m) return decodeURIComponent(m[1]);

  // 2) also support "#/call-execution?campaign=<id>"
  const qm = h.match(/[?&#]campaign=([^&#]+)/i);
  return qm ? decodeURIComponent(qm[1]) : null;
}


/* ------------------------- tiny dom helpers ---------------------- */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
const div = (...args) => el('div', ...args);
const btn = (label, cls, on) => { const b = el('button', cls, label); if (on) b.onclick = on; return b; };
const a = (label, href, cls) => { const x = el('a', cls, label); x.href = href; return x; };

function telHref(raw) {
  const digits = String(raw||'').replace(/[^\d+]/g,'');
  if (!digits) return null;
  const n = digits.startsWith('+') ? digits : (digits.length===10 ? `+1${digits}` : `+${digits}`);
  return `tel:${n}`;
}
function humanPhone(raw) {
  const d = String(raw||'').replace(/[^\d]/g,'').replace(/^1/,'');
  return d.length===10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : (raw || '');
}

/* =================================================================
   MAIN
   ================================================================= */
export default async function CallExecution(root) {
  const campaign_id = readCampaignId();
  if (!campaign_id) { location.hash = '#/dashboard'; return; }

  root.innerHTML = `
    <section class="page-head">
      <h1 class="page-title">Unified Calling</h1>
      <div class="subtle">Campaign: <span id="exec-campaign-id">${campaign_id}</span></div>
    </section>
    <div id="exec-wrap"></div>
  `;

  const wrap = root.querySelector('#exec-wrap');

  // State
  let contacts = [];           // [{contact_id, ...contact fields}]
  let queue = [];              // [contact_id]
  let index = 0;               // current pointer in queue
  let totals = { total: 0, made: 0, answered: 0, missed: 0 };
  function isFinished() {
    return totals.total > 0 && totals.made >= totals.total;
  }
  let progressRows = [];   // full rows from call_progress for this campaign
  let contactsById = new Map();  // Map contact_id -> contact row

  // DataCollection component instance for current contact
  let dc = null;

  /* -------------------- Boot: load contacts + totals -------------------- */
  await hydrate();

  function progressPct() {
    return totals.total ? Math.round((totals.made / totals.total) * 100) : 0;
  }

  function currentContact() {
    const id = queue[index];
    return contacts.find(c => String(c.contact_id) === String(id)) || null;
  }

  function phoneFrom(c) {
    const keys = Object.keys(c||{});
    const pri = ['contact_phone','mobile','phone','phone_number','Cell Phone','Student Phone'];
    for (const k of pri) if (c[k]) return c[k];
    for (const k of keys) if (/phone|mobile|cell/i.test(k) && c[k]) return c[k];
    return '';
  }

  async function hydrate() {
    try {
      const s = window.supabase;
      if (!s) throw new Error('Supabase client not found');

      // 1) Progress rows for this campaign
      const { data: prog, error: progErr } = await s
        .from('call_progress')
        .select('contact_id, outcome, response, notes, last_called_at, attempts')
        .eq('campaign_id', campaign_id);
        
      if (progErr) throw progErr;

      progressRows = prog || [];

      let idSet = new Set((prog || []).map(r => r.contact_id));

      // 2) Fallback: if no progress yet, seed from call_campaigns.contact_ids
      if (!idSet.size) {
        const { data: cc, error: ccErr } = await s
          .from('call_campaigns')
          .select('contact_ids')
          .eq('campaign_id', campaign_id)
          .maybeSingle();
        if (ccErr) throw ccErr;
        if (cc?.contact_ids?.length) {
          idSet = new Set(cc.contact_ids);
        }
      }

      queue = [...idSet];

      // 3) Fetch contacts (coerce types to match your schema)
      let rows = [];
      if (idSet.size) {
        const ids = [...idSet].map(v => {
          // If your contacts.contact_id is integer, coerce:
          const n = Number(v);
          return Number.isFinite(n) && String(n) === String(v) ? n : v; // keep string UUIDs as-is
        });

        const { data: crows, error: cErr } = await s
          .from('contacts')
          .select('*')
          .in('contact_id', ids);
        if (cErr) throw cErr;
        rows = crows || [];
      }

      contacts = rows;
      contactsById = new Map(contacts.map(c => [String(c.contact_id), c]));

      // 4) Totals
      const made = progressRows.filter(r => (r.attempts ?? 0) > 0).length;
      const answered = progressRows.filter(r => r.outcome === 'answered').length;
      const missed = progressRows.filter(r => r.outcome === 'no_answer').length;
      totals = { total: queue.length, made, answered, missed };

      // 5) Start pointer
      if (queue.length) {
        const firstUnattemptedIdx = queue.findIndex(id => {
          const row = progressRows.find(r => String(r.contact_id) === String(id));
          return !row || (row.attempts || 0) === 0;
        });
        index = firstUnattemptedIdx >= 0 ? firstUnattemptedIdx : 0;
      }

      render();
    } catch (e) {
      console.error('[call_execution] hydrate failed', e);
      wrap.innerHTML = `<div class="card wide"><div class="label">Could not load campaign or contacts.</div></div>`;
    }
  }


  /* ------------------------------ Render ------------------------------ */
  function render() {
    wrap.innerHTML = '';
    // Always open on insights + summary table
    renderSummary();
  }

  /* --------------------------- Summary Screen --------------------------- */
  function renderSummary() {
    wrap.innerHTML = `
      <div class="cards" style="align-items:flex-start">
        <div class="card" style="grid-column:span 12; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
          <div>
            <div class="kicker">Campaign Overview</div>
            <div class="big">Insights & Call Log</div>
            <div class="label">${totals.made}/${totals.total} complete • ${totals.answered} answered • ${totals.missed} missed</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            ${!isFinished() ? `<button id="btn-continue" class="btn-add">Continue Calling</button>` : ``}
            <a id="btn-return" class="btn-glass" href="#/calls">Return to Calls</a>
          </div>
        </div>

        <div id="sum-left"  class="card" style="grid-column:span 6;"></div>
        <div id="sum-right" class="card" style="grid-column:span 6;"></div>
      </div>
    `;
    const left  = wrap.querySelector('#sum-left');
    const right = wrap.querySelector('#sum-right');

    // Left: Insights
    renderCampaignInsights(left, { progressRows });

    // Right: Filterable table + create-campaign-from-filter + call buttons
    renderCampaignSummaryTable(right, {
      progressRows,
      contactsById,
      campaignId: campaign_id,
      onRecall: (contact_id) => {
        // Optional jump back to this contact if user continues calling
        const ix = queue.findIndex(id => String(id) === String(contact_id));
        if (ix >= 0) { index = ix; }
        renderLive();
      }
    });

    // Wire "Continue Calling" when not finished
    const cont = wrap.querySelector('#btn-continue');
    if (cont) {
      cont.onclick = () => {
        // Recompute pointer to first unattempted, just in case
        if (queue.length) {
          const firstUnattemptedIdx = queue.findIndex(id => {
            const row = progressRows.find(r => String(r.contact_id) === String(id));
            return !row || (row.attempts || 0) === 0;
          });
          index = firstUnattemptedIdx >= 0 ? firstUnattemptedIdx : 0;
        }
        renderLive();
      };
    }
  }


  /* ------------------------------ Live Calling UI ------------------------------ */
  function renderLive() {
    wrap.innerHTML = '';

    // Progress header
    const header = div('');
    const pWrap = div('progressWrap');
    const pBar  = div('progressBar');
    const pFill = div('progressFill');
    pFill.style.width = `${progressPct()}%`;
    pBar.appendChild(pFill);
    const pText = div('progressText', `${totals.made}/${totals.total} complete • ${totals.answered} answered • ${totals.missed} missed`);
    pWrap.append(pBar, pText);
    header.appendChild(pWrap);
    wrap.appendChild(header);

    // If there’s truly nothing (edge case), go back to summary
    if (!queue.length) return renderSummary();

    const c = currentContact();
    // If all done or pointer is beyond the last contact, show summary
    if (!c || isFinished()) return renderSummary();

    // Contact header (name + centered phone button)
    const name = String(c.contact_first || c.first_name || c.full_name || `${c.contact_first||''} ${c.contact_last||''}`.trim() || 'Contact').trim();
    const phone = phoneFrom(c);
    const href  = telHref(phone);

    const head = div('');
    const title = div('page-title', name);
    title.style.textAlign = 'center';

    const phoneWrap = div('');
    phoneWrap.style.display = 'flex';
    phoneWrap.style.justifyContent = 'center';
    phoneWrap.style.marginTop = '8px';

    // Use class "btn" per your global styling
    const callBtn = a(href ? humanPhone(phone) : 'No phone number', href || '#', 'btn');
    if (!href) { callBtn.style.pointerEvents = 'none'; callBtn.style.opacity = '.6'; }

    phoneWrap.appendChild(callBtn);
    head.append(title, phoneWrap);
    wrap.append(head);


    // Contact info
    const infoCard = renderContactInfo(c);
    const infoWrap = div('card');
    infoWrap.append(infoCard);
    wrap.append(infoWrap);


    // Interactions timeline
    const historyCard = div('card');
    renderInteractions(historyCard, { contact_id: c.contact_id, campaign_id });
    wrap.append(historyCard);

    // Survey + Notes
    dc = createDataCollection({
      campaign_id,
      contact_id: c.contact_id
    });
    const surveyWrap = div('card');
    surveyWrap.append(dc.node);
    wrap.append(surveyWrap);

    // Tasks
    const tasks = renderTasks({ contact: c });
    wrap.append(tasks);

    // Outcome buttons
    const actions = div('actions');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.justifyContent = 'center';
    actions.style.marginTop = '12px';

    const back = btn('← Back', 'btn', onBack);
    const miss = btn('No Answer', 'btn no', () => onOutcome('no_answer'));
    const ans  = btn('Answered',  'btn yes', () => onOutcome('answered'));
    actions.append(back, miss, ans);
    wrap.append(actions);
  }



  /* -------------------------- Navigation -------------------------- */
  function onBack() {
    if (index > 0) { index -= 1; render(); }
  }
  function next() {
    if (index < queue.length - 1) {
      index += 1;
      render();
    } else {
      // finished -> summary
      renderSummary();
    }
  }



  /* ------------------------- Persist outcome ---------------------- */
  async function onOutcome(kind) {
    try {
      const c = currentContact();
      if (!c) return;
      const s = window.supabase;
      if (!s) throw new Error('Supabase not found');

      // pull selected survey answer + notes from component
      const response = dc.getSelectedAnswer();  // string or null
      const notes     = dc.getNotes();           // string

      // Upsert into call_progress (for this contact + campaign)
      // Assumes you have a unique key (campaign_id, contact_id)
      const { error: upErr } = await s
        .from('call_progress')
        .upsert({
          campaign_id,
          contact_id: c.contact_id,
          outcome: kind,
          response: response ?? null,
          notes: (notes || '').trim() || null,
          last_called_at: new Date().toISOString(),
          attempts: 1,
        }, { onConflict: 'campaign_id,contact_id' });

      if (upErr) throw upErr;

      // Also add a row in 'interactions' for timeline
      await s.from('interactions').insert({
        contact_id: c.contact_id,
        campaign_id,
        user_id: (await s.auth.getUser()).data.user?.id || null,
        call_time: new Date().toISOString()
      });

      // Refresh header totals quick (lightweight counts)
      const { data: prog, error: progErr } = await s
        .from('call_progress')
        .select('contact_id, outcome, response, notes, last_called_at, attempts')
        .eq('campaign_id', campaign_id);

      if (!progErr) {
        progressRows = prog || [];
        const made = progressRows.filter(r => (r.attempts ?? 0) > 0).length;
        const answered = progressRows.filter(r => r.outcome === 'answered').length;
        const missed = progressRows.filter(r => r.outcome === 'no_answer').length;
        totals = { total: queue.length, made, answered, missed };
      }


      next();
    } catch (e) {
      console.error('[call_execution] outcome save failed', e);
      alert('Could not record outcome. Please try again.');
    }
  }
}
