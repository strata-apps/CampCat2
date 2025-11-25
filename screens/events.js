// screens/events.js
// Events management screen: create, list, edit attendance, delete.
// Table: public.events(event_id, event_name, contact_ids json, event_date)
// Requires: window.supabase client

import { openRsvpModal } from '../functions/rsvp.js';


export default async function EventsScreen(root) {
  const sup = () => window.supabase;
  root.innerHTML = '';

  // ---------- small helpers ----------
  const el = (t, a = {}, ...k) => {
    if (typeof a === 'string') a = { class: a };
    if (a == null) a = {};
    const n = document.createElement(t);
    for (const [k2, v] of Object.entries(a)) {
      if (k2 === 'class') n.className = v;
      else if (k2 === 'style' && v && typeof v === 'object') Object.assign(n.style, v);
      else if (k2.startsWith('on') && typeof v === 'function') n[k2] = v;
      else if (v != null) n.setAttribute(k2, v);
    }
    for (const kid of k.flat()) {
      if (kid == null) continue;
      n.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return n;
  };
  const div = (a, ...k) => el('div', a, ...k);
  const btn = (label, cls = 'btn', on) => {
    const b = el('button', { class: cls }, label);
    if (on) b.onclick = on;
    return b;
  };
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  };
  const log = (m) => {
    try {
      const box = document.getElementById('console-log') || (() => {
        const c = el('pre', { id: 'console-log', style: { background: '#0b1020', color: '#9dd', padding: '8px', borderRadius: '8px', fontSize: '12px', overflowX: 'auto' } });
        root.appendChild(div({ style: { marginTop: '16px' } }, c));
        return c;
      })();
      box.textContent += (m + '\n');
    } catch {}
  };

  // ---------- header ----------
  const header = div({ class: 'card', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' } },
    div(null,
      el('div', 'kicker', 'Events'),
      el('div', 'label', 'Create events and track attendance from your contacts list.')
    ),
    div(null,
      btn('New Event', 'btn-primary', () => openCreateEventModal())
    )
  );
  root.appendChild(header);

  // ---------- list container (scrollable) ----------
  const listWrap = el('div', { style: { position: 'relative', marginTop: '12px' } });
  const scrollBox = el('div', {
    style: {
      maxHeight: '67vh',
      overflow: 'auto',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      padding: '8px',
      scrollBehavior: 'smooth',
      background: '#fff'
    }
  });
  listWrap.appendChild(scrollBox);
  root.appendChild(listWrap);

  // ---------- load + render ----------
  await renderList();

  async function renderList() {
    scrollBox.innerHTML = '';
    const s = sup();
    if (!s) {
      scrollBox.appendChild(div('label', 'Supabase client not available.'));
      return;
    }

    const { data, error } = await s.from('events')
      .select('event_id, event_name, contact_ids, event_date', 'campaign_id', 'rsvp_ids')
      .order('event_date', { ascending: false })
      .limit(1000);

    if (error) {
      log('Events load error: ' + error.message);
      scrollBox.appendChild(div(null,
        el('div', 'label', 'Error loading events.'),
        el('div', 'label', 'Details: ' + (error.message || 'Unknown'))
      ));
      return;
    }

    const rows = data || [];
    if (!rows.length) {
      scrollBox.appendChild(div('label', 'No events yet. Click “New Event” to create one.'));
      return;
    }

    for (const r of rows) {
      scrollBox.appendChild(renderEventCard(r));
    }
  }

  // ---------- event card ----------
  function renderEventCard(ev) {
    const attendance = Array.isArray(ev.contact_ids) ? ev.contact_ids.length : 0;

    const card = div({ class: 'card', style: {
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      gap: '10px',
      alignItems: 'center',
      padding: '14px',
      marginBottom: '10px',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      background: '#ffffff'
    }},
      div(null,
        el('div', 'kicker', 'Event'),
        el('div', { style: { fontWeight: '800', fontSize: '18px', color: '#0f172a' } }, ev.event_name || '—'),
        div({ style: { display: 'flex', gap: '16px', marginTop: '6px', flexWrap: 'wrap' } },
          div(null, el('div', 'label', 'Event Date'), el('div', null, fmtDate(ev.event_date))),
          div(null, el('div', 'label', 'Total Attendance'), el('div', null, String(attendance))),
        )
      ),
      div({ style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
        // RSVP / Campaign button
        ev.campaign_id
          ? btn('View RSVP', 'btn', () => openRsvpModal(ev))
          : btn('Link Campaign', 'btn', () => openLinkCampaignModal(ev)),

        btn('Edit Attendance', 'btn', () => openEditAttendanceModal(ev)),
        btn('Export CSV', 'btn', () => exportEventCSV(ev)),
        btn('Delete', 'btn', () => deleteEvent(ev))
      )
    );
    return card;
  }

  // ---------- create event modal ----------
  function openCreateEventModal() {
    const { close, body, footer, titleEl } = buildModal('Create Event');
    titleEl.appendChild(el('div', 'label', 'Add a new event and (optionally) set initial attendance.'));

    const name = document.createElement('input');
    name.placeholder = 'Event name';
    styleInput(name);

    const date = document.createElement('input');
    date.type = 'date';
    styleInput(date);

    // Optional initial attendance
    const attWrap = div(null,
      el('div', 'kicker', 'Initial Attendance'),
      el('div', 'label', 'Select contacts who attended')
    );
    const chooser = renderContactChooser({ selected: new Set() });
    attWrap.appendChild(chooser.node);

    body.append(
      div({ class: 'kv' }, el('div', 'k', 'Event Name'), el('div', 'v', name)),
      div({ class: 'kv' }, el('div', 'k', 'Event Date'), el('div', 'v', date)),
      div({ style: { height: '8px' } }),
      attWrap
    );

    const cancel = btn('Cancel', 'btn', () => close());
    const save = btn('Save Event', 'btn-primary', async () => {
      try {
        const s = sup();
        const nm = (name.value || '').trim();
        const dt = date.value ? new Date(date.value).toISOString() : null;
        if (!nm || !dt) {
          alert('Please provide an event name and date.');
          return;
        }
        const ids = Array.from(chooser.selected);

        const { error } = await s.from('events').insert({
          event_name: nm,
          event_date: dt,
          contact_ids: ids
        });
        if (error) throw error;

        close();
        await renderList();
      } catch (e) {
        alert('Failed to create event.\n' + (e?.message || e));
      }
    });

    footer.append(cancel, save);
  }

  // ---------- link campaign modal ----------
    // ---------- link campaign to event ----------
  function openLinkCampaignModal(ev) {
    const { close, body, footer, titleEl } = buildModal('Link Call Campaign');
    titleEl.appendChild(el('div', 'label', `Attach a call campaign to “${ev.event_name}” so RSVPs can sync automatically from call responses.`));

    const note = el('div', 'label',
      'Paste the campaign_id from your call_campaigns table. Any contacts who responded "Yes" in that campaign will appear in the RSVP list.'
    );
    note.style.marginBottom = '8px';

    const input = document.createElement('input');
    input.placeholder = 'campaign_id (UUID)';
    styleInput(input);

    body.append(
      note,
      div({ class: 'kv' },
        el('div', 'k', 'campaign_id'),
        el('div', 'v', input)
      )
    );

    const cancel = btn('Cancel', 'btn', () => close());
    const save = btn('Save Link', 'btn-primary', async () => {
      const raw = (input.value || '').trim();
      if (!raw) {
        alert('Please paste a campaign_id.');
        return;
      }

      try {
        const s = sup();

        // Optional: verify the campaign exists
        const { data: camp, error: cErr } = await s
          .from('call_campaigns')
          .select('campaign_id, campaign_name')
          .eq('campaign_id', raw)
          .maybeSingle();

        if (cErr) {
          console.error('[events] call_campaigns lookup error', cErr);
        }

        if (!camp) {
          const ok = confirm(
            'No call campaign was found with that campaign_id.\n\n' +
            'Do you still want to link it?'
          );
          if (!ok) return;
        }

        const { error } = await s
          .from('events')
          .update({ campaign_id: raw })
          .eq('event_id', ev.event_id);

        if (error) throw error;

        close();
        await renderList();
      } catch (e) {
        console.error('[events] link campaign failed', e);
        alert('Failed to link campaign.\n' + (e?.message || e));
      }
    });

    footer.append(cancel, save);
  }


  // ---------- edit attendance modal ----------
  function openEditAttendanceModal(ev) {
    const { close, body, footer, titleEl } = buildModal('Edit Attendance');
    titleEl.appendChild(el('div', 'label', `Update attendance for “${ev.event_name}”`));

    const preselected = new Set(Array.isArray(ev.contact_ids) ? ev.contact_ids : []);
    const chooser = renderContactChooser({ selected: preselected });
    body.appendChild(chooser.node);

    const cancel = btn('Cancel', 'btn', () => close());
    const save = btn('Save Changes', 'btn-primary', async () => {
      try {
        const s = sup();
        const ids = Array.from(chooser.selected);
        const { error } = await s.from('events')
          .update({ contact_ids: ids })
          .eq('event_id', ev.event_id);
        if (error) throw error;
        close();
        await renderList();
      } catch (e) {
        alert('Failed to update attendance.\n' + (e?.message || e));
      }
    });

    footer.append(cancel, save);
  }

  // ---------- delete ----------
  async function deleteEvent(ev) {
    if (!confirm(`Delete event "${ev.event_name}"? This cannot be undone.`)) return;
    try {
      const s = sup();
      const { error } = await s.from('events').delete().eq('event_id', ev.event_id);
      if (error) throw error;
      await renderList();
    } catch (e) {
      alert('Failed to delete event.\n' + (e?.message || e));
    }
  }

  // ---------- export attendance as CSV ----------
  async function exportEventCSV(ev) {
    try {
      const s = sup();
      if (!s) {
        alert('Supabase client not available.');
        return;
      }

      const ids = Array.isArray(ev.contact_ids) ? ev.contact_ids.map(String) : [];
      if (!ids.length) {
        alert('This event has no recorded attendance to export.');
        return;
      }

      // Get contacts for this event's attendees
      const { data, error } = await s
        .from('contacts')
        .select('contact_id, contact_first, contact_last, contact_email')
        .in('contact_id', ids);

      if (error) throw error;

      const rows = Array.isArray(data) ? data.slice() : [];

      // Sort by last, then first (like attendance/profile views)
      rows.sort((a, b) => {
        const lastA = (a.contact_last || '').toLowerCase();
        const lastB = (b.contact_last || '').toLowerCase();
        if (lastA < lastB) return -1;
        if (lastA > lastB) return 1;
        const firstA = (a.contact_first || '').toLowerCase();
        const firstB = (b.contact_first || '').toLowerCase();
        if (firstA < firstB) return -1;
        if (firstA > firstB) return 1;
        return 0;
      });

      // Build CSV
      const header = [
        'Event Name',
        'Event Date',
        'Contact ID',
        'First Name',
        'Last Name',
        'Email'
      ];

      const eventDateStr = ev.event_date
        ? new Date(ev.event_date).toLocaleDateString()
        : '';

      const lines = [];
      lines.push(header.map(csvEscape).join(','));

      for (const c of rows) {
        const line = [
          ev.event_name || '',
          eventDateStr,
          c.contact_id || '',
          c.contact_first || '',
          c.contact_last || '',
          c.contact_email || ''
        ].map(csvEscape).join(',');
        lines.push(line);
      }

      const csv = lines.join('\n');

      // Download in browser
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

      // Safe-ish filename: event-name_YYYY-MM-DD.csv
      const baseName = (ev.event_name || 'event')
        .toString()
        .trim()
        .replace(/[^\w\-]+/g, '_');

      const datePart = ev.event_date
        ? new Date(ev.event_date).toISOString().slice(0, 10)
        : 'attendance';

      const fileName = `${baseName}_${datePart}_attendance.csv`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[events] exportEventCSV failed', e);
      alert('Failed to export CSV.\n' + (e?.message || e));
    }
  }

  // Small CSV escaper (wraps in quotes when needed)
  function csvEscape(value) {
    const s = value == null ? '' : String(value);
    if (/[",\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }



  // ---------- contact chooser (multi-select with search, select all/clear) ----------
  function renderContactChooser({ selected = new Set() } = {}) {
    const node = div({ class: 'card', style: { border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px' } });

    const bar = div({ style: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' } },
      div(null, el('div', 'kicker', 'Contacts')),
      div(null,
        btn('Select All', 'btn', () => { items.forEach(it => selected.add(it.contact_id)); renderList(); }),
        btn('Clear', 'btn', () => { selected.clear(); renderList(); })
      )
    );

    const search = document.createElement('input');
    search.placeholder = 'Search name/email…';
    styleInput(search);
    search.style.maxWidth = '280px';

    bar.insertBefore(search, bar.lastChild);
    node.appendChild(bar);

    const box = el('div', { style: { maxHeight: '42vh', overflow: 'auto', border: '1px solid #eef2f7', borderRadius: '8px', marginTop: '8px' } });
    node.appendChild(box);

    let all = [];
    let items = [];
    let loading = false;

    init();

    async function init() {
      loading = true;
      box.innerHTML = '';
      box.appendChild(div('label', 'Loading contacts…'));

      const s = sup();
      const { data, error } = await s.from('contacts')
        .select('contact_id, contact_first, contact_last, contact_email')
        .order('contact_last', { ascending: true })
        .order('contact_first', { ascending: true })
        .limit(5000);
      box.innerHTML = '';
      loading = false;

      if (error) {
        box.appendChild(div(null, el('div', 'label', 'Failed to load contacts.'), el('div', 'label', error.message || '')));
        return;
      }
      all = data || [];
      items = all.slice(0);
      renderList();
    }

    function renderList() {
      if (loading) return;
      const q = (search.value || '').toLowerCase().trim();
      const rows = q ? all.filter(r => {
        const name = [r.contact_first, r.contact_last].filter(Boolean).join(' ').toLowerCase();
        const email = (r.contact_email || '').toLowerCase();
        return name.includes(q) || email.includes(q);
      }) : all;

      box.innerHTML = '';

      if (!rows.length) {
        box.appendChild(div('label', 'No contacts found.'));
        return;
      }

      for (const r of rows) {
        const line = div({ style: { display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: '8px', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid #f1f5f9' } });
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = selected.has(r.contact_id);
        chk.onchange = () => {
          if (chk.checked) selected.add(r.contact_id);
          else selected.delete(r.contact_id);
        };
        const label = div(null,
          el('div', null, [r.contact_first, r.contact_last].filter(Boolean).join(' ') || '—'),
          el('div', 'label', r.contact_email || '—')
        );
        const badge = div({ class: 'label', style: { color: chk.checked ? '#16a34a' : '#64748b' } }, chk.checked ? 'Selected' : '—');
        line.append(chk, label, badge);
        box.appendChild(line);
      }
    }

    search.addEventListener('input', () => renderList());

    return { node, selected };
  }

  // ---------- modal ----------
  function buildModal(title) {
    const wrap = el('div', { style: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.28)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }});
    const card = el('div', { class: 'card', style: {
      width: 'min(860px, 94vw)', maxHeight: '82vh', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', background: '#fff',
      borderRadius: '14px', border: '1px solid #e5e7eb', boxShadow: '0 10px 30px rgba(2,6,23,.18)'
    }});
    const head = el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #eef2f7' }},
      div(null, el('div', 'kicker', 'Events'), el('div', { style: { fontWeight: '800', fontSize: '18px' } }, title)),
      btn('✕', 'btn', () => close())
    );
    const body = el('div', { style: { padding: '12px 14px', overflow: 'auto', flex: '1' }});
    const footer = el('div', { style: { padding: '10px 14px', borderTop: '1px solid #eef2f7', display: 'flex', justifyContent: 'flex-end', gap: '8px' }});

    card.append(head, body, footer);
    wrap.append(card);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    document.body.appendChild(wrap);

    function close() { wrap.remove(); }

    const titleEl = head.querySelector('div > div:nth-child(2)') || head;

    return { close, body, footer, titleEl };
  }

  function styleInput(inp) {
    Object.assign(inp.style, {
      width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontFamily: 'inherit', fontSize: '14px'
    });
  }
}
