// functions/mass_upload.js
// Mass upload + left-merge for contacts table using CSV.
// - Requires: window.supabase
// - API: openMassUploadModal({ getCurrentRows, onDone, log })

export function openMassUploadModal(opts = {}) {
  const { getCurrentRows, onDone, log } = opts;

  const logger = msg => {
    if (typeof log === 'function') log(msg);
    else console.log('[mass_upload]', msg);
  };

  const supabase = window.supabase;
  if (!supabase?.from) {
    alert('Supabase client not available.');
    return;
  }

  const { wrap, body, footer, titleBox, close } = buildModalShell('Mass Upload Contacts');

  titleBox.insertAdjacentHTML(
    'beforeend',
    `<div class="label" style="margin-top:4px">
      Upload a CSV with a <b>contact_id</b> column. For each row:
      <ul style="margin:4px 0 0 18px;padding:0;font-size:12px;line-height:1.4;">
        <li>If <code>contact_id</code> exists in <code>contacts</code>, matching columns are updated.</li>
        <li>If it does <b>not</b> exist, a new contact is inserted (upsert on <code>contact_id</code>).</li>
        <li>Blank cells are ignored so existing data is not wiped.</li>
      </ul>
    </div>`
  );

  const info = document.createElement('div');
  info.className = 'label';
  Object.assign(info.style, {
    marginBottom: '10px',
    fontSize: '13px',
    lineHeight: '1.4',
  });
  info.innerHTML =
    'Required column: <code>contact_id</code>. Other columns must already exist in <code>public.contacts</code>.';

  const fileRow = document.createElement('div');
  Object.assign(fileRow.style, { margin: '8px 0 4px' });
  fileRow.innerHTML = `<div class="kicker">CSV File</div>`;
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.csv,text/csv';
  fileInput.style.marginTop = '6px';
  fileRow.appendChild(fileInput);

  const progressBox = document.createElement('pre');
  progressBox.className = 'label';
  Object.assign(progressBox.style, {
    marginTop: '10px',
    padding: '8px',
    borderRadius: '6px',
    background: '#f9fafb',
    maxHeight: '180px',
    overflow: 'auto',
    fontSize: '12px',
    whiteSpace: 'pre-wrap',
  });
  progressBox.textContent = 'Waiting for file...';

  body.append(info, fileRow, progressBox);

  const cancel = makeButton('Cancel', 'btn', () => close());

  const uploadBtn = makeButton('Upload & Merge', 'btn-primary', async () => {
    try {
      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        alert('Please select a CSV file first.');
        return;
      }

      progressBox.textContent = 'Reading file...';

      const text = await file.text();
      const rows = parseCSV(text);

      if (!rows.length) {
        progressBox.textContent = 'No rows found in CSV.';
        return;
      }

      const header = rows[0].map(h => (h || '').trim());
      const contactIdIdx = header.indexOf('contact_id');

      if (contactIdIdx === -1) {
        progressBox.textContent = 'CSV must include a "contact_id" column (exact name).';
        return;
      }

      progressBox.textContent = 'Determining updatable columns...';

      // Determine existing columns in contacts
      const existingCols = new Set();

      // Prefer schema from currentRows (if provided) to avoid extra roundtrip
      const current = typeof getCurrentRows === 'function' ? getCurrentRows() : null;
      if (current && current.length) {
        Object.keys(current[0] || {}).forEach(k => existingCols.add(k));
      } else {
        const { data, error } = await supabase.from('contacts').select('*').limit(1);
        if (error) throw new Error('Schema probe error: ' + error.message);
        if (data && data[0]) {
          Object.keys(data[0] || {}).forEach(k => existingCols.add(k));
        }
      }

      // Do not let CSV try to update these special columns
      ['created_at', 'updated_at'].forEach(k => existingCols.delete(k));

      // Columns we will actually write (besides contact_id)
      const updatableCols = header.filter(
        (name, idx) => idx !== contactIdIdx && existingCols.has(name)
      );

      if (!updatableCols.length) {
        progressBox.textContent =
          'No columns in the CSV match existing columns in contacts (other than contact_id). Nothing to update.';
        return;
      }

      progressBox.textContent =
        `Updatable columns detected: ${updatableCols.join(', ')}\nStarting merge...\n`;

      let upserts = 0;
      let skippedEmpty = 0;
      let errors = 0;

      // Upsert row-by-row (safe, straightforward; can batch later if needed)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const contactId = (row[contactIdIdx] || '').trim();
        if (!contactId) {
          skippedEmpty++;
          progressBox.textContent += `Row ${i + 1}: missing contact_id → skipped.\n`;
          continue;
        }

        const payload = { contact_id: contactId };

        for (let c = 0; c < header.length; c++) {
          const colName = header[c];
          if (!updatableCols.includes(colName)) continue;
          const rawValue = row[c] != null ? String(row[c]).trim() : '';
          if (rawValue === '') continue; // ignore blanks so we don’t wipe data
          payload[colName] = rawValue;
        }

        // If payload only has contact_id and nothing else, skip
        if (Object.keys(payload).length === 1) {
          skippedEmpty++;
          continue;
        }

        try {
          const { error } = await supabase
            .from('contacts')
            .upsert(payload, { onConflict: 'contact_id' });

          if (error) {
            errors++;
            progressBox.textContent += `Row ${i + 1}: error upserting contact_id=${contactId}: ${
              error.message || error
            }\n`;
            continue;
          }

          upserts++;
        } catch (e) {
          errors++;
          progressBox.textContent += `Row ${i + 1}: exception upserting contact_id=${contactId}: ${
            e?.message || e
          }\n`;
        }
      }

      const summary =
        `Mass upload complete. ` +
        `Upserted (inserted or updated) contacts: ${upserts} | ` +
        `Rows with no updatable data: ${skippedEmpty} | ` +
        `Rows with errors: ${errors}`;

      progressBox.textContent += `\n${summary}`;
      logger(summary);

      if (typeof onDone === 'function') {
        await onDone(summary);
      }
    } catch (e) {
      const msg = e?.message || String(e);
      progressBox.textContent += `\nFailed: ${msg}`;
      logger('Mass upload error: ' + msg);
    }
  });

  footer.append(cancel, uploadBtn);
}

/* ----------------------------- helpers ----------------------------- */

function makeButton(label, cls, onClick) {
  const b = document.createElement('button');
  b.className = cls || 'btn';
  b.textContent = label;
  if (onClick) b.onclick = onClick;
  return b;
}

function buildModalShell(title = 'Modal') {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0,0,0,.28)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const card = document.createElement('div');
  card.className = 'card';
  Object.assign(card.style, {
    width: 'min(760px, 92vw)',
    maxHeight: '82vh',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px',
    gap: '10px',
    overflow: 'hidden',
  });

  const head = document.createElement('div');
  Object.assign(head.style, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  });

  const titleBox = document.createElement('div');
  const kicker = document.createElement('div');
  kicker.className = 'kicker';
  kicker.textContent = 'Details';
  const big = document.createElement('div');
  big.className = 'big';
  big.textContent = title;
  titleBox.append(kicker, big);

  const closeBtn = makeButton('✕', 'btn', () => close());

  const body = document.createElement('div');
  Object.assign(body.style, {
    overflow: 'auto',
    padding: '4px 2px',
  });

  const footer = document.createElement('div');
  Object.assign(footer.style, {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  });

  head.append(titleBox, closeBtn);
  card.append(head, body, footer);
  wrap.append(card);

  function close() {
    wrap.remove();
  }

  wrap.addEventListener('click', e => {
    if (e.target === wrap) close();
  });

  document.body.appendChild(wrap);

  return { wrap, card, head, titleBox, body, footer, close };
}

// Simple CSV parser that handles quotes + commas in quotes
function parseCSV(text) {
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cur.push(field);
        field = '';
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }

  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }

  return rows;
}
