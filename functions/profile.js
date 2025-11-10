// functions/profile.js
// Modal with tabbed profile view for a contact:
// - Overview: pretty view of contact fields (contacts table)
// - Campaign Notes: notes from campaign_progress per campaign_name
// - Single Calls: single_calls list (outcome, response, notes, user_id, time)
// - Tasks: current user's tasks for this contact with "Complete" (delete)
//
// Requires: window.supabase client

export function openProfileModal(contact) {
  const { close, body, footer, titleEl } = buildModal('Contact Profile');
  const displayName = [contact.contact_first, contact.contact_last].filter(Boolean).join(' ').trim() || 'Contact';
  titleEl.insertAdjacentHTML('beforeend', `
    <div class="label" style="margin-top:4px">${escapeHtml(displayName)}</div>
  `);

  // Tabs header
  const tabsBar = el('div', { style: { display:'flex', gap:'8px', borderBottom:'1px solid rgba(0,0,0,.08)', paddingBottom:'6px', marginBottom:'10px' }});
  const tabs = [
    { id: 'tab-overview', label: 'Overview' },
    { id: 'tab-notes',    label: 'Campaign Notes' },
    { id: 'tab-calls',    label: 'Single Calls' },
    { id: 'tab-tasks',    label: 'Tasks' },
  ];
  tabs.forEach(t => {
    const b = el('button', { class:'btn', 'data-tab': t.id }, t.label);
    tabsBar.appendChild(b);
  });
  body.appendChild(tabsBar);

  // Tab sections
  const sections = {
    overview: el('div'),
    notes:    el('div', { style:{ display:'none' } }),
    calls:    el('div', { style:{ display:'none' } }),
    tasks:    el('div', { style:{ display:'none' } })
  };
  body.append(sections.overview, sections.notes, sections.calls, sections.tasks);

  // Load data
  renderOverview();
  renderNotes();
  renderCalls();
  renderTasks();

  // Active tab switching
  tabsBar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    const id = b.getAttribute('data-tab');
    setActive(id);
  });
  setActive('tab-overview'); // default

  const closeBtn = el('button', { class:'btn' }, 'Close');
  closeBtn.onclick = () => close();
  footer.append(closeBtn);

  /* --------------------- renderers --------------------- */

  async function renderOverview() {
    sections.overview.innerHTML = '';
    // Refresh full row in case table has more columns than we initially loaded
    const { data, error } = await sup().from('contacts')
      .select('*')
      .eq('contact_id', contact.contact_id)
      .maybeSingle();

    if (error) {
      sections.overview.append(el('div', 'label', 'Error loading contact.'));
      return;
    }
    const row = data || contact;

    const kv = el('div', { style:{ display:'grid', gridTemplateColumns:'160px 1fr', gap:'8px', maxWidth:'720px' }});
    const add = (k, v) => {
      kv.append(el('div','k',k), el('div','v', escapeHtml(v ?? '—')));
    };

    // Common fields (add any others you store)
    add('First Name', row.contact_first);
    add('Last Name',  row.contact_last);
    add('Email',      row.contact_email);
    add('Phone',      row.contact_phone);
    add('ID',         row.contact_id);

    sections.overview.append(el('div','kicker','Contact Details'), el('div','big',displayName), el('div',{style:{height:'8px'}}), kv);
  }

  function renderNotes() {
    sections.notes.innerHTML = '';
    const head = el('div', { style:{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'10px' }});
    head.append(el('div','kicker','Campaign Notes'));

    // Campaign selector
    const input = document.createElement('input');
    input.placeholder = 'Campaign name (e.g., Fall Phonebank 2025)';
    Object.assign(input.style, { flex:'1 1 auto', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:'8px' });

    const loadBtn = el('button', { class:'btn' }, 'Load Notes');
    const wrap = el('div', { style:{ display:'flex', gap:'8px', width:'100%', maxWidth:'720px' }}, input, loadBtn);
    sections.notes.append(head, wrap);

    const listBox = el('div', { style:{ marginTop:'10px' }});
    sections.notes.append(listBox);

    loadBtn.onclick = async () => {
      const name = (input.value || '').trim();
      listBox.innerHTML = '';
      if (!name) {
        listBox.append(el('div','label','Enter a campaign name.'));
        return;
      }
      // Try campaign_progress as requested
      const { data, error } = await sup().from('campaign_progress')
        .select('notes, user_id, updated_at, created_at, campaign_name')
        .eq('contact_id', contact.contact_id)
        .ilike('campaign_name', name)
        .order('updated_at', { ascending: false })
        .limit(100);

      if (error) {
        listBox.append(el('div','label','Error loading campaign notes.'));
        return;
      }
      if (!data?.length) {
        listBox.append(el('div','label','No notes found for that campaign.'));
        return;
      }
      const table = tableView(['When','User','Campaign','Notes']);
      data.forEach(r => {
        tr(table.tbody,
          fmtDate(r.updated_at || r.created_at),
          r.user_id || '—',
          r.campaign_name || '—',
          r.notes || '—'
        );
      });
      listBox.append(table.node);
    };
  }

  async function renderCalls() {
    sections.calls.innerHTML = '';
    sections.calls.append(el('div','kicker','Single Calls'), el('div','label','Most recent first'));

    const { data, error } = await sup().from('single_calls')
      .select('call_time, user_id, outcome, response, notes')
      .eq('contact_id', contact.contact_id)
      .order('call_time', { ascending: false })
      .limit(200);

    if (error) {
      sections.calls.append(el('div','label','Error loading calls.'));
      return;
    }
    if (!data?.length) {
      sections.calls.append(el('div','label','No calls logged yet.'));
      return;
    }

    const table = tableView(['Time','User','Outcome','Response','Notes']);
    data.forEach(r => {
      tr(table.tbody,
        fmtDate(r.call_time),
        r.user_id || '—',
        r.outcome || '—',
        r.response || '—',
        r.notes || '—'
      );
    });
    sections.calls.append(table.node);
  }

  async function renderTasks() {
    sections.tasks.innerHTML = '';
    sections.tasks.append(el('div','kicker','Tasks'), el('div','label','Your tasks for this contact'));

    const { data: { user } } = await sup().auth.getUser();
    if (!user) {
      sections.tasks.append(el('div','label','Sign in to view tasks.'));
      return;
    }

    const { data, error } = await sup().from('tasks')
      .select('id, task_text, active, created_at')
      .eq('user_id', user.id)
      .eq('contact_id', contact.contact_id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      sections.tasks.append(el('div','label','Error loading tasks.'));
      return;
    }
    if (!data?.length) {
      sections.tasks.append(el('div','label','No tasks for this contact.'));
      return;
    }

    const list = el('div', { style:{ display:'grid', gap:'8px' }});
    data.forEach(r => {
      const row = el('div', { class:'card', style:{ padding:'10px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px' }});
      row.append(
        el('div', null,
          el('div','big', r.task_text || '—'),
          el('div','label', fmtDate(r.created_at))
        ),
        (() => {
          const c = el('div', { style:{ display:'flex', gap:'8px' }});
          const del = el('button', { class:'btn' }, 'Complete');
          del.onclick = async () => {
            const ok = confirm('Mark complete? This will delete the task.');
            if (!ok) return;
            const { error: delErr } = await sup().from('tasks').delete().eq('id', r.id);
            if (delErr) return alert('Delete failed.');
            // reload
            renderTasks();
          };
          c.appendChild(del);
          return c;
        })()
      );
      list.appendChild(row);
    });
    sections.tasks.append(list);
  }

  /* ---------------------- UI helpers ---------------------- */

  function setActive(id) {
    const map = {
      'tab-overview': sections.overview,
      'tab-notes': sections.notes,
      'tab-calls': sections.calls,
      'tab-tasks': sections.tasks,
    };
    Object.keys(map).forEach(k => map[k].style.display = 'none');
    (map[id] || sections.overview).style.display = '';
    // focus first input if any
    if (id === 'tab-notes') {
      const input = sections.notes.querySelector('input');
      if (input) setTimeout(() => input.focus(), 0);
    }
  }

  function tableView(headers) {
    const table = el('table', { class:'table', style:{ width:'100%', borderCollapse:'collapse' } });
    const thead = el('thead');
    const trh = document.createElement('tr');
    headers.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      th.style = 'padding:10px;border-bottom:1px solid rgba(0,0,0,.08);text-align:left;';
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    const tbody = document.createElement('tbody');
    table.append(thead, tbody);
    return { node: table, tbody };
  }
  function tr(tbody, ...cells) {
    const row = document.createElement('tr');
    cells.forEach((c) => {
      const td = document.createElement('td');
      td.style = 'padding:10px;border-bottom:1px solid rgba(0,0,0,.06)';
      td.textContent = c == null ? '' : String(c);
      row.appendChild(td);
    });
    tbody.appendChild(row);
  }
  function buildModal(title='Modal') {
    const wrap = el('div', { style: {
      position:'fixed', inset:'0', background:'rgba(0,0,0,.28)', zIndex:9999,
      display:'flex', alignItems:'center', justifyContent:'center'
    }});
    const card = el('div', { class:'card', style: {
      width:'min(900px, 95vw)', maxHeight:'85vh', display:'flex', flexDirection:'column',
      padding:'16px', gap:'10px', overflow:'hidden'
    }});
    const head = el('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center' }});
    const titleBox = el('div', null, el('div','kicker','Profile'), el('div','big',title));
    const x = el('button', { class:'btn' }, '✕');
    x.onclick = () => close();
    const _body = el('div', { style:{ overflow:'auto', padding:'4px 2px' }});
    const _footer = el('div', { style:{ display:'flex', justifyContent:'flex-end', gap:'8px' }});
    head.append(titleBox, x);
    card.append(head, _body, _footer);
    wrap.append(card);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    document.body.appendChild(wrap);
    function close(){ wrap.remove(); }
    return { close, body:_body, footer:_footer, titleEl: titleBox };
  }
  function el(tag, attrs = {}, ...kids) {
    if (typeof attrs === 'string') attrs = { class: attrs };
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v;
      else if (k === 'style' && v && typeof v === 'object') Object.assign(n.style, v);
      else if (k.startsWith('on') && typeof v === 'function') n[k] = v;
      else if (v != null) n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null) continue;
      n.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return n;
  }
  function fmtDate(iso) {
    const d = new Date(iso);
    return Number.isNaN(d) ? '—' :
      d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function escapeHtml(s = '') {
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  const sup = () => window.supabase;
}

export default openProfileModal;
