// gmail_client.js
//
// Lightweight Gmail API wrapper for ReachPoint.
// Exposes: window.gmailClient.send({ to, subject, html })
//          window.gmailClient.sendBulk({ to, subject, html, onProgress? })
//
// Requirements in index.html BEFORE this file:
// <script src="https://apis.google.com/js/api.js"></script>
// <script src="./gmail_client.js"></script>

(function () {
  const CLIENT_ID = '765883496085-itufq4k043ip181854tmcih1ka3ascmn.apps.googleusercontent.com';
  const API_KEY = 'YOUR_GOOGLE_API_KEY'; // optional but recommended
  const DISCOVERY_DOCS = [
    'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest',
  ];
  const SCOPES = 'https://www.googleapis.com/auth/gmail.send';

  let initPromise = null;

  function base64UrlEncode(str) {
    // Unicode-safe base64 → base64url
    const utf8 = unescape(encodeURIComponent(str));
    return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function buildMimeMessage({ to, subject, html }) {
    const headers = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="UTF-8"',
    ];

    const body = `${headers.join('\r\n')}\r\n\r\n${html || ''}`;
    return base64UrlEncode(body);
  }

  // Initialize and sign in once
  function ensureInit() {
    if (initPromise) return initPromise;

    initPromise = new Promise((resolve, reject) => {
      if (!window.gapi) {
        return reject(new Error('Google API (gapi) not loaded. Ensure <script src="https://apis.google.com/js/api.js"></script> is added.'));
      }

      window.gapi.load('client:auth2', async () => {
        try {
          await window.gapi.client.init({
            apiKey: API_KEY,
            clientId: CLIENT_ID,
            discoveryDocs: DISCOVERY_DOCS,
            scope: SCOPES,
          });

          const auth = window.gapi.auth2.getAuthInstance();

          // Trigger sign-in if not already signed in
          if (!auth.isSignedIn.get()) {
            await auth.signIn();
          }

          resolve();
        } catch (err) {
          console.error('[gmail_client] init failed', err);
          reject(err);
        }
      });
    });

    return initPromise;
  }

  async function sendEmail({ to, subject, html }) {
    if (!to) throw new Error('Missing "to" address.');

    await ensureInit();

    const raw = buildMimeMessage({ to, subject, html });
    const res = await window.gapi.client.gmail.users.messages.send({
      userId: 'me',
      resource: { raw },
    });

    return res;
  }

  async function sendBulk({ to, subject, html, onProgress }) {
    const uniq = Array.from(
      new Set(
        (to || [])
          .map((t) => (t || '').trim())
          .filter(Boolean)
      )
    );

    if (!uniq.length) {
      console.warn('[gmail_client] sendBulk called with no recipients');
      return;
    }

    await ensureInit();

    const results = [];
    for (let i = 0; i < uniq.length; i++) {
      const addr = uniq[i];
      try {
        const res = await sendEmail({ to: addr, subject, html });
        results.push({ to: addr, ok: true, res });
      } catch (err) {
        console.error('[gmail_client] failed to send to', addr, err);
        results.push({ to: addr, ok: false, error: err });
      }
      if (typeof onProgress === 'function') {
        onProgress({ index: i + 1, total: uniq.length, to: addr });
      }
    }

    return results;
  }

  window.gmailClient = {
    ensureInit,
    send: sendEmail,
    sendBulk,
  };

  console.log('[gmail_client] Loaded: window.gmailClient is available');
})();
