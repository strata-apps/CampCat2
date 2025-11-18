// functions/attendance.js
// Renders an Attendance section for a single contact.
// Usage: renderAttendance(containerEl, { contact_id })

const sup = () => window.supabase;

export function renderAttendance(container, { contact_id }) {
  if (!container) return;

  // Clear container
  container.innerHTML = '';

  // Heading (match profile.js tab style)
  const kicker = document.createElement('div');
  kicker.className = 'kicker';
  kicker.textContent = 'Attendance';

  const sub = document.createElement('div');
  sub.className = 'label';
  sub.textContent = 'Events this contact has attended.';

  container.append(kicker, sub);

  // Async load
  (async () => {
    try {
      const s = sup();
      if (!s) {
        container.append(childLabel('Supabase client not available.'));
        return;
      }

      const contactId = String(contact_id);
      // Same trick as in profile.js: use `cs` (contains) on the JSON array
      const rhs = `["${contactId}"]`;

      const { data, error } = await s
        .from('events')
        .select('event_name, event_date, contact_ids')
        .filter('contact_ids', 'cs', rhs)
        .order('event_date', { ascending: false });

      if (error) {
        container.append(childLabel('Error loading attendance.'));
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) {
        container.append(childLabel('No recorded attendance for this contact.'));
        return;
      }

      // Build table: Event | Date (same as profile.js)
      const { node: table, tbody } = tableView(['Event', 'Date']);
      rows.forEach((r) => {
        const name = r.event_name || '—';
        const date = r.event_date
          ? new Date(r.event_date).toLocaleDateString()
          : '—';
        tr(tbody, name, date);
      });

      container.append(table);
    } catch (e) {
      console.error('[attendance] renderAttendance failed', e);
      container.append(childLabel('Error loading attendance.'));
    }
  })();

  /* --------- small helpers (same style as profile.js) --------- */

  function childLabel(text) {
    const n = document.createElement('div');
    n.className = 'label';
    n.textContent = text;
    return n;
  }

  function tableView(headers) {
    const table = document.createElement('table');
    table.className = 'table';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');

    headers.forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      th.style.padding = '10px';
      th.style.borderBottom = '1px solid rgba(0,0,0,.08)';
      th.style.textAlign = 'left';
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
      td.style.padding = '10px';
      td.style.borderBottom = '1px solid rgba(0,0,0,.06)';
      td.textContent = c == null ? '' : String(c);
      row.appendChild(td);
    });
    tbody.appendChild(row);
  }
}
