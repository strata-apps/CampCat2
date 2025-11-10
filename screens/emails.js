// screens/emails.js
// Email Campaigns screen (Supabase + Gmail send). No workflow fields.
// - Create campaign inline: choose filter -> design -> Save Campaign
// - Edit/Execute per-campaign from the list
//
// Requires:
//  - global window.supabase
//  - window.GOOGLE_CLIENT_ID (string) OR edit the fallback below
//  - functions/email_design.js exports default openEmailDesigner({initial,onSave,onClose})
//  - functions/filters.js exports mountContactFilters(container) and getSelectedFilter(container)

import openEmailDesigner from '../functions/email_design.js';
import { mountContactFilters, getSelectedFilter } from '../functions/filters.js';

export default function Emails(root) {
  root.innerHTML = `
    <section class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
      <div>
        <h1 class="page-title">Email Campaigns</h1>
        <div class="label">Create, edit, and execute email campaigns using your Gmail account.</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <div id="gmailStatus" style="display:flex;align-items:center;gap:6px;visibility:hidden">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#16a34a;"></span>
          <span class="label" style="font-weight:700;color:#14532d">Signed In</span>
        </div>
        <button id="btnGmail" class="btn">Sign in with Google</button>
        <button id="btnRevoke" class="btn btn-danger" disabled>Sign out</button>
      </div>
    </section>

    <!-- New Campaign composer (inline) -->
    <section class="card" id="new-campaign">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div>
          <div class="kicker">Create</div>
          <div class="big">New Campaign</div>
        </div>
        <div>
          <button id="btnDesign" class="btn">Design Email</button>
          <button id="btnSave" class="btn-primary" disabled>Save Campaign</button>
        </div>
      </div>

      <div class="latest-row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
        <input id="campaign-subject" class="input" placeholder="Subject" style="min-width:260px;flex:1">
        <div id="filterMount" class="latest-row" style="gap:8px;flex-wrap:wrap"></div>
      </div>

      <div id="designBadge" class="badge" style="display:none;margin-top:10px">Template ready ✓</div>
      <div id="composerHelp" class="label" style="margin-top:6px">
        1) Choose a filter • 2) Design email • 3) Save Campaign
      </div>
    </section>

    <section id="emails-list" class="cards"></section>

    <div class="card" style="margin-top:12px">
      <div class="kicker">Status</div>
      <pre id="log" class="label" style="white-space:pre-wrap;margin:6px 0 0 0">Ready.</pre>
    </div>
  `;

  const listMount  = root.querySelector('#emails-list');
  const logBox     = root.querySelector('#log');
  const btnGmail   = root.querySelector('#btnGmail');
  const btnRevoke  = root.querySelector('#btnRevoke');
  const gmailStatus= root.querySelector('#gmailStatus');

  // New Campaign controls
  const filterMount   = root.querySelector('#filterMount');
  const btnDesign     = root.querySelector('#btnDesign');
  const btnSave       = root.querySelector('#btnSave');
  const subjInput     = root.querySelector('#campaign-subject');
  const designBadge   = root.querySelector('#designBadge');

  let designed = { html: '', preheader: '', subject: '' };
  let accessToken = null;
  let tokenClient = null;

  init().catch(e => log('Init error: ' + (e?.message || e)));

  async function init() {
    await ensureGIS();
    initOAuth();

    // mount filters for new campaign
    mountContactFilters(filterMount);

    await refreshList();
  }

  async function refreshList() {
    const { campaigns } = await fetchCampaigns();
    renderCampaigns(campaigns);
  }

  /* ---------------- Supabase data ---------------- */

  async function fetchCampaigns() {
    if (!globalThis.supabase?.from) return { campaigns: [] };
    const { data, error } = await supabase
      .from('email_campaigns')
      .select('campaign_id, campaign_subject, filters, email_content, created_at, updated_at')
      .order('updated_at', { ascending: false });
    if (error) {
      log('Supabase fetch error: ' + error.message);
      return { campaigns: [] };
    }
    return { campaigns: data || [] };
  }

  async function insertCampaign({ subject, filters, html }) {
    const payload = {
      campaign_subject: subject,
      filters,
      email_content: html
    };
    const { data, error } = await supabase
      .from('email_campaigns')
      .insert(payload)
      .select('campaign_id')
      .maybeSingle();
    if (error) throw error;
    return data?.campaign_id || null;
  }

  async function updateCampaign(campaign_id, { subject, filters, html }) {
    const payload = {};
    if (subject != null) payload.campaign_subject = subject;
    if (filters != null) payload.filters = filters;
    if (html != null) payload.email_content = html;

    const { error } = await supabase
      .from('email_campaigns')
      .update(payload)
      .eq('campaign_id', campaign_id);
    if (error) throw error;
  }

  async function deleteCampaign(id) {
    const { error } = await supabase
      .from('email_campaigns')
      .delete()
      .eq('campaign_id', id);
    if (error) throw error;
  }

  /* ---------------- New Campaign flow ---------------- */

  btnDesign.onclick = () => {
    openEmailDesigner({
      initial: {
        subject: subjInput.value.trim(),
        preheader: designed.preheader || '',
        html: designed.html || ''
      },
      onSave: ({ subject, preheader, html }) => {
        designed = { subject, preheader, html };
        if (subject && !subjInput.value.trim()) subjInput.value = subject;
        btnSave.disabled = false;
        designBadge.style.display = '';
        log('✅ Template saved for new campaign.');
      }
    });
  };

  btnSave.onclick = async () => {
    const f = getSelectedFilter(filterMount);
    const subject = subjInput.value.trim();
    if (!subject) return alert('Please enter a subject.');
    if (!f) return alert('Please choose a contacts filter.');
    if (!designed.html) return alert('Please design your email first.');

    try {
      btnSave.disabled = true;
      const id = await insertCampaign({
        subject,
        filters: f,     // store chosen {field,value} or whatever filters.js returns
        html: designed.html
      });
      log('💾 Campaign saved: ' + (id || '(no id)'));
      // reset composer & refresh list
      subjInput.value = '';
      designed = { html: '', preheader: '', subject: '' };
      designBadge.style.display = 'none';
      btnSave.disabled = true;
      await refreshList();
      // scroll to list
      listMount.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      btnSave.disabled = false;
      alert('Failed to save campaign.');
      log('Save error: ' + (e?.message || e));
    }
  };

  /* ---------------- Render list ---------------- */

  function renderCampaigns(list) {
    if (!list.length) {
      listMount.innerHTML = `
        <div class="card wide">
          <div>
            <div class="kicker">No campaigns</div>
            <div class="big" style="margin-bottom:6px">Create your first email campaign</div>
            <p class="label">Use the section above to select a filter and design your email.</p>
          </div>
        </div>`;
      return;
    }
    listMount.innerHTML = list.map(renderWideCard).join('');
    listMount.onclick = onListClick;
  }

  function renderWideCard(c) {
    const idShort    = (c.campaign_id || '').toString().slice(0, 8);
    const updatedStr = formatRelative(c.updated_at);
    const createdStr = formatShortDate(c.created_at);
    const filtersTxt = summarizeFilters(c.filters);
    return `
      <div class="card wide" data-id="${escapeHtml(c.campaign_id)}">
        <div style="flex:1; min-width:0">
          <div class="kicker">Campaign</div>
          <div class="big" style="margin-bottom:6px">${escapeHtml(c.campaign_subject || 'Untitled Email')}</div>
          <div class="latest-row" style="gap:6px;flex-wrap:wrap">
            <span class="badge">ID: ${idShort}…</span>
            ${filtersTxt ? `<span class="badge">${escapeHtml(filtersTxt)}</span>` : ''}
            <span class="badge" data-status>Ready</span>
          </div>
          <p class="label" style="margin-top:8px">
            Updated ${updatedStr} • Created ${createdStr}
          </p>
        </div>
        <div style="display:flex; align-items:flex-start; justify-content:flex-end; gap:8px;">
          <button class="btn" data-edit="${escapeHtml(c.campaign_id)}">Edit Campaign</button>
          <button class="btn" data-exec="${escapeHtml(c.campaign_id)}">Execute Campaign</button>
          <button class="btn-delete" data-del="${escapeHtml(c.campaign_id)}">Delete</button>
        </div>
      </div>
    `;
  }

  async function onListClick(e) {
    const del  = e.target.closest('button[data-del]');
    const edit = e.target.closest('button[data-edit]');
    const exec = e.target.closest('button[data-exec]');
    if (del)  return doDelete(del.getAttribute('data-del'));
    if (edit) return doEdit(edit.getAttribute('data-edit'));
    if (exec) return doExecute(exec.getAttribute('data-exec'));
  }

  async function doDelete(id) {
    if (!id) return;
    if (!confirm('Delete this email campaign? This cannot be undone.')) return;
    try {
      await deleteCampaign(id);
      const card = listMount.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (card) card.remove();
    } catch (e) {
      log('Delete error: ' + (e?.message || e));
      alert('Failed to delete.');
    }
  }

  async function doEdit(id) {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('email_campaigns')
        .select('campaign_subject, filters, email_content')
        .eq('campaign_id', id)
        .maybeSingle();
      if (error) throw error;
      const current = data || {};
      openEmailDesigner({
        initial: {
          subject: current.campaign_subject || '',
          preheader: '',
          html: current.email_content || ''
        },
        onSave: async ({ subject, preheader, html }) => {
          const newSubj = subject || current.campaign_subject || '';
          await updateCampaign(id, { subject: newSubj, html });
          log('💾 Campaign updated: ' + id);
          await refreshList();
        }
      });
    } catch (e) {
      log('Edit error: ' + (e?.message || e));
      alert('Failed to load campaign for editing.');
    }
  }

  async function doExecute(id) {
    if (!id) return;
    if (!accessToken) return alert('Please sign in with Google first.');

    // Load campaign
    const { data, error } = await supabase
      .from('email_campaigns')
      .select('campaign_subject, filters, email_content')
      .eq('campaign_id', id)
      .maybeSingle();
    if (error) {
      log('Exec load error: ' + error.message);
      return alert('Could not load campaign.');
    }
    const subject = data?.campaign_subject || '(No Subject)';
    const html    = data?.email_content || '';
    const filters = data?.filters || null;

    // Resolve recipients via public.contacts using the stored filter
    const emails = await resolveRecipients(filters);
    if (!emails.length) return alert('No recipients match this filter.');

    // Confirm
    if (!confirm(`Send to ${emails.length} recipients now?`)) return;

    // Send (BCC batch for simplicity)
    const card = listMount.querySelector(`[data-id="${CSS.escape(id)}"]`);
    setStatus(card, 'Sending…', '#1f2937');
    let ok = false;
    try {
      ok = await sendGmail({
        to: 'me',
        bcc: emails,
        subject,
        text: stripHtml(html) || subject,
        html
      });
    } catch (e) {
      ok = false;
      log('Exec send error: ' + (e?.message || e));
    }
    if (ok) {
      setStatus(card, 'Completed Successfully', '#16a34a');
      log(`✅ Campaign executed: ${id} → ${emails.length} recipients`);
    } else {
      // Try individual fallback to capture failure counts
      let sent = 0, fail = 0;
      for (const addr of emails) {
        const one = await sendGmail({
          to: addr,
          subject,
          text: stripHtml(html) || subject,
          html
        });
        one ? sent++ : fail++;
      }
      if (fail === 0) {
        setStatus(card, 'Completed Successfully', '#16a34a');
      } else {
        setStatus(card, `Completed with ${fail} failed`, '#b45309');
      }
      log(`ℹ️ Fallback run complete: sent=${sent}, failed=${fail}`);
    }
  }

  function setStatus(card, text, color = '#1f2937') {
    if (!card) return;
    const badge = card.querySelector('[data-status]');
    if (badge) {
      badge.textContent = text;
      badge.style.background = 'transparent';
      badge.style.border = `1px solid ${color}`;
      badge.style.color = color;
    }
  }

  async function resolveRecipients(filters) {
    if (!globalThis.supabase?.from) return [];
    // Expect filters like { field:'grade', value:'12' } from filters.js; also handle arrays
    let emails = [];
    const add = arr => arr.forEach(e => {
      const x = (e?.contact_email || '').trim();
      if (x) emails.push(x);
    });

    if (Array.isArray(filters)) {
      // Chain equality AND
      let q = supabase.from('contacts').select('contact_email', { count: 'exact' });
      for (const f of filters) q = q.eq(f.field, f.value);
      const { data, error } = await q.limit(5000);
      if (!error && data) add(data);
    } else if (filters && filters.field && filters.value != null) {
      const { data, error } = await supabase
        .from('contacts')
        .select('contact_email')
        .eq(filters.field, filters.value)
        .limit(5000);
      if (!error && data) add(data);
    } else {
      // Fallback: everyone with email (dangerous—confirm!)
      const doAll = confirm('No filters stored. Send to ALL contacts with an email?');
      if (!doAll) return [];
      const { data, error } = await supabase
        .from('contacts')
        .select('contact_email')
        .not('contact_email', 'is', null)
        .limit(5000);
      if (!error && data) add(data);
    }

    // Dedup case-insensitive
    const seen = new Set();
    emails = emails.filter(e => {
      const k = e.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return emails;
  }

  /* ---------------- Gmail auth ---------------- */

  function initOAuth() {
    const GOOGLE_CLIENT_ID = window.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com';
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/gmail.send',
      callback: (resp) => {
        if (resp.error) {
          log('OAuth error: ' + JSON.stringify(resp.error));
          return;
        }
        accessToken = resp.access_token;
        btnRevoke.disabled = false;
        // Styling: darken sign-in button + show green light
        btnGmail.classList.add('btn--signed');
        btnGmail.textContent = 'Signed In';
        gmailStatus.style.visibility = 'visible';
        log('✅ Gmail send scope granted.');
      },
    });

    btnGmail.onclick  = () => tokenClient.requestAccessToken({ prompt: 'consent' });
    btnRevoke.onclick = async () => {
      try {
        if (accessToken) await google.accounts.oauth2.revoke(accessToken);
        log('🔒 Access revoked.');
      } catch (e) {
        log('Revoke error: ' + (e?.message || e));
      } finally {
        accessToken = null;
        btnRevoke.disabled = true;
        btnGmail.classList.remove('btn--signed');
        btnGmail.textContent = 'Sign in with Google';
        gmailStatus.style.visibility = 'hidden';
      }
    };
  }

  async function sendGmail({ to, bcc, subject, text, html }) {
    try {
      const raw = buildRawEmail({ to, bcc, subject, text, html });
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      });
      if (!res.ok) {
        const errTxt = await res.text();
        log('❌ Send failed: ' + errTxt);
        return false;
      }
      const data = await res.json();
      log('✅ Sent id: ' + data.id + (bcc ? ' (bcc batch)' : (to ? ` → ${to}` : '')));
      return true;
    } catch (e) {
      log('❌ Error: ' + (e?.message || e));
      return false;
    }
  }

  function buildRawEmail({ to, bcc, subject, text, html }) {
    const boundary = '=_rp_' + Math.random().toString(36).slice(2);
    const headers = [];
    if (to) headers.push(`To: ${to}`);
    if (bcc && bcc.length) headers.push(`Bcc: ${bcc.join(', ')}`);
    headers.push(
      `Subject: ${encodeRFC2047(subject || '')}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`
    );
    const parts = [
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      (text || (html ? stripHtml(html) : '') || '').replace(/\r?\n/g, '\r\n'),

      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      (html || '').replace(/\r?\n/g, '\r\n'),

      `--${boundary}--`,
      ''
    ];
    const msg = headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n');
    return base64UrlEncode(msg);
  }

  /* ---------------- Small utils ---------------- */

  function summarizeFilters(f) {
    if (!f) return '';
    if (Array.isArray(f)) {
      return f.map(one => `${one.field ?? 'field'} = ${one.value ?? ''}`).join(' • ');
    }
    if (typeof f === 'object') {
      if (f.field && f.value != null) return `${f.field} = ${f.value}`;
      return Object.entries(f).map(([k,v]) => `${k}: ${String(v)}`).join(' • ');
    }
    return String(f);
  }
  function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function formatShortDate(iso) {
    const d = new Date(iso);
    return Number.isNaN(d) ? '—' : d.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
  }
  function formatRelative(iso) {
    const d = new Date(iso); if (Number.isNaN(d)) return '—';
    const mins = Math.round((Date.now() - d) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    return `${days}d ago`;
  }
  function log(msg) {
    const now = new Date();
    logBox.textContent = `${logBox.textContent ? logBox.textContent + '\n' : ''}[${now.toLocaleTimeString()}] ${msg}`;
  }
  function base64UrlEncode(str) {
    const utf8 = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < utf8.length; i++) binary += String.fromCharCode(utf8[i]);
    const b64 = btoa(binary);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  function encodeRFC2047(str) {
    if (!str) return '';
    if (/^[\x00-\x7F]*$/.test(str)) return str;
    const utf8 = new TextEncoder().encode(str);
    let hex = '';
    for (let i = 0; i < utf8.length; i++) hex += '=' + utf8[i].toString(16).toUpperCase().padStart(2, '0');
    return `=?UTF-8?Q?${hex.replace(/ /g, '_')}?=`;
  }
  function stripHtml(h = '') {
    return h.replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, '$&\n')
            .replace(/<[^>]+>/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
  }
  async function ensureGIS() {
    if (window.google?.accounts?.id) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(s);
    });
  }
}
