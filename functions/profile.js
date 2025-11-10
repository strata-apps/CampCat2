// functions/profile.js
// Tabbed profile modal for a contact.
// Tabs: Overview, Campaign Notes, Interactions (merged timeline).
//
// Requires: window.supabase client

import { renderInteractions } from './interactions.js';
const sup = () => window.supabase;


export function openProfileModal(contact) {
  // FIX TDZ: define sup() immediately so all inner renderers can call it safely.
  const { close, body, footer, titleEl } = buildModal('Contact Profile');
  const displayName = [contact.contact_first, contact.contact_last].filter(Boolean).join(' ').trim() || 'Contact';
  titleEl.insertAdjacentHTML('beforeend', `
    <div class="label" style="margin-top:4px">${escapeHtml(displayName)}</div>
  `);

  // Tabs
  const tabsBar = el('div', { style: { display:'flex', gap:'8px', borderBottom:'1px solid rgba(0,0,0,.08)', paddingBottom:'6px', marginBottom:'10px' }});
  const tabs = [
    { id: 'tab-overview',     label: 'Overview' },
    { id: 'tab-notes',        label: 'Campaign Notes' },
    { id: 'tab-interactions', label: 'Interactions' },
  ];
  tabs.forEach(t => {
    const b = el('button', { class:'btn', 'data-tab': t.id }, t.label);
    tabsBar.appendChild(b);
  });
  body.appendChild(tabsBar);

  // Sections
  const sections = {
    overview:     el('div'),
    notes:        el('div', { style:{ display:'none' } }),
    interactions: el('div', { style:{ display:'none' } }),
  };
  body.append(sections.overview, sections.notes, sections.interactions);

  // Render
  renderOverview();
  renderNotes();
  renderInteractions(sections.interactions, { contact_id: contact.contact_id }); // merged timeline

  // Tab switching
  tabsBar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    setActive(b.getAttribute('data-tab'));
  });
  setActive('tab-overview');

  // Footer
  const closeBtn = el('button', { class:'btn' }, 'Close');
  closeBtn.onclick = () => close();
  footer.append(closeBtn);

  /* --------------------- renderers --------------------- */

  async function renderOverview() {
    sections.overview.innerHTML = '';
    const { data, error } = await sup().from('contacts')
      .select('*')
      .eq('contact_id', contact.contact_id)
      .maybeSingle();

    if (error) {
      sections.overview.append(el('div', 'label', 'Error loading contact.'));
      return;
    }
    const row = data || contact;

    const kv = el('div', {
        style:{
            display:'grid',
            gridTemplateColumns:'200px 1fr',
            gap:'8px',
            maxWidth:'720px'
        }
    });

    Object.entries(row).forEach(([key, val]) => {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
        kv.append(
            el('div','k', label),
            el('div','v', escapeHtml(val ?? '—'))
        );
    });

    sections.overview.append(
        el('div','kicker','Contact Details'),
        el('div','big',displayName),
        el('div',{style:{height:'8px'}}),
        kv
    );
  }

  function renderNotes() {
    sections.notes.innerHTML = '';

    // Header
    const head = el('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }});
    head.append(el('div','kicker','Campaign Notes'));
    sections.notes.append(head);

    // Container for results
    const listBox = el('div', { style:{ marginTop:'4px' }});
    sections.notes.append(listBox);

    (async () => {
      listBox.innerHTML = el('div','label','Loading…').outerHTML;

      const { data, error } = await sup().from('campaign_progress')
       .select('campaign_name, notes, call_time, updated_at, created_at')
        .eq('contact_id', contact.contact_id)
        // Order primarily by call_time (newest first), then fallback to updated_at if call_time is null
        .order('call_time', { ascending: false, nulls: 'last' })
        .order('updated_at', { ascending: false, nulls: 'last' })
        .limit(1000);

      listBox.innerHTML = '';

      if (error) {
        listBox.append(el('div','label','Error loading campaign notes.'));
        return;
      }
      if (!data?.length) {
        listBox.append(el('div','label','No campaign notes yet.'));
        return;
     }

      const table = tableView(['When','Campaign','Notes']);
      data.forEach(r => {
        const when = fmtDate(r.call_time || r.updated_at || r.created_at);
        tr(table.tbody,
          when,
          r.campaign_name || '—',
          r.notes || '—'
        );
      });
      listBox.append(table.node);
    })();
  }


  /* ---------------------- UI helpers ---------------------- */

  function setActive(id) {
    const map = {
      'tab-overview':     sections.overview,
      'tab-notes':        sections.notes,
      'tab-interactions': sections.interactions,
    };
    Object.keys(map).forEach(k => map[k].style.display = 'none');
    (map[id] || sections.overview).style.display = '';
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
}

export default openProfileModal;
