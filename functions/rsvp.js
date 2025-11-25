// functions/rsvp.js
// Popup modal that shows RSVP list for a given event.
// Logic:
// - Requires events(event_id, event_name, event_date, campaign_id)
// - Requires call_progress(campaign_id, contact_id, response)
// - Requires contacts(contact_id, contact_first, contact_last, contact_email)
//
// A contact is considered RSVP'd if they have response = 'Yes'
// in call_progress for this event's campaign_id.

const sup = () => window.supabase;

export async function openRsvpModal(ev) {
  try {
    const s = sup();
    if (!s) {
      alert('Supabase client not available.');
      return;
    }

    if (!ev || !ev.campaign_id) {
      alert('No campaign is linked to this event yet.\nLink a campaign first.');
      return;
    }

    // Build modal shell
    const { wrap, body, footer, close } = buildModalShell(ev);

    // Loading state
    body.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'label';
    loading.textContent = 'Loading RSVPs…';
    body.appendChild(loading);

    // 1) Get all "Yes" responses for this campaign
    const { data: progRows, error: progErr } = await s
      .from('call_progress')
      .select('contact_id, response')
      .eq('campaign_id', ev.campaign_id)
      .eq('response', 'Yes');

    if (progErr) {
      console.error('[rsvp] call_progress error', progErr);
      body.innerHTML = '';
      body.appendChild(label('Error loading RSVP responses.'));
      return;
    }

    const yesRows = Array.isArray(progRows) ? progRows : [];
    const idSet = new Set(
      yesRows
        .map(r => r.contact_id)
        .filter(Boolean)
        .map(String)
    );

    if (!idSet.size) {
      body.innerHTML = '';
      body.appendChild(label('No RSVPs yet. Contacts will appear here when they respond "Yes" in your call campaign.'));
      return;
    }

    const ids = Array.from(idSet);

    // 2) Fetch contact details for those IDs
    const { data: contacts, error: cErr } = await s
      .from('contacts')
      .select('contact_id, contact_first, contact_last, contact_email')
      .in('contact_id', ids);

    if (cErr) {
      console.error('[rsvp] contacts error', cErr);
      body.innerHTML = '';
      body.appendChild(label('Error loading RSVP contacts.'));
      return;
    }

    const rows = Array.isArray(contacts) ? contacts.slice() : [];

    // Sort like other places: last -> first
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

    // 3) Render table
    body.innerHTML = '';

    const summary = document.createElement('div');
    summary.className = 'label';
    summary.style.marginBottom = '8px';
    summary.textContent = `Total RSVPs: ${rows.length}`;
    body.appendChild(summary);

    const { table, tbody } = buildTable(['Name', 'Email', 'Contact ID']);
    rows.forEach((c) => {
      const name = [c.contact_first, c.contact_last].filter(Boolean).join(' ') || '—';
      addRow(tbody, [
        name,
        c.contact_email || '—',
        c.contact_id || '—',
      ]);
    });

    body.appendChild(table);

    // footer: Close
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => close();
    footer.appendChild(closeBtn);
  } catch (e) {
    console.error('[rsvp] openRsvpModal failed', e);
    alert('Failed to load RSVPs.\n' + (e?.message || e));
  }
}

/* ------------ helpers ------------ */

function buildModalShell(ev) {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,.28)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const card = document.createElement('div');
  card.className = 'card';
  Object.assign(card.style, {
    width: 'min(860px, 94vw)',
    maxHeight: '82vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    background: '#fff',
    borderRadius: '14px',
    border: '1px solid #e5e7eb',
    boxShadow: '0 10px 30px rgba(2,6,23,.18)',
  });

  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    borderBottom: '1px solid #eef2f7',
  });

  const left = document.createElement('div');
  const kicker = document.createElement('div');
  kicker.className = 'kicker';
  kicker.textContent = 'RSVPs';

  const title = document.createElement('div');
  title.style.fontWeight = '800';
  title.style.fontSize = '18px';
  title.textContent = ev?.event_name
    ? `RSVPs for “${ev.event_name}”`
    : 'RSVP List';

  const sub = document.createElement('div');
  sub.className = 'label';
  sub.textContent = ev?.campaign_id
    ? 'Contacts who responded "Yes" in the linked call campaign.'
    : 'Link a campaign to start tracking RSVPs from call responses.';

  left.append(kicker, title, sub);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn';
  closeBtn.textContent = '✕';

  const close = () => wrap.remove();
  closeBtn.onclick = () => close();

  header.append(left, closeBtn);

  const body = document.createElement('div');
  Object.assign(body.style, {
    padding: '12px 14px',
    overflow: 'auto',
    flex: '1',
  });

  const footer = document.createElement('div');
  Object.assign(footer.style, {
    padding: '10px 14px',
    borderTop: '1px solid #eef2f7',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  });

  card.append(header, body, footer);
  wrap.appendChild(card);

  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) close();
  });

  document.body.appendChild(wrap);

  return { wrap, body, footer, close };
}

function label(text) {
  const n = document.createElement('div');
  n.className = 'label';
  n.textContent = text;
  return n;
}

function buildTable(headers) {
  const table = document.createElement('table');
  table.className = 'table';
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';

  const thead = document.createElement('thead');
  const tr = document.createElement('tr');

  headers.forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    th.style.padding = '10px';
    th.style.borderBottom = '1px solid rgba(0,0,0,.08)';
    th.style.textAlign = 'left';
    tr.appendChild(th);
  });

  thead.appendChild(tr);
  const tbody = document.createElement('tbody');
  table.append(thead, tbody);

  return { table, tbody };
}

function addRow(tbody, cells) {
  const tr = document.createElement('tr');
  cells.forEach((c) => {
    const td = document.createElement('td');
    td.style.padding = '10px';
    td.style.borderBottom = '1px solid rgba(0,0,0,.06)';
    td.textContent = c == null ? '' : String(c);
    tr.appendChild(td);
  });
  tbody.appendChild(tr);
}
