// functions/contact_info.js
// Creates a clean, modern "only non-null fields" card for a contact.

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
const div = (...args) => el('div', ...args);

function isEmpty(v) {
  if (v == null) return true;
  const s = String(v).trim();
  return s === '' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined';
}

function pretty(k) {
  return String(k)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function renderContactInfo(contact = {}) {
  const KNOWN_HIDE = new Set(['contact_id', 'id', 'created_at', 'updated_at']);

  // Build raw field list (label, value, key) so we can filter primary vs secondary later
  const allPairs = [];
  for (const [k, v] of Object.entries(contact || {})) {
    if (KNOWN_HIDE.has(k)) continue;
    if (isEmpty(v)) continue;
    allPairs.push([pretty(k), String(v), k]);
  }

  const card = div('detailsCard');

  // Modern card styling
  Object.assign(card.style, {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '16px',
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'linear-gradient(135deg, #ffffff, #f9fafb)',
    boxShadow: '0 10px 24px rgba(15,23,42,0.08)',
    boxSizing: 'border-box',
    textAlign: 'center', // center content by default
  });

  if (!allPairs.length) {
    const title = div('kicker', 'Contact Details');
    title.style.marginBottom = '4px';
    const empty = div('label', 'No additional details for this contact yet.');
    card.append(title, empty);
    return card;
  }

  // ---- derive primary fields for nicer header ----
  const first = contact.contact_first || contact.first_name || '';
  const last =
    contact.contact_last ||
    contact.last_name ||
    (contact.full_name && contact.full_name.split(' ').slice(1).join(' ')) ||
    '';
  const displayName =
    (contact.full_name ||
      `${first} ${last}`.trim() ||
      contact.name ||
      contact.student_name ||
      '') || '';

  const email =
    contact.contact_email ||
    contact.email ||
    Object.keys(contact).find((k) => /email/i.test(k) && !isEmpty(contact[k]))
      ? contact[Object.keys(contact).find((k) => /email/i.test(k) && !isEmpty(contact[k]))]
      : null;

  const phone =
    contact.contact_phone ||
    contact.phone ||
    contact.mobile ||
    contact.phone_number ||
    Object.keys(contact).find((k) => /phone|mobile|cell/i.test(k) && !isEmpty(contact[k]))
      ? contact[
          Object.keys(contact).find(
            (k) => /phone|mobile|cell/i.test(k) && !isEmpty(contact[k])
          )
        ]
      : null;

  const gradYear =
    contact.hs_grad_year ||
    contact.hs_grad ||
    contact.grad_year ||
    contact.graduation_year ||
    null;

  const school =
    contact.school ||
    contact.school_name ||
    contact.high_school ||
    contact.campus ||
    null;

  const program =
    contact.program ||
    contact.pathway ||
    contact.track ||
    contact.major ||
    null;

  const avatarInitials = (() => {
    if (displayName) {
      const parts = displayName.trim().split(/\s+/);
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (email) return String(email).slice(0, 2).toUpperCase();
    return 'CC';
  })();

  // ---- title row ----
  const titleRow = div('');
  titleRow.className = 'kicker';
  titleRow.textContent = 'Contact Details';
  titleRow.style.marginBottom = '8px';
  card.appendChild(titleRow);

  // ---- header (avatar + name + chips) ----
  const header = div('');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '10px',
    justifyContent: 'center',
  });

  const avatar = div('');
  Object.assign(avatar.style, {
    width: '42px',
    height: '42px',
    borderRadius: '999px',
    background: 'linear-gradient(145deg, #dbeafe, #e5f3ff)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '800',
    color: '#1f2937',
    fontSize: '16px',
  });
  avatar.textContent = avatarInitials;

  const nameBlock = div('');
  Object.assign(nameBlock.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    alignItems: 'center',
  });

  if (displayName) {
    const nameEl = div('');
    nameEl.textContent = displayName;
    Object.assign(nameEl.style, {
      fontSize: '16px',
      fontWeight: '800',
      color: '#111827',
    });
    nameBlock.appendChild(nameEl);
  }

  // Chips row (school / grad year / program)
  const chipRow = div('');
  Object.assign(chipRow.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    justifyContent: 'center',
  });

  if (school) chipRow.appendChild(makeChip(school));
  if (gradYear) chipRow.appendChild(makeChip(`Class of ${gradYear}`));
  if (program) chipRow.appendChild(makeChip(program));

  if (chipRow.childNodes.length) {
    nameBlock.appendChild(chipRow);
  }

  header.append(avatar, nameBlock);
  card.appendChild(header);

  // ---- primary info row (email / phone) ----
  const primaryRow = div('');
  Object.assign(primaryRow.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '10px',
    justifyContent: 'center',
  });

  if (email) {
    const item = primaryItem('📧', 'Email', email);
    const vEl = item.querySelector('.v');
    if (vEl) vEl.style.wordBreak = 'break-all';
    primaryRow.appendChild(item);
  }
  if (phone) {
    const item = primaryItem('📱', 'Phone', phone);
    primaryRow.appendChild(item);
  }

  if (primaryRow.childNodes.length) {
    card.appendChild(primaryRow);
  }

  // ---- secondary fields (everything else) ----
  const PRIMARY_KEYS = new Set([
    'contact_first',
    'contact_last',
    'first_name',
    'last_name',
    'full_name',
    'name',
    'student_name',
    'contact_email',
    'email',
    'contact_phone',
    'phone',
    'mobile',
    'phone_number',
    'hs_grad_year',
    'hs_grad',
    'grad_year',
    'graduation_year',
    'school',
    'school_name',
    'high_school',
    'campus',
    'program',
    'pathway',
    'track',
    'major',
  ]);

  const secondaryPairs = allPairs.filter(([_, __, key]) => !PRIMARY_KEYS.has(key));

  if (secondaryPairs.length) {
    const divider = div('');
    Object.assign(divider.style, {
      height: '1px',
      background: 'rgba(148,163,184,0.35)',
      margin: '4px 0 6px 0',
    });
    card.appendChild(divider);

    const MAX_VISIBLE = 7;
    const hiddenContainer = div('');
    hiddenContainer.style.display = 'none';

    secondaryPairs.forEach(([label, value], idx) => {
      const row = createCenteredRow(label, value);

      if (idx < MAX_VISIBLE) {
        card.appendChild(row);
      } else {
        hiddenContainer.appendChild(row);
      }
    });

    if (hiddenContainer.childNodes.length) {
      card.appendChild(hiddenContainer);

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.textContent = `Show ${hiddenContainer.childNodes.length} more details`;
      Object.assign(toggle.style, {
        marginTop: '6px',
        borderRadius: '999px',
        border: '1px solid rgba(148,163,184,0.6)',
        background: 'rgba(248,250,252,0.9)',
        padding: '6px 12px',
        fontSize: '12px',
        fontWeight: '600',
        cursor: 'pointer',
      });

      let expanded = false;
      toggle.addEventListener('click', () => {
        expanded = !expanded;
        hiddenContainer.style.display = expanded ? 'block' : 'none';
        toggle.textContent = expanded
          ? 'Show fewer details'
          : `Show ${hiddenContainer.childNodes.length} more details`;
      });

      card.appendChild(toggle);
    }
  }

  return card;
}

export default renderContactInfo;

// ---- small helpers ----

function makeChip(text) {
  const chip = div('');
  Object.assign(chip.style, {
    padding: '2px 8px',
    borderRadius: '999px',
    background: 'rgba(59,130,246,0.09)',
    border: '1px solid rgba(59,130,246,0.2)',
    fontSize: '11px',
    fontWeight: '600',
    color: '#1d4ed8',
    whiteSpace: 'nowrap',
  });
  chip.textContent = text;
  return chip;
}

function primaryItem(emoji, label, value) {
  const wrap = div('');
  Object.assign(wrap.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 8px',
    borderRadius: '10px',
    background: 'rgba(15,23,42,0.025)',
    border: '1px solid rgba(148,163,184,0.35)',
    flex: '1 1 180px',
    justifyContent: 'center',
  });

  const icon = div('');
  icon.textContent = emoji;
  Object.assign(icon.style, {
    fontSize: '14px',
  });

  const content = div('');
  Object.assign(content.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: '1',
    alignItems: 'center',
  });

  const kEl = div('k', label);
  Object.assign(kEl.style, {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#6b7280',
  });

  const vEl = div('v', value);
  Object.assign(vEl.style, {
    fontSize: '13px',
    fontWeight: '600',
    color: '#111827',
  });

  content.append(kEl, vEl);
  wrap.append(icon, content);
  return wrap;
}

function createCenteredRow(label, value) {
  const row = div('kv');
  Object.assign(row.style, {
    padding: '4px 0',
  });

  // Centered line: **Label:** value
  const text = document.createElement('div');
  Object.assign(text.style, {
    fontSize: '13px',
    color: '#111827',
    fontWeight: '500',
  });
  text.innerHTML = `<span style="font-weight:700;">${label}:</span> ${value}`;

  row.appendChild(text);
  return row;
}
