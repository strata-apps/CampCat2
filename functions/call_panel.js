// functions/call_panel.js
// Reusable call panel that mirrors call_execution's UX (fields + layout).
// Renders into a given container and returns a getPayload() for saving.

export function renderCallPanel(container, { contact, defaults = {} } = {}) {
  const el = (t,a={},...k)=>{ if(typeof a==='string') a={class:a}; const n=document.createElement(t);
    for(const [k2,v] of Object.entries(a)){ if(k2==='class') n.className=v; else if(k2==='style'&&v&&typeof v==='object') Object.assign(n.style,v);
      else if(k2.startsWith('on')&&typeof v==='function') n[k2]=v; else if(v!=null) n.setAttribute(k2,v); }
    for(const kid of k.flat()) n.appendChild(typeof kid==='string'?document.createTextNode(kid):kid); return n; };
  const div = (a,...k)=>el('div',a,...k);

  container.innerHTML = '';

  const layout = div({ style:{
    display:'grid', gridTemplateColumns:'minmax(260px,1fr) 2fr', gap:'12px', alignItems:'start'
  }});
  container.appendChild(layout);

  // Left: Contact summary (simple, but you can swap to your renderContactInfo)
  const left = div({ class:'card' },
    el('div','kicker','Contact'),
    el('div','big', [contact.contact_first, contact.contact_last].filter(Boolean).join(' ') || 'Contact'),
    el('div','label', contact.contact_email || '—'),
    el('div','label', contact.contact_phone || '—')
  );

  // Right: Call controls matching call_execution semantics
  const right = div(null);
  layout.append(left, right);

  const row = (label, node) => {
    const w = div({ class:'kv' });
    w.append(el('div','k',label), el('div','v',node));
    return w;
  };

  // Outcome (same values you used in execution)
  const outcome = document.createElement('select');
  ['answered','no_answer','busy','voicemail','wrong_number','other'].forEach(v=>{
    const o=document.createElement('option'); o.value=v; o.textContent=v.replace('_',' ');
    outcome.appendChild(o);
  });
  outcome.value = defaults.outcome || 'answered';

  // Response
  const response = document.createElement('input');
  response.placeholder = 'Response (Yes / No / Maybe)';
  Object.assign(response.style, {width:'100%',padding:'8px 10px',border:'1px solid #d1d5db',borderRadius:'8px'});
  if (defaults.response) response.value = defaults.response;

  // Notes
  const notes = document.createElement('textarea');
  notes.rows = 4;
  notes.placeholder = 'Notes…';
  Object.assign(notes.style, {width:'100%',padding:'8px 10px',border:'1px solid #d1d5db',borderRadius:'8px'});
  if (defaults.notes) notes.value = defaults.notes;

  right.append(
    row('Outcome', outcome),
    row('Response', response),
    row('Notes', notes),
  );

  const getPayload = () => ({
    outcome: outcome.value,
    response: response.value.trim() || null,
    notes: notes.value.trim() || null,
  });

  return { getPayload };
}

export default renderCallPanel;
