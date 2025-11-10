// screens/tasks.js
// Task list & creation screen
// - Lists tasks for the signed-in user (public.tasks)
// - "Complete" deletes the row
// - Task creator is hidden until "Create New Task" is clicked
// - Shows contact name (first + last) instead of raw contact_id

import renderTasks from '../functions/tasks_function.js';

export default async function TasksScreen(root) {
  root.innerHTML = '';
  root.classList.add('screen-tasks');

  // --- Safe DOM helpers ---
  const el = (tag, attrs = {}, ...kids) => {
    if (typeof attrs === 'string') attrs = { class: attrs };
    if (attrs == null) attrs = {};
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'style' && v && typeof v === 'object') Object.assign(n.style, v);
      else if (k.startsWith('on') && typeof v === 'function') n[k] = v;
      else if (v !== undefined && v !== null) n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null) continue;
      n.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return n;
  };
  const div = (attrs, ...kids) => el('div', attrs, ...kids);

  const head = div('page-head',
    el('h1', { class: 'page-title' }, 'Tasks'),
    el('div', { class: 'label' }, 'Create and manage your tasks.')
  );

  const listCard = div('card',
    el('div', { class: 'kicker' }, 'Your Tasks'),
    el('div', { class: 'big' }, 'Open Tasks'),
    el('div', { class: 'label', style: { marginTop: '6px' } }, 'Only tasks assigned to you are shown.')
  );
  const listWrap = el('div', { style: { marginTop: '10px' } });
  listCard.appendChild(listWrap);

  // Creator card with toggle button; creator body stays hidden until clicked
  const createCard = div('card',
    el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' } },
      div(null,
        el('div', { class: 'kicker' }, 'Create'),
        el('div', { class: 'big' }, 'New Task')
      ),
      el('div', null,
        el('button', { id: 'btnToggleCreator', class: 'btn' }, 'Create New Task')
      )
    ),
    el('div', { class: 'label', style: { marginTop: '6px' } }, 'Assign to one or many contacts via filters.')
  );
  const creatorMount = el('div', { id: 'creatorMount', style: { display: 'none', marginTop: '12px' } });
  createCard.appendChild(creatorMount);

  const logCard = div('card',
    el('div', { class: 'kicker' }, 'Status'),
    el('pre', { id: 'log', class: 'label', style: { whiteSpace: 'pre-wrap', margin: 0 } }, 'Ready.')
  );

  root.append(head, listCard, createCard, logCard);

  // Toggle mount of the task creator
  const btnToggle = createCard.querySelector('#btnToggleCreator');
  let creatorMounted = false;
  btnToggle.onclick = () => {
    if (creatorMount.style.display === 'none') {
      if (!creatorMounted) {
        creatorMount.appendChild(renderTasks({ contact: null }));
        creatorMounted = true;
      }
      creatorMount.style.display = '';
      btnToggle.textContent = 'Close';
    } else {
      creatorMount.style.display = 'none';
      btnToggle.textContent = 'Create New Task';
    }
  };

  // Load + render list
  await renderList();

  /* -------------------- Functions -------------------- */

  async function renderList() {
    listWrap.innerHTML = '';
    const s = window.supabase;
    if (!s?.auth?.getUser || !s?.from) {
      listWrap.appendChild(div('label', 'Supabase client not available.'));
      return;
    }

    const { data: { user } } = await s.auth.getUser();
    if (!user) {
      listWrap.appendChild(div('label', 'Please sign in to view your tasks.'));
      return;
    }

    // Select with alias for "text" (reserved word) -> task_text
    const { data, error } = await s
      .from('tasks')
      .select('id, task_text:text, active, created_at, contact_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      listWrap.appendChild(div('label', 'Error loading tasks.'));
      log(`Load error: ${error.message}`);
      return;
    }

    if (!data || !data.length) {
      listWrap.appendChild(div('label', 'No tasks yet.'));
      return;
    }

    // Build a map of contact_id -> "First Last"
    const idSet = new Set(data.map(r => r.contact_id).filter(v => v != null));
    const contactNameMap = await fetchContactNames([...idSet]); // { contact_id: "First Last" }

    // Table
    const table = el('table', { class: 'table', style: { width: '100%', borderCollapse: 'collapse' } });
    table.innerHTML = `
      <thead>
        <tr>
          <th style="padding:10px;border-bottom:1px solid rgba(0,0,0,.08);text-align:left;">Task</th>
          <th style="padding:10px;border-bottom:1px solid rgba(0,0,0,.08);text-align:left;">Contact</th>
          <th style="padding:10px;border-bottom:1px solid rgba(0,0,0,.08);text-align:left;">Created</th>
          <th style="padding:10px;border-bottom:1px solid rgba(0,0,0,.08);text-align:left;">Complete</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    for (const r of data) {
      const fullName = contactNameMap.get(String(r.contact_id)) || '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:10px;border-bottom:1px solid rgba(0,0,0,.06)">${escapeHtml(r.task_text || '')}</td>
        <td style="padding:10px;border-bottom:1px solid rgba(0,0,0,.06)">${escapeHtml(fullName)}</td>
        <td style="padding:10px;border-bottom:1px solid rgba(0,0,0,.06)">${fmtDate(r.created_at)}</td>
        <td style="padding:10px;border-bottom:1px solid rgba(0,0,0,.06)">
          <button class="btn" data-complete="${r.id}">Complete</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    table.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-complete]');
      if (!btn) return;
      const id = btn.getAttribute('data-complete');
      const ok = confirm('Mark this task complete? It will be removed.');
      if (!ok) return;
      try {
        const { error: delErr } = await window.supabase.from('tasks').delete().eq('id', id);
        if (delErr) throw delErr;
        log(`Task ${id} deleted.`);
        await renderList();
      } catch (err) {
        log('Delete error: ' + (err?.message || err));
        alert('Could not delete task.');
      }
    });

    listWrap.appendChild(table);
  }

  async function fetchContactNames(contactIds) {
    const map = new Map();
    if (!contactIds.length) return map;

    try {
      const { data, error } = await window.supabase
        .from('contacts')
        .select('contact_id, contact_first, contact_last')
        .in('contact_id', contactIds);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const key = String(row.contact_id);
          const name = [row.contact_first, row.contact_last].filter(Boolean).join(' ').trim() || '—';
          map.set(key, name);
        }
      }
    } catch (e) {
      // leave map empty on failure
      log('Contact lookup error: ' + (e?.message || e));
    }
    return map;
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    return Number.isNaN(d) ? '—' :
      d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function escapeHtml(s = '') {
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function log(msg) {
    const box = root.querySelector('#log');
    const now = new Date().toLocaleTimeString();
    box.textContent = (box.textContent ? box.textContent + '\n' : '') + `[${now}] ${msg}`;
  }
}
