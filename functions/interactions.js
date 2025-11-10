// functions/interactions.js
// Timeline view combining:
//  - single_calls (ad-hoc calls)
//  - call_progress (campaign calls)
// Sorted newest -> oldest.
// Expects: { contact_id, campaign_id?: optional to filter campaign calls }

function el(tag, cls, text){ const n=document.createElement(tag); if(cls) n.className=cls; if(text!=null) n.textContent=text; return n; }
const div = (...args) => el('div', ...args);

export async function renderInteractions(root, { contact_id, campaign_id = null }) {
  root.innerHTML = '';

  const wrap = div('detailsCard');
  const title = el('div', 'summaryTitle', 'Interaction History');
  title.style.fontWeight = '800';
  title.style.marginBottom = '6px';
  wrap.append(title);

  const loading = el('div', 'label', 'Loading…');
  wrap.append(loading);
  root.append(wrap);

  try {
    const s = window.supabase;

    // --- single_calls ---
    let scq = s.from('single_calls')
      .select('call_time, user_id, outcome, response, notes, contact_id')
      .eq('contact_id', contact_id)
      .order('call_time', { ascending: false })
      .limit(500);
    const { data: scData, error: scErr } = await scq;
    if (scErr) throw scErr;

    // --- call_progress (campaign dialing attempts) ---
    // We don't know exact column names across repos; try to be resilient.
    // We'll pick the best available timestamp among last_called_at, update_time, call_time.
    let cpq = s.from('call_progress')
      .select('campaign_id, contact_id, outcome, notes, last_called_at, update_time, call_time')
      .eq('contact_id', contact_id)
      .order('update_time', { ascending: false })
      .limit(1000);
    if (campaign_id) cpq = cpq.eq('campaign_id', campaign_id);
    const { data: cpData, error: cpErr } = await cpq;
    if (cpErr) throw cpErr;

    const toTime = (r) =>
      r?.call_time || r?.last_called_at || r?.update_time || r?.call_time || r?.at || null;

    const fromSingle = (r) => ({
      at: toTime(r),
      source: 'single_call',
      user_id: r.user_id || null,
      campaign_id: null,
      outcome: r.outcome || null,
      response: r.response || null,
      notes: r.notes || null,
    });

    const fromCampaign = (r) => ({
      at: toTime(r),
      source: 'campaign_call',
      user_id: null, // call_progress has no user_id in your schema
      campaign_id: r.campaign_id || null,
      outcome: r.outcome || null,
      response: null,
      notes: r.notes || null,
    });


    const merged = [
      ...(Array.isArray(scData) ? scData.map(fromSingle) : []),
      ...(Array.isArray(cpData) ? cpData.map(fromCampaign) : []),
    ].filter(x => !!x.at);

    merged.sort((a, b) => new Date(b.at) - new Date(a.at));

    wrap.removeChild(loading);

    if (!merged.length) {
      wrap.append(el('div','label','No interactions yet.'));
      return;
    }

    // timeline table
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.background = '#fff';
    table.style.border = '1px solid #e5e7eb';
    table.style.borderRadius = '10px';
    table.style.overflow = 'hidden';
    table.createTHead().innerHTML = `
      <tr style="background:#f3f4f6;text-align:left">
        <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">When</th>
        <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">Source</th>
        <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">User</th>
        <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">Campaign</th>
        <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">Outcome</th>
        <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">Response</th>
        <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">Notes</th>
      </tr>
    `;
    const tbody = table.createTBody();

    merged.forEach(row => {
      const tr = tbody.insertRow();
      const td = (t) => { const c = tr.insertCell(); c.style.padding = '8px 10px'; c.textContent = t ?? '—'; return c; };
      td(row.at ? new Date(row.at).toLocaleString() : '—');
      td(row.source === 'single_call' ? 'Single Call' : 'Campaign Call');
      td(row.user_id || '—');
      td(row.campaign_id || '—');
      td(row.outcome || '—');
      td(row.response || '—');
      td(row.notes || '—');
    });

    wrap.append(table);
  } catch (e) {
    console.warn('[interactions] error', e);
    root.innerHTML = '';
    const err = div('', 'Could not load interaction history.');
    err.style.color = '#b91c1c';
    root.append(err);
  }
}

export default renderInteractions;
