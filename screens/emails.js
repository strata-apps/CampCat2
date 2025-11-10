// screens/emails.js
// ReachPoint — Emails screen (Gmail API + dropdown filters over public.contacts)
//
// Requires:
//   - window.supabase already initialized (supabaseClient.js in index.html type="module")
//   - <script src="https://accounts.google.com/gsi/client" async defer></script> (loaded by ensureGIS below)
//   - A Google OAuth Client ID in window.GOOGLE_CLIENT_ID (or set the fallback below)
//
// Integrations:
//   - Email Designer modal (no-HTML block editor): functions/email_design.js
//   - Contacts dropdown filter UI: functions/filters.js
//
// Tables (optional):
//   - public.emailcampaigns: { subject text, recipients text, html_body text }
//
// Routing: mount via your app router → EmailScreen(root)

import openEmailDesigner from '../functions/email_design.js';
import { mountContactFilters, getSelectedFilter } from '../functions/filters.js';

export default async function EmailScreen(root) {
  root.innerHTML = '';
  root.classList.add('screen-email');

  // ---------- Small DOM helpers ----------
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === 'class') n.className = v;
      else if (k === 'style') Object.assign(n.style, v);
      else if (k.startsWith('on') && typeof v === 'function') n[k] = v;
      else if (v !== undefined && v !== null) n.setAttribute(k, v);
    });
    kids.flat().forEach(k => {
      if (k == null) return;
      n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
    });
    return n;
  };
  const row   = (...kids) => el('div', { class: 'row' }, kids);
  const label = (txt, forId) => el('label', { class: 'label', for: forId }, txt);
  const input = (id, ph = '', type = 'text') => el('input', { id, class: 'input', placeholder: ph, type });
  const select = (id, opts) => {
    const s = el('select', { id, class: 'input' });
    opts.forEach(o => s.appendChild(el('option', { value: o.value }, o.label)));
    return s;
  };
  const pill = (cls, txt) => el('span', { class: `chip ${cls||''}` }, txt);

  // ---------- State ----------
  let recipients = [];   // array of email strings (deduped)
  let latestQuery = { field: '', value: '' }; // what we queried by
  let tokenClient = null;
  let accessToken = null;

  // ---------- OAuth setup ----------
  const GOOGLE_CLIENT_ID = window.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com';
  await ensureGIS();
  initOAuth();

  // ---------- Header ----------
  const btnSignIn  = el('button', { class: 'btn', id: 'btnSignIn' }, 'Sign in with Google');
  const btnSignOut = el('button', { class: 'btn btn-danger', id: 'btnSignOut', disabled: true }, 'Sign out');

  const head = el('div', { class: 'content-head row space' },
    el('div', {},
      el('div', { class: 'title' }, 'Emails'),
      el('div', { class: 'muted' }, 'Filter contacts and send using your Gmail account.')
    ),
    row(btnSignIn, btnSignOut)
  );

  // ---------- Filters (dropdowns from backend via functions/filters.js) ----------
  const filterWrap = el('div', { class: 'latest-row', style: { gap: '8px', flexWrap: 'wrap' } });
  mountContactFilters(filterWrap); // builds 2 selects: field + value (enabled once field chosen)

  const btnQuery   = el('button', { class: 'btn-primary', id: 'btnQuery' }, 'Query Contacts');
  const btnClear   = el('button', { class: 'btn', id: 'btnClear' }, 'Clear');
  const chipsWrap  = el('div', { class: 'chips', id: 'chips' });

  const filtersCard = el('div', { class: 'card' },
    el('div', { class: 'sectionTitle' }, 'Filters (Contacts)'),
    filterWrap,
    row(btnQuery, btnClear),
    chipsWrap
  );

  // ---------- Results: recipients ----------
  const emailsArea = el('textarea', {
    id: 'emailsArea',
    class: 'input',
    style: { minHeight: '140px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace' },
    placeholder: 'Queried recipient emails will appear here…',
    readOnly: true
  });
  const btnCopy  = el('button', { class: 'btn', id: 'btnCopy' }, 'Copy Emails');
  const counts   = el('div', { class: 'muted', id: 'emailCount', style: { marginTop: '6px' } }, '0 emails');

  const resultsCard = el('div', { class: 'card' },
    el('div', { class: 'sectionTitle' }, 'Recipients'),
    emailsArea,
    row(btnCopy, counts)
  );

  // ---------- Compose + Send ----------
  const modeSel = select('send-mode', [
    { value: 'individual', label: 'Send Mode: Individual (one per recipient)' },
    { value: 'bcc',        label: 'Send Mode: Single Email (Bcc all)' },
  ]);
  const toPreview = input('to-preview', 'Will be filled automatically', 'text');
  toPreview.readOnly = true;

  const subjectInp = input('subj', 'Subject');
  const preheaderInp = input('preheader', 'Preheader (shown as inbox preview text)');
  const plainArea = el('textarea', {
    id: 'plainBody',
    class: 'input',
    style: { minHeight: '140px' },
    placeholder: 'Plain-text body (fallback if HTML not supported)'
  });

  const btnDesign = el('button', { class: 'btn', id: 'btnDesign' }, 'Design Email');
  const btnGrant  = el('button', { class: 'btn', id: 'btnGrant', style: { display: 'none' } }, 'Grant Gmail Send Scope');
  const btnSend   = el('button', { class: 'btn-primary', id: 'btnSend', disabled: true }, 'Send');

  let designed = { subject: '', preheader: '', html: '' }; // holds latest designed HTML

  const composeCard = el('div', { class: 'card' },
    el('div', { class: 'sectionTitle' }, 'Compose & Send'),
    row(
      el('div', { style: { minWidth: '220px', flex: 1 } },
        label('Send Mode', 'send-mode'),
        modeSel,
        el('div', { class: 'muted', style: { marginTop: '6px' } }, 'BCC sends one message to everyone; Individual sends one per person.')
      ),
      el('div', { style: { minWidth: '220px', flex: 2 } },
        label('To / Bcc Preview', 'to-preview'),
        toPreview
      ),
    ),
    el('div', { style: { marginTop: '10px' } },
      label('Subject', 'subj'),
      subjectInp
    ),
    el('div', { style: { marginTop: '10px' } },
      label('Preheader', 'preheader'),
      preheaderInp
    ),
    el('div', { style: { marginTop: '10px' } },
      label('Plain Text (fallback)', 'plainBody'),
      plainArea
    ),
    row(btnDesign, btnGrant, btnSend),
    el('div', { class: 'card-reminders' },
      'Gmail API sends as the signed-in user. Respect daily limits; consider a dedicated sender for large campaigns.'
    )
  );

  // ---------- Status ----------
  const status = el('div', { class: 'card' },
    el('pre', { class: 'muted', style: { whiteSpace: 'pre-wrap', margin: 0 } }, 'Status log will appear here.')
  );

  // ---------- Mount ----------
  root.append(head, filtersCard, resultsCard, composeCard, status);

  // ---------- Wire: Sign in / out ----------
  btnSignIn.onclick = () => {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      auto_select: false,
      callback: () => {
        log('Signed in with Google. If prompted, grant Gmail Send scope next.');
        tokenClient.requestAccessToken({ prompt: 'consent' });
        btnSignOut.disabled = false;
        btnSignIn.disabled = true;
        btnGrant.style.display = '';
      },
    });
    google.accounts.id.prompt();
  };

  btnSignOut.onclick = async () => {
    try {
      if (accessToken) {
        await google.accounts.oauth2.revoke(accessToken);
        log('🔒 Access revoked.');
      }
    } catch (e) {
      log('Revoke error: ' + e);
    } finally {
      accessToken = null;
      btnGrant.style.display = 'none';
      btnSend.disabled = true;
      btnSignIn.disabled = false;
      btnSignOut.disabled = true;
      log('Signed out.');
    }
  };

  btnGrant.onclick = () => tokenClient.requestAccessToken({ prompt: 'consent' });

  // ---------- Wire: Filters / Query ----------
  btnClear.onclick = () => {
    filterWrap.querySelector('#cc-field').value = '';
    const vs = filterWrap.querySelector('#cc-value');
    vs.innerHTML = `<option value="">Select value…</option>`;
    vs.disabled = true;
    recipients = [];
    latestQuery = { field: '', value: '' };
    updateRecipientsUI();
    drawChips();
  };

  btnQuery.onclick = async () => {
    const f = getSelectedFilter(filterWrap);
    if (!f) {
      toast('Choose both Field and Value.');
      return;
    }
    latestQuery = f;
    await runContactsQuery(f.field, f.value);
  };

  // ---------- Wire: Copy ----------
  btnCopy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(recipients.join(', '));
      toast('Copied emails to clipboard.');
    } catch {
      emailsArea.focus();
      emailsArea.select();
      toast('Clipboard blocked—select all and copy manually.');
    }
  };

  // ---------- Wire: Mode / Send ----------
  modeSel.onchange = () => updateToPreview();

  btnDesign.onclick = () => {
    openEmailDesigner({
      initial: {
        subject: subjectInp.value.trim(),
        preheader: preheaderInp.value.trim(),
        html: designed.html || ''
      },
      onSave: ({ subject, preheader, html }) => {
        designed = { subject, preheader, html };
        if (subject && !subjectInp.value.trim()) subjectInp.value = subject;
        if (preheader && !preheaderInp.value.trim()) preheaderInp.value = preheader;
        toast('✅ Template saved.');
      },
      onClose: () => {}
    });
  };

  btnSend.onclick = async () => {
    if (!accessToken) return toast('Not authorized. Sign in and grant Gmail Send.');
    const subject = subjectInp.value.trim();
    const preheader = preheaderInp.value.trim();
    const textBody = plainArea.value || '';
    const htmlBody = designed.html || null;

    if (!subject) return toast('Subject is required.');
    if (!recipients.length) return toast('No recipients. Run a query first.');

    // optional: save to Supabase
    await saveEmailCampaign(subject, recipients, htmlBody);

    btnSend.disabled = true;
    const mode = modeSel.value;

    try {
      if (mode === 'bcc') {
        const ok = await sendOne({
          to: 'me',
          bcc: recipients,
          subject,
          text: withPreheader(textBody, preheader),
          html: withPreheaderHtml(htmlBody, preheader)
        });
        if (ok) toast('✅ Sent 1 message (Bcc to all).');
      } else {
        let sent = 0, fail = 0;
        for (const addr of recipients) {
          const ok = await sendOne({
            to: addr,
            subject,
            text: withPreheader(textBody, preheader),
            html: withPreheaderHtml(htmlBody, preheader)
          });
          ok ? sent++ : fail++;
        }
        toast(`Finished: ${sent} sent, ${fail} failed.`);
      }
    } finally {
      btnSend.disabled = false;
    }
  };

  // ---------- Query contacts ----------
  async function runContactsQuery(field, value) {
    const s = window.supabase;
    if (!s) {
      toast('Supabase not available.');
      return;
    }
    recipients = [];
    updateRecipientsUI();
    drawChips();

    // Build query on public.contacts for the selected field/value (exact match)
    let q = s.from('contacts').select('contact_email').eq(field, value).limit(5000);
    const { data, error } = await q;
    if (error) {
      log('❌ Supabase query error: ' + error.message);
      toast('Query failed.');
      return;
    }
    const list = (data || [])
      .map(r => (r.contact_email || '').trim())
      .filter(Boolean);

    // Deduplicate case-insensitive
    const seen = new Set();
    recipients = list.filter(e => {
      const k = e.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    updateRecipientsUI();
    toast(`Query complete: ${recipients.length} unique email${recipients.length === 1 ? '' : 's'}.`);
  }

  // ---------- UI updaters ----------
  function updateRecipientsUI() {
    emailsArea.value = recipients.join(', ');
    counts.textContent = `${recipients.length} email${recipients.length === 1 ? '' : 's'}`;
    updateToPreview();
  }
  function updateToPreview() {
    if (!recipients.length) { toPreview.value = ''; return; }
    const mode = modeSel.value;
    if (mode === 'bcc') {
      toPreview.value = `BCC: ${recipients.slice(0, 4).join(', ')}${recipients.length > 4 ? `, … (+${recipients.length - 4} more)` : ''}`;
    } else {
      toPreview.value = `Individual: ${recipients.length} message${recipients.length === 1 ? '' : 's'}`;
    }
  }
  function drawChips() {
    chipsWrap.innerHTML = '';
    if (latestQuery.field && latestQuery.value) {
      chipsWrap.appendChild(pill('', `${latestQuery.field} = “${latestQuery.value}”`));
    }
  }

  // ---------- Gmail OAuth + Send ----------
  function initOAuth() {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/gmail.send',
      callback: (resp) => {
        if (resp.error) {
          log('OAuth error: ' + JSON.stringify(resp.error));
          return;
        }
        accessToken = resp.access_token;
        btnGrant.style.display = 'none';
        btnSend.disabled = false;
        toast('✅ Gmail send scope granted.');
      },
    });
  }

  async function sendOne({ to, bcc, subject, text, html }) {
    const raw = buildRawEmail({ to, bcc, subject, text, html });
    try {
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
        },
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
      (html || escapeHtml(text) || '').replace(/\r?\n/g, '\r\n'),

      `--${boundary}--`,
      ''
    ];

    const msg = headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n');
    return base64UrlEncode(msg);
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
  function escapeHtml(t = '') {
    return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function withPreheader(text, pre) {
    if (!pre) return text || '';
    return `${pre}\n\n${text || ''}`;
  }
  function withPreheaderHtml(html, pre) {
    if (!pre) return html || '';
    if (!html) return escapeHtml(pre);
    // if your designer already adds hidden preheader, you can skip this
    return html;
  }

  async function ensureGIS() {
    if (window.google && window.google.accounts && window.google.accounts.id) return;
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

  // ---------- Save campaign (optional) ----------
  async function saveEmailCampaign(subject, recipientList, htmlBody) {
    const s = window.supabase;
    if (!s?.from) return;
    try {
      const payload = {
        subject,
        recipients: recipientList.join(', '),
        html_body: htmlBody || null
      };
      const { error } = await s.from('emailcampaigns').insert(payload);
      if (error) log('⚠️ Could not save emailcampaigns: ' + (error.message || JSON.stringify(error)));
      else log('💾 Saved campaign to public.emailcampaigns.');
    } catch (e) {
      log('⚠️ Save error: ' + (e?.message || String(e)));
    }
  }

  // ---------- Status helpers ----------
  function toast(msg) {
    log(msg);
    const t = el('div', { class: 'toast' }, msg);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  function log(msg) {
    const box = status.querySelector('.muted') || status.firstChild;
    const now = new Date();
    const line = `[${now.toLocaleTimeString()}] ${msg}`;
    box.textContent = box.textContent ? (box.textContent + '\n' + line) : line;
  }
}
