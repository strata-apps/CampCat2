// screens/contacts.js
// Filterable contacts table + CSV export + per-contact Call/Edit modals + Create Contact
//
// Requires:
//  - window.supabase client
//  - functions/filters.js: mountContactFilters(container), getSelectedFilter(container)
//
// Notes:
//  - "Call" opens a modal to log a single call into public.single_calls
//  - "Edit" opens a modal to update the contact row in public.contacts
//  - "New Contact" opens a modal to insert a contact into public.contacts
//
// Calling modal UI is modeled after patterns in call_execution.js (layout/fields/flow).  :contentReference[oaicite:1]{index=1}

import { mountContactFilters, getSelectedFilter } from '../functions/filters.js';
import { openProfileModal } from '../functions/profile.js';


export default async function ContactsScreen(root) {
  root.innerHTML = '';
  root.classList.add('screen-contacts');

  /* ----------------------------- helpers ----------------------------- */
  const el = (tag, attrs = {}, ...kids) => {
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
  };
  const div = (attrs, ...kids) => el('div', attrs, ...kids);
  const btn = (label, cls = 'btn', on) => {
    const b = el('button', { class: cls }, label);
    if (on) b.onclick = on;
    return b;
  };
  const escapeHtml = (s='') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const nowIso = () => new Date().toISOString();

  /* ------------------------------ shell ------------------------------ */
  const head = div('page-head',
    el('h1', { class: 'page-title' }, 'Contacts'),
    el('div', { class: 'label' }, 'Browse, filter, and manage contacts. Log individual calls or edit details.')
  );

  const bar = div({ class: 'card', style: { display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' } },
    div(null,
      el('div', { class: 'kicker' }, 'Filters'),
      el('div', { class: 'label' }, 'Use the dropdowns to narrow contacts; then export or call / edit.')
    ),
    div(null,
      btn('New Contact', 'btn', () => openCreateContactModal()),
      btn('Export CSV', 'btn', () => exportCSV())
    )
  );
  const filterRow = div({ class: 'latest-row', style: { gap: '8px', flexWrap: 'wrap', marginTop: '8px' } });
  bar.appendChild(filterRow);

  const listCard = div('card',
    el('div', { class: 'kicker' }, 'Directory'),
    el('div', { class: 'big' }, 'Contacts Table'),
    el('div', { class: 'label', style: { marginTop: '6px' } }, 'Click a first name to call or edit.')
  );
  const listWrap = el('div', { style: { marginTop: '10px' } });
  listCard.appendChild(listWrap);

  const logCard = div('card',
    el('div', { class: 'kicker' }, 'Status'),
    el('pre', { id: 'log', class: 'label', style: { whiteSpace: 'pre-wrap', margin: 0 } }, 'Ready.')
  );

  root.append(head, bar, listCard, logCard);

  // Mount backend-driven filters
  mountContactFilters(filterRow);

  // Apply filter button (optional convenience)
  const applyBtn = btn('Apply Filters', 'btn', () => renderList());
  filterRow.appendChild(applyBtn);

  /* --------------------------- view state --------------------------- */
  let currentRows = []; // rows currently displayed (for CSV export)

  /* ----------------------------- actions ---------------------------- */
  await renderList();

  async function renderList() {
    listWrap.innerHTML = '';
    const s = window.supabase;
    if (!s?.from) {
      listWrap.appendChild(div('label', 'Supabase client not available.'));
      return;
    }

    // Build base select of useful columns (adjust to your schema)
    let query = s.from('contacts')
      .select('contact_id, contact_first, contact_last, contact_email, contact_phone')
      .order('contact_last', { ascending: true })
      .order('contact_first', { ascending: true });

    // Apply selected filter(s)
    const sel = getSelectedFilter(filterRow);
    if (sel) {
      if (Array.isArray(sel)) {
        for (const f of sel) query = query.eq(f.field, f.value);
      } else if (sel.field && sel.value != null) {
        query = query.eq(sel.field, sel.value);
      }
    }

    const { data, error } = await query.limit(2000);
    if (error) {
      log('Load error: ' + error.message);
      listWrap.appendChild(div('label', 'Error loading contacts.'));
      return;
    }

    currentRows = data || [];

    if (!currentRows.length) {
      listWrap.appendChild(div('label', 'No contacts match your filter.'));
      return;
    }

    // Table
    const table = el('table', { class: 'table', style: { width: '100%', borderCollapse: 'collapse' } });
    table.innerHTML = `
      <thead>
          <tr>
          <th style="padding:10px;border-bottom:1px solid rgba(0,0,0,.08);text-align:left;">Actions</th>
          <th style="padding:10px;border-bottom:1px solid rgba(0,0,0,.08);text-align:left;">First Name</th>
          <th style="padding:10px;border-bottom:1px solid rgba(0,0,0,.08);text-align:left;">Last Name</th>
          <th style="padding:10px;border-bottom:1px solid rgba(0,0,0,.08);text-align:left;">Email</th>
          <th style="padding:10px;border-bottom:1px solid rgba(0,0,0,.08);text-align:left;">Phone</th>
          </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    for (const r of currentRows) {
      const tr = document.createElement('tr');

      // Actions column (first)
      const actCell = el('td', { style: 'padding:10px;border-bottom:1px solid rgba(0,0,0,.06)' },
          div({ style: { display: 'flex', gap: '6px' } },
          btn('Call', 'btn', () => openCallModal(r)),
          btn('Edit', 'btn', () => openEditContactModal(r))
          )
      );

      // First Name column: name + View Profile button underneath
      const firstCell = document.createElement('td');
      firstCell.style = 'padding:10px;border-bottom:1px solid rgba(0,0,0,.06)';
      const nameWrap = div(null,
          el('div', null, escapeHtml(r.contact_first || '—')),
          div({ style: { marginTop: '6px' } },
          btn('View Profile', 'btn', () => openProfileModal(r))
          )
      );
      firstCell.appendChild(nameWrap);

      const lastCell  = el('td', { style: 'padding:10px;border-bottom:1px solid rgba(0,0,0,.06)' }, escapeHtml(r.contact_last || '—'));
      const emailCell = el('td', { style: 'padding:10px;border-bottom:1px solid rgba(0,0,0,.06)' }, escapeHtml(r.contact_email || '—'));
      const phoneCell = el('td', { style: 'padding:10px;border-bottom:1px solid rgba(0,0,0,.06)' }, escapeHtml(r.contact_phone || '—'));

      // NEW order: Actions, First, Last, Email, Phone
      tr.append(actCell, firstCell, lastCell, emailCell, phoneCell);
      tbody.appendChild(tr);
    }


    listWrap.appendChild(table);
  }

  function exportCSV() {
    if (!currentRows.length) return alert('No rows to export.');
    const cols = ['contact_id','contact_first','contact_last','contact_email','contact_phone'];
    const header = cols.join(',');
    const lines = [header];
    for (const r of currentRows) {
      const row = cols.map(k => csvCell(r[k]));
      lines.push(row.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'contacts.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  }
  function csvCell(v) {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  }

  function log(msg) {
    const box = root.querySelector('#log');
    const now = new Date().toLocaleTimeString();
    box.textContent = (box.textContent ? box.textContent + '\n' : '') + `[${now}] ${msg}`;
  }

  /* ------------------------------ Modals ----------------------------- */

  function openCreateContactModal() {
    const { close, body, footer, titleEl } = buildModal('New Contact');
    titleEl.insertAdjacentHTML('beforeend', `<div class="label" style="margin-top:4px">Create a new contact record.</div>`);

    const form = simpleContactForm();
    body.appendChild(form.node);

    const cancel = btn('Cancel', 'btn', () => close());
    const save   = btn('Save Contact', 'btn-primary', async () => {
      try {
        const payload = form.getValues();
        const { error } = await window.supabase.from('contacts').insert(payload);
        if (error) throw error;
        close();
        await renderList();
      } catch (e) {
        alert('Failed to create contact.');
        log('Create contact error: ' + (e?.message || e));
      }
    });
    footer.append(cancel, save);
  }

  function openEditContactModal(row) {
    const { close, body, footer, titleEl } = buildModal('Edit Contact');
    titleEl.insertAdjacentHTML('beforeend', `<div class="label" style="margin-top:4px">Update details for <b>${escapeHtml((row.contact_first||'') + ' ' + (row.contact_last||''))}</b>.</div>`);

    const form = simpleContactForm(row);
    body.appendChild(form.node);

    const cancel = btn('Cancel', 'btn', () => close());
    const save   = btn('Save Changes', 'btn-primary', async () => {
      try {
        const payload = form.getValues();
        const { error } = await window.supabase.from('contacts')
          .update(payload)
          .eq('contact_id', row.contact_id);
        if (error) throw error;
        close();
        await renderList();
      } catch (e) {
        alert('Failed to save contact.');
        log('Edit contact error: ' + (e?.message || e));
      }
    });
    footer.append(cancel, save);
  }

  function simpleContactForm(values = {}) {
    const node = div(null);

    const row = (label, key, type='text', placeholder='') => {
      const wrap = div({ class: 'kv' });
      wrap.append(el('div', 'k', label));
      const v = div('v');
      const inp = document.createElement('input');
      inp.type = type;
      inp.value = values[key] ?? '';
      inp.placeholder = placeholder;
      Object.assign(inp.style, {
        width: '100%',
        padding: '8px 10px',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        fontFamily: 'inherit',
        fontSize: '14px'
      });
      v.appendChild(inp);
      wrap.appendChild(v);
      return { wrap, inp };
    };

    const r1 = row('First Name', 'contact_first', 'text', 'First name');
    const r2 = row('Last Name',  'contact_last',  'text', 'Last name');
    const r3 = row('Email',      'contact_email', 'email', 'name@example.org');
    const r4 = row('Phone',      'contact_phone', 'tel', '(123) 456-7890');

    node.append(r1.wrap, r2.wrap, r3.wrap, r4.wrap);

    const getValues = () => ({
      contact_first: r1.inp.value.trim() || null,
      contact_last:  r2.inp.value.trim() || null,
      contact_email: r3.inp.value.trim() || null,
      contact_phone: r4.inp.value.trim() || null,
    });

    return { node, getValues };
  }

  function openCallModal(contact) {
    const { close, body, footer, titleEl } = buildModal('Log Call');
    const displayName = [contact.contact_first, contact.contact_last].filter(Boolean).join(' ').trim() || 'Contact';
    titleEl.insertAdjacentHTML('beforeend', `
      <div class="label" style="margin-top:4px">Calling <b>${escapeHtml(displayName)}</b></div>
    `);

    // Outcome, Response, Notes UI (mirrors your call execution flow semantics)  :contentReference[oaicite:2]{index=2}
    const form = div(null);

    const fld = (label, node) => {
      const w = div('kv');
      w.append(el('div','k',label), node);
      return w;
    };

    // Outcome
    const outcomeSel = document.createElement('select');
    ['answered','no_answer','busy','voicemail','wrong_number','other'].forEach(v => {
      const opt = document.createElement('option'); opt.value = v; opt.textContent = v.replace('_',' ');
      outcomeSel.appendChild(opt);
    });
    outcomeSel.value = 'answered';

    // Response (optional free text; you can switch to a preset menu if you want)
    const respInp = document.createElement('input');
    respInp.placeholder = 'Response (e.g., Yes / No / Maybe)';
    Object.assign(respInp.style, { width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:'8px' });

    // Notes
    const notesTa = document.createElement('textarea');
    notesTa.rows = 4;
    notesTa.placeholder = 'Notes…';
    Object.assign(notesTa.style, { width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:'8px' });

    form.append(
      fld('Outcome', div('v', outcomeSel)),
      fld('Response', div('v', respInp)),
      fld('Notes', div('v', notesTa)),
    );
    body.appendChild(form);

    const cancel = btn('Cancel', 'btn', () => close());
    const save   = btn('Save Call', 'btn-primary', async () => {
      try {
        const s = window.supabase;
        const { data: { user } } = await s.auth.getUser();
        const user_id = user?.id || null;

        const payload = {
          user_id,
          outcome: outcomeSel.value,
          response: respInp.value.trim() || null,
          notes: notesTa.value.trim() || null,
          call_time: nowIso(),
          update_time: nowIso(),
          last_called_at: nowIso(),
          contact_id: contact.contact_id
        };

        const { error } = await s.from('single_calls').insert(payload);
        if (error) throw error;

        close();
        log(`Saved call for contact_id=${contact.contact_id}`);
      } catch (e) {
        alert('Failed to save call.');
        log('Save single call error: ' + (e?.message || e));
      }
    });
    footer.append(cancel, save);
  }

  function buildModal(title='Modal') {
    const wrap = el('div', { style: {
      position:'fixed', inset:'0', background:'rgba(0,0,0,.28)', zIndex:9999,
      display:'flex', alignItems:'center', justifyContent:'center'
    }});
    const card = el('div', { class:'card', style: {
      width:'min(760px, 92vw)', maxHeight:'82vh', display:'flex', flexDirection:'column',
      padding:'16px', gap:'10px', overflow:'hidden'
    }});
    const head = el('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center' }});
    const titleBox = el('div', null,
      el('div','kicker','Details'),
      el('div','big',title)
    );
    const x = btn('✕','btn', () => close());
    const body = el('div', { style:{ overflow:'auto', padding:'4px 2px' }});
    const footer = el('div', { style:{ display:'flex', justifyContent:'flex-end', gap:'8px' }});
    head.append(titleBox, x);
    card.append(head, body, footer);
    wrap.append(card);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    document.body.appendChild(wrap);
    function close(){ wrap.remove(); }
    return { close, body, footer, titleEl: titleBox };
  }
}
