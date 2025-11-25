// functions/rsvp.js
// RSVP modal for an event.
//
// Logic:
// - events(event_id, event_name, event_date, campaign_id, rsvp_ids jsonb)
// - call_progress(campaign_id, contact_id, response)
// - contacts(contact_id, contact_first, contact_last, contact_email)
//
// Auto RSVPs: contacts with response = 'Yes' in call_progress for this campaign_id
// Manual RSVPs: stored in events.rsvp_ids (array of contact_id)
// Displayed RSVP list = union(auto, manual)
// User can manually add RSVPs from this screen (stored in rsvp_ids).

const sup = () => window.supabase;

export async function openRsvpModal(ev) {
  try {
    const s = sup();
    if (!s) {
      alert('Supabase client not available.');
      return;
    }

    if (!ev || !ev.event_id) {
      alert('Missing event_id for RSVP view.');
      return;
    }

    // Always pull fresh event data (campaign_id + rsvp_ids)
    const { data: eventRow, error: eventErr } = await s
      .from('events')
      .select('event_id, event_name, event_date, campaign_id, rsvp_ids')
      .eq('event_id', ev.event_id)
      .maybeSingle();

    if (eventErr) {
      console.error('[rsvp] event load error', eventErr);
      alert('Error loading event for RSVPs.');
      return;
    }
    if (!eventRow) {
      alert('Event not found.');
      return;
    }

    if (!eventRow.campaign_id) {
      alert('No campaign is linked to this event yet.\nLink a campaign first.');
      return;
    }

    // Build modal shell
    const { body, footer, close } = buildModalShell(eventRow);

    // Render contents (auto + manual RSVPs and manual-add UI)
    await renderRsvpContent({ s, ev: eventRow, body, footer, close });
  } catch (e) {
    console.error('[rsvp] openRsvpModal failed', e);
    alert('Failed to load RSVPs.\n' + (e?.message || e));
  }
}

/* ------------ main content renderer ------------ */

async function renderRsvpContent({ s, ev, body, footer, close }) {
  body.innerHTML = '';
  footer.innerHTML = '';

  // Loading state
  const loading = document.createElement('div');
  loading.className = 'label';
  loading.textContent = 'Loading RSVPs…';
  body.appendChild(loading);

  // 1) Auto RSVPs (Yes responses in call_progress)
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
  const autoIds = new Set(
    yesRows
      .map(r => r.contact_id)
      .filter(Boolean)
      .map(String)
  );

  // 2) Manual RSVPs from events.rsvp_ids
  const manualIds = new Set(
    Array.isArray(ev.rsvp_ids)
      ? ev.rsvp_ids.map(String)
      : []
  );

  // 3) Combined RSVP set
  const combinedIds = new Set([...autoIds, ...manualIds]);
  const combinedArr = Array.from(combinedIds);

  body.innerHTML = '';

  // Summary + info
  const summary = document.createElement('div');
  summary.className = 'label';
  summary.style.marginBottom = '8px';

  const autoCount = autoIds.size;
  const manualCount = manualIds.size;
  summary.textContent =
    `Total RSVPs: ${combinedIds.size}  •  From calls: ${autoCount}  •  Manual: ${manualCount}`;
  body.appendChild(summary);

  // If no RSVPs yet, show friendly message
  if (!combinedIds.size) {
    body.appendChild(
      label('No RSVPs yet. RSVPs will appear here when contacts respond "Yes" in your call campaign, or you can add RSVPs manually below.')
    );
  }

  // 4) Fetch contact details for combined IDs (if any)
  let rsvpContacts = [];
  if (combinedArr.length) {
    const { data: contacts, error: cErr } = await s
      .from('contacts')
      .select('contact_id, contact_first, contact_last, contact_email')
      .in('contact_id', combinedArr);

    if (cErr) {
      console.error('[rsvp] contacts error', cErr);
      body.appendChild(label('Error loading RSVP contacts.'));
    } else {
      rsvpContacts = Array.isArray(contacts) ? contacts.slice() : [];
      // Sort by last, then first
      rsvpContacts.sort((a, b) => {
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
    }
  }

  // 5) Render RSVP table (if any)
  if (rsvpContacts.length) {
    const { table, tbody } = buildTable(['Name', 'Email', 'Source', 'Contact ID']);
    rsvpContacts.forEach((c) => {
      const id = String(c.contact_id);
      const name = [c.contact_first, c.contact_last].filter(Boolean).join(' ') || '—';
      const source =
        autoIds.has(id) && manualIds.has(id)
          ? 'Call "Yes" + Manual'
          : autoIds.has(id)
            ? 'Call "Yes"'
            : 'Manual';

      addRow(tbody, [
        name,
        c.contact_email || '—',
        source,
        c.contact_id || '—',
      ]);
    });
    body.appendChild(table);
  }

  // Divider
  const divider = document.createElement('hr');
  divider.style.margin = '14px 0';
  divider.style.border = 'none';
  divider.style.borderTop = '1px solid #e5e7eb';
  body.appendChild(divider);

  // 6) Manual RSVP add section
  const manualSectionTitle = document.createElement('div');
  manualSectionTitle.className = 'kicker';
  manualSectionTitle.textContent = 'Add RSVPs Manually';
  body.appendChild(manualSectionTitle);

  const manualHint = label(
    'Search your contacts and add anyone who has verbally confirmed or RSVPed outside the call campaign.'
  );
  manualHint.style.marginBottom = '6px';
  body.appendChild(manualHint);

  const manualBox = document.createElement('div');
  Object.assign(manualBox.style, {
    border: '1px solid #eef2f7',
    borderRadius: '8px',
    padding: '8px',
  });
  body.appendChild(manualBox);

  const searchRow = document.createElement('div');
  Object.assign(searchRow.style, {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '6px',
    flexWrap: 'wrap',
  });

  const searchInput = document.createElement('input');
  searchInput.placeholder = 'Search contacts by name or email…';
  styleInput(searchInput);
  searchInput.style.maxWidth = '280px';

  const infoLabel = label('Only contacts who are not already in the RSVP list will show here.');
  infoLabel.style.margin = '0';

  searchRow.appendChild(searchInput);
  searchRow.appendChild(infoLabel);
  manualBox.appendChild(searchRow);

  const scroll = document.createElement('div');
  Object.assign(scroll.style, {
    maxHeight: '32vh',
    overflow: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
  });
  manualBox.appendChild(scroll);

  let available = [];
  let filtered = [];
  const selectedNew = new Set();

  await loadAvailableContacts();

  searchInput.addEventListener('input', () => renderAvailableList());

  // Footer buttons
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn';
  closeBtn.textContent = 'Close';
  closeBtn.onclick = () => close();

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary';
  saveBtn.textContent = 'Save Manual RSVPs';
  saveBtn.onclick = async () => {
    if (!selectedNew.size) {
      alert('Select at least one contact to add as an RSVP, or close this window.');
      return;
    }
    try {
      // Merge existing manual IDs with new ones
      const nextManual = new Set([...manualIds, ...selectedNew]);
      const nextManualArr = Array.from(nextManual);

      const { error: upErr } = await s
        .from('events')
        .update({ rsvp_ids: nextManualArr })
        .eq('event_id', ev.event_id);

      if (upErr) throw upErr;

      close();
      // Re-open to show updated counts
      openRsvpModal({ event_id: ev.event_id });
    } catch (e) {
      console.error('[rsvp] update rsvp_ids failed', e);
      alert('Failed to save manual RSVPs.\n' + (e?.message || e));
    }
  };

  footer.append(closeBtn, saveBtn);

  // ----- helpers inside renderRsvpContent -----

  async function loadAvailableContacts() {
    scroll.innerHTML = '';
    scroll.appendChild(label('Loading contacts…'));

    const { data, error } = await s
      .from('contacts')
      .select('contact_id, contact_first, contact_last, contact_email')
      .order('contact_last', { ascending: true })
      .order('contact_first', { ascending: true })
      .limit(5000);

    if (error) {
      console.error('[rsvp] load contacts for manual RSVPs error', error);
      scroll.innerHTML = '';
      scroll.appendChild(label('Failed to load contacts for manual RSVPs.'));
      return;
    }

    // Only those NOT already in combined RSVP set
    available = (data || []).filter((c) => !combinedIds.has(String(c.contact_id)));
    filtered = available.slice();
    renderAvailableList();
  }

  function renderAvailableList() {
    const q = (searchInput.value || '').toLowerCase().trim();
    const rows = q
      ? available.filter((r) => {
          const name = [r.contact_first, r.contact_last].filter(Boolean).join(' ').toLowerCase();
          const email = (r.contact_email || '').toLowerCase();
          return name.includes(q) || email.includes(q);
        })
      : available;

    scroll.innerHTML = '';

    if (!rows.length) {
      scroll.appendChild(label('No contacts available to add.'));
      return;
    }

    for (const c of rows) {
      const id = String(c.contact_id);
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'grid',
        gridTemplateColumns: '28px 1fr auto',
        gap: '8px',
        alignItems: 'center',
        padding: '6px 8px',
        borderBottom: '1px solid #f1f5f9',
      });

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = selectedNew.has(id);
      chk.onchange = () => {
        if (chk.checked) selectedNew.add(id);
        else selectedNew.delete(id);
      };

      const name = [c.contact_first, c.contact_last].filter(Boolean).join(' ') || '—';
      const labelNode = document.createElement('div');
      const nameEl = document.createElement('div');
      nameEl.textContent = name;
      const emailEl = document.createElement('div');
      emailEl.className = 'label';
      emailEl.textContent = c.contact_email || '—';
      labelNode.appendChild(nameEl);
      labelNode.appendChild(emailEl);

      const badge = document.createElement('div');
      badge.className = 'label';
      badge.style.color = selectedNew.has(id) ? '#16a34a' : '#64748b';
      badge.textContent = selectedNew.has(id) ? 'Will add' : '—';

      row.append(chk, labelNode, badge);
      scroll.appendChild(row);
    }
  }
}

/* ------------ helpers shared in this file ------------ */

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
    ? 'Contacts who responded "Yes" in the linked call campaign, plus any manual RSVPs.'
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

  return { body, footer, close };
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

function styleInput(inp) {
  Object.assign(inp.style, {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontFamily: 'inherit',
    fontSize: '13px',
  });
}
