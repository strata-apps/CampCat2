// functions/add_variable.js
// Opens a modal to add a NEW column to public.contacts via an RPC.
// NOTE: You must create the SQL function shown below (SECURITY DEFINER) in Supabase.

export function openAddVariableModal({ onSuccess } = {}) {
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
  const div = (a, ...k) => el('div', a, ...k);
  const btn = (label, cls = 'btn', on) => { const b = el('button', { class: cls }, label); if (on) b.onclick = on; return b; };
  const closeModal = (wrap) => wrap?.remove();

  // Modal shell
  const wrap = el('div', { style: {
    position:'fixed', inset:'0', background:'rgba(0,0,0,.28)', zIndex:9999,
    display:'flex', alignItems:'center', justifyContent:'center'
  }});
  const card = el('div', { class:'card', style: {
    width:'min(660px, 92vw)', maxHeight:'82vh', display:'flex', flexDirection:'column',
    padding:'16px', gap:'10px', overflow:'hidden'
  }});
  const head = el('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center' }},
    div(null, el('div','kicker','Schema'), el('div','big','Add Contact Column')),
    btn('✕','btn', () => closeModal(wrap))
  );
  const body = el('div', { style:{ overflow:'auto', padding:'4px 2px' }});
  const footer = el('div', { style:{ display:'flex', justifyContent:'flex-end', gap:'8px' }});
  card.append(head, body, footer);
  wrap.append(card);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeModal(wrap); });
  document.body.appendChild(wrap);

  // Form controls
  const row = (label, node) => {
    const w = div({ class:'kv' });
    w.append(el('div','k',label), el('div','v',node));
    return w;
  };

  const nameInp = document.createElement('input');
  nameInp.placeholder = 'e.g., cohort, grade_level, is_alumni';
  Object.assign(nameInp.style, baseInputStyle());

  const typeSel = document.createElement('select');
  ['text','integer','numeric','boolean','date','timestamp with time zone','jsonb'].forEach(t => {
    const o = document.createElement('option'); o.value = t; o.textContent = t; typeSel.appendChild(o);
  });

  const nullableChk = document.createElement('input');
  nullableChk.type = 'checkbox'; nullableChk.checked = true;

  const defaultInp = document.createElement('input');
  defaultInp.placeholder = "Optional default (raw SQL, e.g., 'unknown' or 0 or false)";
  Object.assign(defaultInp.style, baseInputStyle());

  body.append(
    row('Column Name', nameInp),
    row('Data Type', typeSel),
    row('Nullable?', nullableChk),
    row('Default (SQL expr)', defaultInp),
    div('label', "Note: Default is a raw SQL expression. For text, wrap in single quotes, e.g., 'unknown'.")
  );

  const cancel = btn('Cancel','btn', () => closeModal(wrap));
  const add    = btn('Add Column','btn-primary', async () => {
    try {
      const col = (nameInp.value || '').trim();
      if (!col || !/^[a-z_][a-z0-9_]*$/i.test(col)) {
        alert('Please enter a valid SQL identifier (letters, numbers, underscores; cannot start with a number).');
        return;
      }
      const type = typeSel.value;
      const is_nullable = !!nullableChk.checked;
      const def = (defaultInp.value || '').trim(); // pass through as-is (raw SQL expression)

      const { error } = await window.supabase.rpc('add_contact_column', {
        p_col: col,
        p_type: type,
        p_nullable: is_nullable,
        p_default: def || null
      });
      if (error) throw error;

      closeModal(wrap);
      if (typeof onSuccess === 'function') onSuccess(col);
    } catch (e) {
      alert('Failed to add column.\n' + (e?.message || e));
    }
  });

  footer.append(cancel, add);

  function baseInputStyle() {
    return {
      width: '100%',
      padding: '8px 10px',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      fontFamily: 'inherit',
      fontSize: '14px'
    };
  }
}

export default openAddVariableModal;
