// functions/workflow_emails.js
// Opens a modal to confirm + send a workflow email via Gmail API (no Edge Function).

export default function openWorkflowEmailModal({
  contact,
  action,        // the email-type workflow event (with action.email)
  campaign,      // parent campaign row (optional)
  campaignId,
  outcome,       // e.g. 'answered'
  response,      // survey response (string or null)
  onDone,        // callback when the flow is finished (send or cancel)
}) {
  const supabase = globalThis.supabase; // still available if you later want logging

  const to =
    contact?.contact_email ||
    contact?.email ||
    contact?.Email ||
    null;

  const template = action?.email || {};
  const subject =
    template.subject ||
    `Follow-up from ${campaign?.campaign_name || 'our call'}`;
  const preheader = template.preheader || '';
  const html =
    template.html ||
    '<p>No email template has been configured for this action.</p>';

  // Gmail auth state for THIS modal
  let accessToken = null;
  let tokenClient = null;

  // --- DOM helpers ----------------------------------------------------------
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // --- Backdrop + modal -----------------------------------------------------
  const backdrop = el('div');
  backdrop.style.position = 'fixed';
  backdrop.style.inset = '0';
  backdrop.style.background = 'rgba(15, 23, 42, 0.45)';
  backdrop.style.display = 'flex';
  backdrop.style.alignItems = 'center';
  backdrop.style.justifyContent = 'center';
  backdrop.style.zIndex = '9999';

  const modal = el('div');
  modal.style.width = 'min(720px, 95vw)';
  modal.style.maxHeight = '90vh';
  modal.style.background = '#ffffff';
  modal.style.borderRadius = '16px';
  modal.style.border = '1px solid rgba(15,23,42,0.12)';
  modal.style.boxShadow = '0 18px 45px rgba(15,23,42,0.35)';
  modal.style.display = 'flex';
  modal.style.flexDirection = 'column';
  modal.style.overflow = 'hidden';

  // Header
  const header = el('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.padding = '12px 16px';
  header.style.borderBottom = '1px solid rgba(148,163,184,0.45)';
  const title = el('div', null, 'Confirm Email Send');
  title.style.fontSize = '16px';
  title.style.fontWeight = '800';
  const closeBtn = el('button', null, '✕');
  closeBtn.style.border = 'none';
  closeBtn.style.background = 'transparent';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.fontSize = '16px';
  closeBtn.style.padding = '4px';
  header.append(title, closeBtn);

  // Body
  const body = el('div');
  body.style.display = 'grid';
  body.style.gridTemplateColumns = 'minmax(0, 1.4fr) minmax(0, 1fr)';
  body.style.gap = '16px';
  body.style.padding = '12px 16px';
  body.style.alignItems = 'flex-start';

  // Left: preview
  const left = el('div');
  const info = el('div');
  info.innerHTML = `
    <div style="font-size:13px; color:#6b7280; margin-bottom:8px;">
      This email is defined by the workflow for this campaign.
    </div>
    <div style="font-size:13px; margin-bottom:4px;"><strong>To:</strong> ${
      to || '<em>No email found for this contact</em>'
    }</div>
    <div style="font-size:13px; margin-bottom:4px;"><strong>Subject:</strong> ${escapeHtml(
      subject
    )}</div>
    ${
      preheader
        ? `<div style="font-size:13px; margin-bottom:4px;"><strong>Preheader:</strong> ${escapeHtml(
            preheader
          )}</div>`
        : ''
    }
    <div style="font-size:12px; color:#9ca3af; margin-top:8px;">
      Outcome: <code>${escapeHtml(outcome || '')}</code>
      ${
        response
          ? ` • Response: <code>${escapeHtml(response || '')}</code>`
          : ''
      }
    </div>
  `;
  const previewBox = el('div');
  previewBox.style.marginTop = '10px';
  previewBox.style.border = '1px solid #e5e7eb';
  previewBox.style.borderRadius = '12px';
  previewBox.style.overflow = 'auto';
  previewBox.style.maxHeight = '55vh';
  previewBox.style.background = '#f9fafb';
  previewBox.style.padding = '12px';

  const previewInner = el('div');
  previewInner.style.background = '#ffffff';
  previewInner.style.borderRadius = '10px';
  previewInner.style.margin = '0 auto';
  previewInner.style.maxWidth = '600px';
  previewInner.style.boxShadow = '0 6px 18px rgba(15,23,42,0.08)';
  previewInner.style.padding = '16px 18px';
  previewInner.innerHTML = html; // trusted author content

  previewBox.appendChild(previewInner);
  left.append(info, previewBox);

  // Right: status / auth
  const right = el('div');
  const rightBox = el('div');
  rightBox.style.border = '1px dashed #e5e7eb';
  rightBox.style.borderRadius = '12px';
  rightBox.style.padding = '12px 12px 10px 12px';
  rightBox.style.fontSize = '13px';
  rightBox.style.color = '#4b5563';
  rightBox.innerHTML = `
    <div style="font-weight:700; margin-bottom:6px;">Automation status</div>
    <div id="wf-email-status" style="margin-bottom:8px;">
      When you click <strong>Send Email</strong>, this message will be sent via the Gmail API.
    </div>
  `;
  const signInBtn = el('button', null, 'Sign in with Google');
  signInBtn.style.display = 'none';
  signInBtn.style.marginTop = '8px';
  signInBtn.style.padding = '8px 12px';
  signInBtn.style.borderRadius = '999px';
  signInBtn.style.border = '1px solid #c4b5fd';
  signInBtn.style.background = '#ede9fe';
  signInBtn.style.color = '#4c1d95';
  signInBtn.style.fontWeight = '700';
  signInBtn.style.cursor = 'pointer';

  rightBox.appendChild(signInBtn);
  right.appendChild(rightBox);

  body.append(left, right);

  // Footer
  const footer = el('div');
  footer.style.display = 'flex';
  footer.style.justifyContent = 'space-between';
  footer.style.alignItems = 'center';
  footer.style.padding = '10px 16px 12px 16px';
  footer.style.borderTop = '1px solid rgba(148,163,184,0.4)';

  const leftFoot = el('div');
  leftFoot.style.fontSize = '12px';
  leftFoot.style.color = '#6b7280';
  leftFoot.textContent = 'This is a one-time follow-up email for this contact.';

  const rightFoot = el('div');
  rightFoot.style.display = 'flex';
  rightFoot.style.gap = '8px';

  const cancelBtn = el('button', null, 'Cancel');
  cancelBtn.style.borderRadius = '999px';
  cancelBtn.style.border = '1px solid #e5e7eb';
  cancelBtn.style.background = '#f9fafb';
  cancelBtn.style.padding = '8px 14px';
  cancelBtn.style.cursor = 'pointer';
  cancelBtn.onclick = () => {
    close();
  };

  const sendBtn = el('button', null, 'Send Email');
  sendBtn.style.borderRadius = '999px';
  sendBtn.style.border = '1px solid rgba(37,99,235,0.8)';
  sendBtn.style.background = 'linear-gradient(180deg, #3b82f6, #2563eb)';
  sendBtn.style.color = '#ffffff';
  sendBtn.style.fontWeight = '800';
  sendBtn.style.padding = '8px 16px';
  sendBtn.style.cursor = 'pointer';

  rightFoot.append(cancelBtn, sendBtn);
  footer.append(leftFoot, rightFoot);

  modal.append(header, body, footer);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  // --- Status helpers -------------------------------------------------------
  function setStatus(msg, tone = 'default') {
    const statusEl = modal.querySelector('#wf-email-status');
    if (!statusEl) return;
    statusEl.textContent = msg;
    if (tone === 'error') {
      statusEl.style.color = '#b91c1c';
    } else if (tone === 'success') {
      statusEl.style.color = '#166534';
    } else {
      statusEl.style.color = '#4b5563';
    }
  }

  function setLoading(isOn) {
    sendBtn.disabled = isOn;
    cancelBtn.disabled = isOn;
    sendBtn.textContent = isOn ? 'Sending…' : 'Send Email';
  }

  // --- Gmail OAuth init -----------------------------------------------------
  (async () => {
    try {
      await ensureGIS();
      const GOOGLE_CLIENT_ID =
        window.GOOGLE_CLIENT_ID ||
        '765883496085-itufq4k043ip181854tmcih1ka3ascmn.apps.googleusercontent.com';

      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/gmail.send',
        callback: (resp) => {
          if (resp.error) {
            console.error('OAuth error', resp);
            setStatus('Google authorization failed. Please try again.', 'error');
            return;
          }
          accessToken = resp.access_token;
          setStatus('Connected to Gmail. Ready to send.', 'success');
          signInBtn.textContent = 'Reauthorize Gmail';
          signInBtn.style.display = 'inline-flex';
        },
      });

      // Show sign-in button
      signInBtn.style.display = 'inline-flex';
      signInBtn.onclick = () => {
        if (!tokenClient) return;
        tokenClient.requestAccessToken({
          // if we already have a token, no need to reprompt consent
          prompt: accessToken ? '' : 'consent',
        });
      };
    } catch (err) {
      console.error('Failed to init Gmail Identity Services', err);
      setStatus('Could not initialize Google services for email send.', 'error');
    }
  })();

  // --- Send via Gmail -------------------------------------------------------
  async function sendEmail() {
    if (!to) {
      alert('No email address found for this contact.');
      return;
    }
    if (!accessToken) {
      setStatus('Please sign in with Google before sending.', 'error');
      signInBtn.style.display = 'inline-flex';
      return;
    }

    setLoading(true);
    setStatus('Sending email via Gmail…', 'default');

    try {
      const ok = await sendGmailSingle({
        accessToken,
        to,
        subject,
        text: stripHtml(html) || subject,
        html,
      });

      if (!ok) {
        setStatus('Could not send email. Check console for details.', 'error');
        return;
      }

      setStatus('Email sent successfully.', 'success');
      setTimeout(() => close(true), 500);
    } catch (err) {
      console.error('Gmail send exception', err);
      setStatus('Unexpected error sending email.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function close(sent = false) {
    document.body.removeChild(backdrop);
    if (typeof onDone === 'function') {
      onDone({ sent });
    }
  }

  function escapeHtml(s = '') {
    return String(s).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[m]));
  }

  // Wire events
  closeBtn.onclick = () => close(false);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close(false);
  });
  sendBtn.onclick = () => sendEmail();
}

/* ------------ Gmail helpers (single-recipient) ------------ */

async function sendGmailSingle({ accessToken, to, subject, text, html }) {
  try {
    const raw = buildRawEmail({ to, subject, text, html });
    const res = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      }
    );
    if (!res.ok) {
      const errTxt = await res.text();
      console.error('❌ Gmail send failed:', errTxt);
      return false;
    }
    const data = await res.json();
    console.log('✅ Workflow email sent. Gmail id:', data.id, '→', to);
    return true;
  } catch (e) {
    console.error('❌ Gmail send error:', e);
    return false;
  }
}

function buildRawEmail({ to, subject, text, html }) {
  const sub = (subject || '').toString().replace(/\r?\n/g, ' ').trim();
  const txt = (text || '').toString();
  const htm = (html || '').toString();
  const boundary = '=_rp_' + Math.random().toString(36).slice(2);
  const headers = [];

  if (to) headers.push(`To: ${to}`);

  const asciiOnly = /^[\x00-\x7F]*$/.test(sub);
  headers.push(
    `Subject: ${asciiOnly ? sub : encodeRFC2047(sub)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`
  );

  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    (txt || (htm ? stripHtml(htm) : '') || '').replace(/\r?\n/g, '\r\n'),

    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    (htm || '').replace(/\r?\n/g, '\r\n'),

    `--${boundary}--`,
    '',
  ];

  const msg = headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n');
  return base64UrlEncode(msg);
}

function stripHtml(h = '') {
  return h
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, '$&\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
  for (let i = 0; i < utf8.length; i++) {
    hex += '=' + utf8[i].toString(16).toUpperCase().padStart(2, '0');
  }
  return `=?UTF-8?Q?${hex.replace(/ /g, '_')}?=`;
}

async function ensureGIS() {
  if (window.google?.accounts?.oauth2) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = () =>
      reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
}
