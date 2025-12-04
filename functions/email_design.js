// functions/email_design.js
// Default export: opens a modal newsletter designer with a block editor (no raw HTML).
// API stays the same as before:
//   openEmailDesigner({ initial: {subject, preheader, html}, onSave, onClose })

export default function openEmailDesigner({ initial = {}, onSave, onClose } = {}) {
  // --- Utilities -------------------------------------------------------------
  const uid = () => 'blk_' + Math.random().toString(36).slice(2, 9);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const escapeHtml = (s='') => s.replace(/[&<>"']/g,(m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  // If initial.html exists (from older version), try to parse blocks; if not, start simple.
  // For now, we won't attempt full HTML parsing—start with one body block as a safe default.
  const defaultBlocks = [
    { id: uid(), type: 'h1',  text: 'Your Title' },
    { id: uid(), type: 'p',   text: 'Write your opening paragraph here. Keep it short and inviting.' },
    { id: uid(), type: 'btn', text: 'Call to Action', url: 'https://example.com' }
  ];

  // If we previously saved blocks, reuse them; otherwise fall back to starter blocks
  const initialBlocks =
    Array.isArray(initial.blocks) && initial.blocks.length
      ? initial.blocks.map(b => ({
          // keep any extra props, but ensure each has an id
          id: b.id || uid(),
          type: b.type || 'p',
          text: b.text || '',
          url: b.url || ''
        }))
      : defaultBlocks;

  const state = {
    subject: initial.subject || '',
    preheader: initial.preheader || '',
    blocks: initialBlocks
  };


  // --- DOM -------------------------------------------------------------------
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-email';
  backdrop.setAttribute('aria-hidden', 'false');

  backdrop.innerHTML = `
    <style>
      .modal-backdrop-email {
        position: fixed; inset:0;
        background: rgba(0,0,0,.36);
        display: flex; align-items: center; justify-content: center;
        z-index: 9999;
      }
      .modal-email {
        width: min(1100px, 96vw);
        height: min(720px, 92vh);
        background: #fff;
        border-radius: 14px;
        border: 1px solid rgba(0,0,0,0.08);
        box-shadow: 0 18px 44px rgba(0,0,0,0.22);
        display: grid;
        grid-template-rows: auto 1fr auto;
        overflow: hidden;
      }
      .modal-email header, .modal-email footer {
        padding: 12px 14px;
        border-bottom: 1px solid #eee;
        display: flex; align-items: center; justify-content: space-between;
      }
      .modal-email footer { border-top: 1px solid #eee; border-bottom: none; }
      .modal-email h3 { font-size: 16px; font-weight: 900; margin: 0; }
      .subtitle { color:#6b7280; font-size:12px; }

      .modal-email .body {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0;
        min-height: 0;
      }
      .left, .right { min-height: 0; overflow: auto; }
      .pane-title {
        font-size: 12px; color: #64748b; font-weight: 700; letter-spacing: .2px;
        padding: 10px 12px; border-bottom: 1px solid #eee; background: #fafafa;
        display:flex; align-items:center; justify-content:space-between;
      }
      .left .inner, .right .inner { padding: 12px; }

      .grid-two { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
      .field { margin-bottom: 10px; }
      .label { font-weight: 700; color:#0f172a; font-size: 12px; margin-bottom: 6px; display:block; }
      input[type="text"] {
        width: 100%; border: 1px solid rgba(0,0,0,0.12); border-radius: 10px; padding: 10px;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial;
        font-size: 14px; background: #fff;
      }

      /* Block list */
      .blocks { display:flex; flex-direction:column; gap:10px; }
      .block {
        background:#ffffff; border:1px solid rgba(0,0,0,0.08); border-radius:12px;
        padding:10px; display:grid; grid-template-columns: auto 1fr auto; gap:10px; align-items:center;
        box-shadow: 0 4px 14px rgba(0,0,0,0.05);
      }
      .block-type { font-size:12px; font-weight:800; color:#334155; background:#F1F5F9; border:1px solid #E2E8F0; padding:4px 8px; border-radius:999px; }
      .block-controls { display:flex; gap:6px; }
      .icon-btn {
        background:#fff; border:1px solid rgba(0,0,0,0.10); border-radius:999px; padding:6px 10px; font-size:12px; font-weight:800; cursor:pointer;
      }
      .icon-btn:hover { box-shadow:0 2px 8px rgba(0,0,0,0.06); }
      .block .inputs { display:grid; gap:6px; }
      .muted { color:#64748b; font-size:12px; }

      .add-toolbar { display:flex; gap:8px; }
      .pill-btn {
        background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:999px; padding:8px 12px; font-weight:800; cursor:pointer;
      }
      .pill-btn:hover { box-shadow:0 2px 8px rgba(0,0,0,0.06); }

      /* Preview iframe wrapper */
      .iframe-wrap { border: 1px solid rgba(0,0,0,0.08); border-radius: 12px; overflow: hidden; background: #fff; }
      .right .inner { padding: 12px; }
      iframe { width:100%; height:560px; border:0; }

      .btn { border-radius: 999px; padding: 10px 14px; font-weight: 800; cursor: pointer; border: 1px solid rgba(0,0,0,.08); background: #fff; }
      .btn.primary { background: #111827; color: #fff; border-color:#111827; }
      .btn.ghost { background: #fff; }
    </style>

    <div class="modal-email" role="dialog" aria-modal="true" aria-labelledby="email-designer-title">
      <header>
        <div>
          <h3 id="email-designer-title">Newsletter Designer</h3>
          <div class="subtitle">Build your email with blocks—no HTML required.</div>
        </div>
        <div>
          <button class="btn ghost" data-x>Close</button>
        </div>
      </header>

      <div class="body">
        <!-- Left: Editor -->
        <section class="left">
          <div class="pane-title">
            <span>Editor</span>
            <div class="add-toolbar">
              <button class="pill-btn" data-add="h1">+ Header</button>
              <button class="pill-btn" data-add="p">+ Body</button>
              <button class="pill-btn" data-add="btn">+ Button</button>
            </div>
          </div>

          <div class="inner">
            <div class="grid-two">
              <div class="field">
                <label class="label">Subject</label>
                <input type="text" id="ed-subject" placeholder="Subject line" />
              </div>
              <div class="field">
                <label class="label">Preheader</label>
                <input type="text" id="ed-preheader" placeholder="Preview text in inbox" />
              </div>
            </div>

            <div class="muted" style="margin:8px 0 6px;">Blocks (reorder with ▲/▼, remove with ✕)</div>
            <div id="blocks" class="blocks"></div>
          </div>
        </section>

        <!-- Right: Live Preview -->
        <section class="right">
          <div class="pane-title">Live Preview</div>
          <div class="inner">
            <div class="iframe-wrap">
              <iframe id="ed-frame"></iframe>
            </div>
          </div>
        </section>
      </div>

      <footer>
        <div class="muted">Changes appear in the preview instantly.</div>
        <div>
          <button class="btn" data-reset>Reset to starter</button>
          <button class="btn primary" data-save>Save Template</button>
        </div>
      </footer>
    </div>
  `;

  document.body.appendChild(backdrop);

  const $ = (sel) => backdrop.querySelector(sel);
  const elSubject   = $('#ed-subject');
  const elPreheader = $('#ed-preheader');
  const elBlocks    = $('#blocks');
  const elFrame     = $('#ed-frame');

  // Seed fields
  elSubject.value = state.subject;
  elPreheader.value = state.preheader;

  // Wire header/footer buttons
  backdrop.addEventListener('click', (e) => {
    if (e.target.matches('[data-x]') || e.target === backdrop) { close(); onClose?.(); }
  });
  backdrop.querySelector('[data-save]')?.addEventListener('click', () => {
    // Build final HTML and hand it back
    const html = buildHtml(state);

    onSave?.({
      subject: state.subject,
      preheader: state.preheader,
      html,
      // 👇 This is key so we can rehydrate later
      blocks: state.blocks
    });

    close();
  });

  backdrop.querySelector('[data-reset]')?.addEventListener('click', () => {
    state.subject = '';
    state.preheader = '';
    state.blocks = defaultBlocks.map(b => ({ ...b, id: uid() }));
    elSubject.value = state.subject;
    elPreheader.value = state.preheader;
    renderBlocks(); renderPreview();
  });

  // Subject/preheader change
  elSubject.addEventListener('input', () => { state.subject = elSubject.value; renderPreview(); });
  elPreheader.addEventListener('input', () => { state.preheader = elPreheader.value; renderPreview(); });

  // Add block toolbar
  backdrop.querySelector('[data-add="h1"]').addEventListener('click', () => {
    state.blocks.push({ id: uid(), type: 'h1', text: 'New Header' });
    renderBlocks(); renderPreview();
  });
  backdrop.querySelector('[data-add="p"]').addEventListener('click', () => {
    state.blocks.push({ id: uid(), type: 'p', text: 'New paragraph text.' });
    renderBlocks(); renderPreview();
  });
  backdrop.querySelector('[data-add="btn"]').addEventListener('click', () => {
    state.blocks.push({ id: uid(), type: 'btn', text: 'Click Me', url: 'https://example.com' });
    renderBlocks(); renderPreview();
  });

  // Initial draw
  renderBlocks();
  renderPreview();

  // --- Renderers -------------------------------------------------------------
  function renderBlocks() {
    elBlocks.innerHTML = state.blocks.map(blockRow).join('');

    // Inputs + controls wire-up per row
    state.blocks.forEach((b, i) => {
      const row = elBlocks.querySelector(`.block[data-id="${b.id}"]`);
      // Inputs
      const text = row.querySelector('input[data-field="text"]');
      const url  = row.querySelector('input[data-field="url"]');
      text?.addEventListener('input', () => { b.text = text.value; renderPreview(); });
      url?.addEventListener('input',  () => { b.url  = url.value;  renderPreview(); });

      // Move / delete
      row.querySelector('[data-move="up"]')?.addEventListener('click', () => {
        const ni = clamp(i - 1, 0, state.blocks.length - 1);
        if (ni !== i) { swap(i, ni); renderBlocks(); renderPreview(); }
      });
      row.querySelector('[data-move="down"]')?.addEventListener('click', () => {
        const ni = clamp(i + 1, 0, state.blocks.length - 1);
        if (ni !== i) { swap(i, ni); renderBlocks(); renderPreview(); }
      });
      row.querySelector('[data-del]')?.addEventListener('click', () => {
        state.blocks.splice(i, 1);
        renderBlocks(); renderPreview();
      });
    });
  }

  function blockRow(b) {
    const typeBadge = b.type === 'h1' ? 'Header'
                    : b.type === 'p'  ? 'Body'
                    : 'Button';
    const inputs = (b.type === 'btn')
      ? `<div class="inputs">
           <input type="text" data-field="text" value="${escapeHtml(b.text || '')}" placeholder="Button text" />
           <input type="text" data-field="url"  value="${escapeHtml(b.url  || '')}" placeholder="https://link.example" />
         </div>`
      : `<div class="inputs">
           <input type="text" data-field="text" value="${escapeHtml(b.text || '')}" placeholder="${b.type==='h1' ? 'Header text' : 'Paragraph text'}" />
         </div>`;

    return `
      <div class="block" data-id="${b.id}">
        <span class="block-type">${typeBadge}</span>
        ${inputs}
        <div class="block-controls">
          <button class="icon-btn" data-move="up">▲</button>
          <button class="icon-btn" data-move="down">▼</button>
          <button class="icon-btn" data-del>✕</button>
        </div>
      </div>
    `;
  }

  function renderPreview() {
    const html = buildHtml(state);
    const doc = elFrame.contentWindow?.document;
    if (!doc) return;
    doc.open(); doc.write(html); doc.close();
  }

  // --- HTML Builder (email-safe table layout) --------------------------------
  function buildHtml(s) {
    const preSpan = `
      <span style="display:none!important;opacity:0;color:transparent;max-height:0;max-width:0;overflow:hidden;">
        ${escapeHtml(s.preheader || '')}
      </span>`;

    const bodyInner = s.blocks.map(blockToEmailHtml).join('\n');

    const bodyTable = `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px;">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="
              padding:18px 22px;
              background:#111827;
              text-align:center;
            ">
              <img
                src="camp_cat.png"
                alt="Camp Catanese"
                style="
                  display:block;
                  margin:0 auto;
                  width:70px;     /* adjust smaller/larger */
                  height:auto;
                "
              />
            </td>
          </tr>
          <tr>
            <td style="padding:22px;font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.5;font-size:16px;">
              ${bodyInner}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 22px;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#6b7280;font-size:12px;">
              © ${new Date().getFullYear()} Camp Catanese Foundation • Phoenix, AZ<br/>
              <a href="#" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(s.subject || '')}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body{margin:0}</style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
${preSpan}
${bodyTable}
</body>
</html>`;
  }

  function blockToEmailHtml(b) {
    if (b.type === 'h1') {
      return `
<h1 style="margin:0 0 8px 0;font-size:24px;line-height:1.2;font-family:Arial,Helvetica,sans-serif;">
  ${escapeHtml(b.text || '')}
</h1>`;
    }
    if (b.type === 'p') {
      return `
<p style="margin:0 0 14px 0;color:#374151;font-family:Arial,Helvetica,sans-serif;">
  ${escapeHtml(b.text || '')}
</p>`;
    }
    if (b.type === 'btn') {
      const url = (b.url || '').trim() || '#';
      const text = b.text || 'Click';
      return `
<div style="margin:18px 0;">
  <!-- bulletproof button -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" bgcolor="#22c55e" style="border-radius:999px;">
        <a href="${escapeHtml(url)}"
           style="display:inline-block;background:#22c55e;color:#052e10;text-decoration:none;font-weight:900;padding:12px 16px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;">
          ${escapeHtml(text)}
        </a>
      </td>
    </tr>
  </table>
</div>`;
    }
    return '';
  }

  // --- helpers ---------------------------------------------------------------
  function swap(i, j) {
    const tmp = state.blocks[i]; state.blocks[i] = state.blocks[j]; state.blocks[j] = tmp;
  }

  function close() { backdrop.remove(); }
}
