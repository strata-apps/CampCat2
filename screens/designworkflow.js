// screens/designworkflow.js
// Renders a vertical flow editor with an "Add Action" modal.
// Persists to Supabase table: campaign_workflow(campaign_id, events, filters)

export default function DesignWorkflow(root) {
  const qs = (sel, el = document) => el.querySelector(sel);
  const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const uid = () => 'evt_' + Math.random().toString(36).slice(2, 9);
  const parseHashParams = () => {
    const hash = location.hash || '';
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return {};
    const search = new URLSearchParams(hash.slice(qIndex + 1));
    const out = {};
    for (const [k,v] of search.entries()) out[k] = v;
    return out;
  };

  const params = parseHashParams();
  let campaign_id = params.campaign || null;

  // ---- State ----------------------------------------------------------------
  let events = [
    {
      id: uid(),
      order: 0,
      type: 'call',
      title: 'Make Initial Call',
      filters: { outcomes: 'all', responses: 'all' }
    }
  ];
  let lastChosenFilters = { outcomes: 'all', responses: 'all' };

  // ---- HTML -----------------------------------------------------------------
  root.innerHTML = `
    <style>
      .flow-shell { display:grid; grid-template-columns:240px 1fr; gap:16px; height:calc(100vh - 80px); }
      .flow-sidebar { background:#ffffff; border:1px solid rgba(0,0,0,0.08); border-radius:12px; padding:12px; }
      .flow-main { position:relative; border:1px solid rgba(0,0,0,0.08); border-radius:12px; background:#fff; overflow:hidden; }
      .flow-canvas { position:absolute; inset:0; background-image: radial-gradient(#e5e7eb 1px, transparent 1px); background-size:16px 16px; }
      .flow-toolbar { position:absolute; top:12px; left:12px; display:flex; gap:8px; z-index:2; }
      .btn-chip { background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:999px; padding:8px 12px; font-weight:600; cursor:pointer; }
      .btn-chip:hover { box-shadow:0 2px 8px rgba(0,0,0,0.06); }
      .flow-stage { position:absolute; inset:0; overflow:auto; padding:70px 24px 24px 24px; z-index:1; }
      .timeline { width:min(720px,100%); margin:0 auto; position:relative; padding-left:28px; }
      .timeline::before { content:""; position:absolute; top:0; bottom:0; left:8px; width:2px; background:#e5e7eb; }

      .flow-card { position:relative; background:#ffffff !important; border:1px solid rgba(0,0,0,0.08); border-radius:12px; padding:12px 14px; margin:18px 0; box-shadow:0 4px 14px rgba(0,0,0,0.06); }
      .flow-dot { position:absolute; left:-22px; top:18px; width:14px; height:14px; background:#fff; border:2px solid #a3a3a3; border-radius:999px; }
      .flow-title { font-weight:800; font-size:16px; color:#0f172a; display:flex; align-items:center; gap:8px; }
      .flow-sub { margin-top:6px; color:#64748b; font-size:13px; }
      .flow-tags { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
      .flow-pill { display:inline-flex; align-items:center; gap:6px; border:1px solid #E5E7EB; background:#F9FAFB; border-radius:999px; padding:4px 8px; font-size:12px; color:#334155; }

      /* Tools on card header-right */
      .card-tools { position:absolute; right:12px; top:12px; display:flex; gap:8px; }
      .btn-mini { background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:999px; padding:6px 10px; font-weight:700; font-size:12px; cursor:pointer; }
      .btn-mini:hover { box-shadow:0 2px 8px rgba(0,0,0,0.06); }

      /* NEW: subtle danger variant for delete */
      .btn-mini.danger {
        color:#7f1111;
        background: rgba(239, 68, 68, 0.08);
        border-color: rgba(239, 68, 68, 0.35);
      }
      .btn-mini.danger:hover {
        background: rgba(239, 68, 68, 0.16);
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.18);
      }

      .page-head { margin-bottom: 12px; }
      .page-title { font-size: 24px; font-weight: 900; letter-spacing: .2px; }
      .subtle { color:#6b7280; font-size:12px; }

      .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.35); display:none; align-items:center; justify-content:center; z-index:100; }
      .modal { width:min(560px,92vw); background:#ffffff; border-radius:14px; border:1px solid rgba(0,0,0,0.08); box-shadow:0 12px 32px rgba(0,0,0,0.18); padding:16px; }
      .modal-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
      .modal-title { font-weight:900; font-size:18px; }
      .icon-btn { background:transparent; border:none; font-size:20px; cursor:pointer; line-height:1; }
      .form-row { margin-top:10px; }
      .label { font-weight:700; color:#111827; font-size:13px; }
      select, .chpill { border-radius:8px; border:1px solid rgba(0,0,0,0.12); padding:8px 10px; background:#fff; }
      .chips { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
      .chpill { cursor:pointer; user-select:none; }
      .chpill[data-on="1"] { background:#E8F5E9; border-color:#A7F3D0; }

      .btn-add { background: linear-gradient(180deg, rgba(34,197,94,0.15), rgba(34,197,94,0.10)); color:#0b5b2b; border:1px solid rgba(34,197,94,0.35); border-radius:999px; padding:10px 14px; font-weight:800; cursor:pointer; }
      .btn-save { background:#111827; color:#fff; border:1px solid #111827; border-radius:10px; padding:10px 12px; font-weight:800; cursor:pointer; }
    </style>

    <section class="page-head">
      <h1 class="page-title">Workflow Designer</h1>
      <div class="subtle">Build the sequence of actions for this call campaign.</div>
    </section>

    <div class="flow-shell">
      <aside class="flow-sidebar">
        <div class="label">Campaign</div>
        <div id="wf-campaign" class="subtle" style="margin-top:4px">${campaign_id ? campaign_id : '— not set —'}</div>
        <hr style="border:none;border-top:1px solid #eee;margin:12px 0">
        <div class="label">Actions</div>
        <div class="subtle" style="margin-top:4px">Cards are added in the timeline →</div>
      </aside>

      <main class="flow-main">
        <div class="flow-canvas"></div>

        <div class="flow-toolbar">
          <button id="wf-add" class="btn-chip">＋ Add Action</button>
          <button id="wf-save" class="btn-chip">💾 Save</button>
        </div>

        <div class="flow-stage">
          <div id="timeline" class="timeline"></div>
        </div>
      </main>
    </div>

    <!-- Add Action Modal -->
    <div id="modal-backdrop" class="modal-backdrop" aria-hidden="true">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <div id="modal-title" class="modal-title">Add an Action</div>
          <button id="modal-x" class="icon-btn" aria-label="Close">✕</button>
        </div>

        <div class="form-row">
          <div class="label">Action type</div>
          <select id="m-action-type">
            <option value="call">Call Action</option>
            <option value="email">Email Action</option>
          </select>
        </div>

        <div class="form-row">
          <div class="label">Trigger on Call Outcomes (optional)</div>
          <div class="chips" id="m-outcomes">
            ${['Answered','No Answer','Voicemail','Wrong Number','Do Not Call'].map(x => `
              <span class="chpill" data-key="${x}">${x}</span>
            `).join('')}
            <span class="chpill" data-key="__ALL__" data-on="1">All outcomes</span>
          </div>
        </div>

        <div class="form-row">
          <div class="label">Trigger on Survey Responses (optional)</div>
          <div class="chips" id="m-responses">
            ${['Yes','No','Maybe','Callback','Transferred'].map(x => `
              <span class="chpill" data-key="${x}">${x}</span>
            `).join('')}
            <span class="chpill" data-key="__ALL__" data-on="1">All responses</span>
          </div>
        </div>

        <div class="form-row" style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
          <button id="m-add" class="btn-add">Add to Timeline</button>
        </div>
      </div>
    </div>
  `;

  // ---- Campaign bootstrap ---------------------------------------------------
  if (!campaign_id) {
    setTimeout(async () => {
      const entered = prompt('Enter campaign_id to design this workflow:', '');
      if (entered) {
        campaign_id = entered.trim();
        const el = qs('#wf-campaign', root);
        if (el) el.textContent = campaign_id;
      }
    }, 0);
  }

  // ---- Render ---------------------------------------------------------------
  renderTimeline();

  // ---- Toolbar --------------------------------------------------------------
  qs('#wf-add', root)?.addEventListener('click', openModal);
  qs('#wf-save', root)?.addEventListener('click', persistWorkflow);

  // ---- Modal logic -----------------------------------------------------------
  const backdrop = qs('#modal-backdrop', root);
  const modalX = qs('#modal-x', root);
  const modalAdd = qs('#m-add', root);
  const chipsOutcomes = qs('#m-outcomes', root);
  const chipsResponses = qs('#m-responses', root);

  modalX?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

  function wireChips(container) {
    container?.addEventListener('click', (e) => {
      const chip = e.target.closest('.chpill');
      if (!chip) return;
      const key = chip.getAttribute('data-key');
      if (key === '__ALL__') {
        qsa('.chpill', container).forEach(c => c.setAttribute('data-on', c.getAttribute('data-key') === '__ALL__' ? '1' : '0'));
      } else {
        const cur = chip.getAttribute('data-on') === '1';
        chip.setAttribute('data-on', cur ? '0' : '1');
        const all = qsa('.chpill[data-key="__ALL__"]', container)[0];
        if (all) all.setAttribute('data-on', '0');
        const any = qsa('.chpill', container).some(c => c.getAttribute('data-key') !== '__ALL__' && c.getAttribute('data-on') === '1');
        if (!any) { if (all) all.setAttribute('data-on', '1'); }
      }
    });
  }
  wireChips(chipsOutcomes);
  wireChips(chipsResponses);

  function openModal() {
    resetModal();
    backdrop.style.display = 'flex';
    backdrop.setAttribute('aria-hidden', 'false');
  }
  function closeModal() {
    backdrop.style.display = 'none';
    backdrop.setAttribute('aria-hidden', 'true');
  }
  function resetModal() {
    qsa('#m-outcomes .chpill', root).forEach(c => c.setAttribute('data-on', c.getAttribute('data-key') === '__ALL__' ? '1' : '0'));
    qsa('#m-responses .chpill', root).forEach(c => c.setAttribute('data-on', c.getAttribute('data-key') === '__ALL__' ? '1' : '0'));
    qs('#m-action-type', root).value = 'call';
  }

  modalAdd?.addEventListener('click', () => {
    const type = qs('#m-action-type', root).value;
    const outcomes = readChips('#m-outcomes');
    const responses = readChips('#m-responses');

    lastChosenFilters = { outcomes, responses };

    const title = type === 'call' ? 'Call Action' : 'Email Action';
    const newEvt = {
      id: uid(),
      order: events.length,
      type,
      title,
      filters: { outcomes, responses }
    };
    events.push(newEvt);
    renderTimeline();
    closeModal();
  });

  function readChips(selector) {
    const chips = qsa(`${selector} .chpill`, root);
    const all = chips.find(c => c.getAttribute('data-key') === '__ALL__' && c.getAttribute('data-on') === '1');
    if (all) return 'all';
    const picked = chips
      .filter(c => c.getAttribute('data-key') !== '__ALL__' && c.getAttribute('data-on') === '1')
      .map(c => c.getAttribute('data-key'));
    return picked.length ? picked : 'all';
  }

  function renderTimeline() {
    const mount = qs('#timeline', root);
    if (!mount) return;

    mount.innerHTML = events.map(renderCard).join('');

    // Attach once: Handle both "Design Email" and "Delete"
    if (!mount._wired) {
      mount.addEventListener('click', async (e) => {
        // Design Email
        const designBtn = e.target.closest('[data-design-email]');
        if (designBtn) {
          const id = designBtn.getAttribute('data-id');
          const evt = events.find(x => x.id === id);
          if (!evt) return;

          const mod = await import('../functions/email_design.js');
          const openDesigner = mod.default;
          openDesigner({
            initial: evt.email || { subject: '', preheader: '', html: '' },
            onSave: (data) => {
              evt.email = data;
              renderTimeline();
            },
            onClose: () => {}
          });
          return;
        }

        // Delete Action
        const delBtn = e.target.closest('[data-del]');
        if (delBtn) {
          const id = delBtn.getAttribute('data-del');
          const evt = events.find(x => x.id === id);
          if (!evt) return;

          const ok = confirm('Delete this action from the workflow? This cannot be undone.');
          if (!ok) return;

          events = events.filter(x => x.id !== id);
          // Re-index order
          events.forEach((ev, i) => { ev.order = i; });
          renderTimeline();
          return;
        }
      });
      mount._wired = true;
    }
  }

  function renderCard(evt) {
    const icon = evt.type === 'call' ? '📞' : '✉️';
    const outTag = tagFrom(evt.filters?.outcomes, 'Outcomes');
    const resTag = tagFrom(evt.filters?.responses, 'Responses');

    // Tools: show "Design Email" for email actions + always show "Delete"
    const designBtn = (evt.type === 'email')
      ? `<button class="btn-mini" data-design-email data-id="${evt.id}">Design Email</button>`
      : '';
    const tools = `
      <div class="card-tools">
        ${designBtn}
        <button class="btn-mini danger" data-del="${evt.id}" aria-label="Delete action">Delete</button>
      </div>`;

    const emailPill = (evt.type === 'email' && evt.email && (evt.email.subject || evt.email.html))
      ? `<span class="flow-pill">Template saved</span>` : '';

    return `
      <div class="flow-card" data-id="${evt.id}">
        <span class="flow-dot"></span>
        ${tools}
        <div class="flow-title">${icon} ${escapeHtml(evt.title)}</div>
        <div class="flow-sub">Type: ${evt.type === 'call' ? 'Call Action' : 'Email Action'}</div>
        <div class="flow-tags">
          ${outTag}
          ${resTag}
          ${emailPill}
        </div>
      </div>
    `;
  }

  function tagFrom(v, label) {
    if (!v || v === 'all') return `<span class="flow-pill">${label}: All</span>`;
    return `<span class="flow-pill">${label}: ${v.map(escapeHtml).join(', ')}</span>`;
  }

  // ---- Persistence ----------------------------------------------------------
  async function persistWorkflow() {
    if (!campaign_id) {
      alert('Please specify a campaign_id first.');
      return;
    }

    // Normalize events so email actions always carry their template
    const serializedEvents = events.map((ev, idx) => ({
      id: ev.id || uid(),
      order: idx,
      type: ev.type,
      title: ev.title,
      filters: ev.filters || { outcomes: 'all', responses: 'all' },
      // 👇 only add an email object on email actions
      email: ev.type === 'email'
        ? (ev.email || { subject: '', preheader: '', html: '' })
        : undefined,
    }));

    const workflowObj = {
      events: serializedEvents,
      filters: lastChosenFilters,
      saved_at: new Date().toISOString(),
    };

    const payload = {
      workflow: JSON.stringify(workflowObj),  // TEXT column
      updated_at: new Date().toISOString(),
    };

    if (globalThis.supabase?.from) {
      try {
        const { error } = await supabase
          .from('call_campaigns')
          .update(payload)
          .eq('campaign_id', campaign_id);

        if (error) throw error;

        // ✅ Go back to Calls list after saving
        location.hash = '#/calls';
      } catch (e) {
        console.warn('Save error:', e);
        alert('Failed to save to server. See console for details.');
      }
    } else {
      console.log('[demo] would update call_campaigns', campaign_id, payload);
      location.hash = '#/calls';
    }
  }





  function escapeHtml(s=''){return s.replace(/[&<>"']/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
}
