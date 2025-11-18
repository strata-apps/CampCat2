// functions/filters.js
// Builds a dropdown-based filter UI for contacts table using distinct values from Supabase.

import supabase from '../supabaseClient.js';

// Fallback fields if we can't introspect the table (network error, etc.)
const FALLBACK_FIELDS = [
  { label: 'First Name', value: 'contact_first' },
  { label: 'Last Name',  value: 'contact_last'  },
  { label: 'Email',      value: 'contact_email' },
  { label: 'Phone',      value: 'contact_phone' },
];

/**
 * Mounts the dropdown filtering UI inside `container`.
 * Field select -> Value select (auto-populates from distinct DB values).
 * NOW: fields are discovered dynamically from `contacts` columns.
 */
export function mountContactFilters(container) {
  if (!container) return;

  container.innerHTML = `
    <select id="cc-field" class="select-pill" aria-label="Filter field">
      <option value="">Loading fields…</option>
    </select>

    <select id="cc-value" class="select-pill" aria-label="Filter value" disabled>
      <option value="">Select value…</option>
    </select>
  `;

  const fieldSel = container.querySelector('#cc-field');
  const valueSel = container.querySelector('#cc-value');

  // Async: fetch a sample row to infer columns
  (async () => {
    try {
      if (!supabase?.from) throw new Error('Supabase client unavailable');

      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .limit(1);

      let columns = [];
      if (!error && Array.isArray(data) && data.length) {
        columns = Object.keys(data[0] || {});
      } else {
        // Fallback to original 4 fields
        columns = FALLBACK_FIELDS.map(f => f.value);
      }

      // Skip non-editable/system columns
      const skip = new Set([
        'contact_id',
        'created_at',
        'updated_at',
        'owner_id',
      ]);

      const usable = columns.filter(c => !skip.has(c));

      if (!usable.length) {
        fieldSel.innerHTML = `<option value="">No fields available</option>`;
        return;
      }

      fieldSel.innerHTML = [
        `<option value="">Select field…</option>`,
        ...usable.map(col =>
          `<option value="${escapeHtml(col)}">${escapeHtml(prettyLabel(col))}</option>`
        ),
      ].join('');
    } catch (err) {
      console.warn('mountContactFilters: failed to load columns, using fallback.', err);
      fieldSel.innerHTML = [
        `<option value="">Select field…</option>`,
        ...FALLBACK_FIELDS.map(f =>
          `<option value="${escapeHtml(f.value)}">${escapeHtml(f.label)}</option>`
        ),
      ].join('');
    }
  })();

  // When the field changes, repopulate value list from distinct DB values
  fieldSel.addEventListener('change', async () => {
    const col = fieldSel.value;
    valueSel.innerHTML = `<option value="">Select value…</option>`;
    valueSel.disabled = true;

    if (!col) return;

    const values = await fetchDistinctValues(col);
    if (values.length) {
      valueSel.innerHTML = [
        `<option value="">(Any)</option>`,
        ...values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`),
      ].join('');
      valueSel.disabled = false;
    }
  });
}

/**
 * Returns the active filter as { field, value } or null if none.
 * Same shape as before, so create_calls.js does not need to change.
 */
export function getSelectedFilter(container) {
  const field = container?.querySelector('#cc-field')?.value || '';
  const value = container?.querySelector('#cc-value')?.value || '';
  if (!field || value === '') return null;
  return { field, value };
}

/**
 * Fetch distinct non-null values for a column from public.contacts.
 * Uses JS de-duplication to be compatible across PostgREST versions.
 */
async function fetchDistinctValues(column) {
  if (!supabase?.from) return [];

  let { data, error } = await supabase
    .from('contacts')
    .select(column)
    .not(column, 'is', null)
    .order(column, { ascending: true })
    .limit(1000);

  if (error) {
    console.warn('fetchDistinctValues error:', error);
    return [];
  }
  const set = new Set(
    (data || [])
      .map(r => (r[column] ?? '').toString())
      .filter(Boolean)
  );
  return Array.from(set);
}

function prettyLabel(key) {
  // contact_grade_level -> "Contact Grade Level"
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function escapeHtml(s = '') {
  return s.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[m]));
}
