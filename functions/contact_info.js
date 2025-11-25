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
    (Object.keys(contact).find((k) => /email/i.test(k) && !isEmpty(contact[k]))
      ? contact[Object.keys(contact).find((k) => /email/i.test(k) && !isEmpty(contact[k]))]
      : null);

  const phone =
    contact.contact_phone ||
    contact.phone ||
    contact.mobile ||
    contact.phone_number ||
    (Object.keys(contact).find((k) => /phone|mobile|cell/i.test(k) && !isEmpty(contact[k]))
      ? contact[
          Object.keys(contact).find(
            (k) => /phone|mobile|cell/i.test(k) && !isEmpty(contact[k])
          )
        ]
      : null);

  const gradYear =
    contact.grade ||
    contact.hs_grad ||
    contact.grad_year ||
    contact.graduation_year ||
    null;

  const school =
    contact.school ||
    contact.school_name ||
    contact.high_school ||
    contact.institution ||
    null;

  const program =
    contact.program ||
    contact.pathway ||
    contact.track ||
    contact.major ||
    null;

  // 🔥 engagement indicator
  const indicatorScore =
    contact.indicator != null
      ? Number(contact.indicator)
      : 0;
  const isHighEngagement = indicatorScore > 0;

  // ---- relationship / parent-guardian fields ----
  const guardianName =
    contact.parent_guardian_name ||
    contact.guardian_name ||
    contact.parent_name ||
    null;

  const guardianRelation =
    contact.parent_guardian_relation ||
    contact.guardian_relation ||
    contact.relation ||
    null;

  const preferredLanguage =
    contact.preferred_language ||
    contact.language_preference ||
    contact.home_language ||
    contact.primary_language ||
    null;

  const guardianNumber =
    contact.parent_guardian_number ||
    contact.guardian_number ||
    contact.parent_phone ||
    null;

  const guardianEmail =
    contact.parent_guardian_email ||
    contact.guardian_email ||
    contact.parent_email ||
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

  // ---- header (name + chips) ----
  const header = div('');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '10px',
    justifyContent: 'center',
  });

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
      fontSize: '24px',
      fontWeight: '800',
      color: '#111827',
    });
    nameBlock.appendChild(nameEl);
  }

  // Chips row (school / grad year / program / engagement)
  const chipRow = div('');
  Object.assign(chipRow.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    justifyContent: 'center',
  });

  if (school) chipRow.appendChild(makeChip(school));
  if (gradYear) chipRow.appendChild(makeChip(`${gradYear}`));
  if (program) chipRow.appendChild(makeChip(program));

  // 🔥 High engagement chip
  if (isHighEngagement) {
    const chip = makeChip('🔥 High Engagement');
    chip.title = `Engagement score: ${indicatorScore}`;
    chipRow.appendChild(chip);
  }

  if (chipRow.childNodes.length) {
    nameBlock.appendChild(chipRow);
  }


  header.append(nameBlock);
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

  // ---- relationship / parent-guardian section ----
  const hasGuardianInfo =
    guardianName ||
    guardianRelation ||
    preferredLanguage ||
    guardianNumber ||
    guardianEmail;

  let relationshipSection = null;

  if (hasGuardianInfo) {
    // Toggle button
    const relToggle = document.createElement('button');
    relToggle.type = 'button';
    relToggle.textContent = 'Show Relationship Information';
    Object.assign(relToggle.style, {
      marginTop: '4px',
      marginBottom: '4px',
      borderRadius: '999px',
      border: '1px solid rgba(148,163,184,0.6)',
      background: 'rgba(248,250,252,0.9)',
      padding: '6px 12px',
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer',
    });

    relationshipSection = div('');
    Object.assign(relationshipSection.style, {
      display: 'none',
      marginTop: '8px',
      paddingTop: '8px',
      borderTop: '1px solid rgba(148,163,184,0.35)',
    });

    // Section title
    const relTitle = div('');
    relTitle.textContent = 'Relationship Information';
    Object.assign(relTitle.style, {
      fontSize: '13px',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: '#6b7280',
      marginBottom: '6px',
    });
    relationshipSection.appendChild(relTitle);

    // Header: guardian name + chips (relation + language)
    const relHeader = div('');
    Object.assign(relHeader.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '6px',
    });

    const relNameBlock = div('');
    Object.assign(relNameBlock.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      alignItems: 'center',
    });

    if (guardianName) {
      const gNameEl = div('');
      gNameEl.textContent = guardianName;
      Object.assign(gNameEl.style, {
        fontSize: '15px',
        fontWeight: '800',
        color: '#111827',
      });
      relNameBlock.appendChild(gNameEl);
    }

    const relChips = div('');
    Object.assign(relChips.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      justifyContent: 'center',
    });

    if (guardianRelation) {
      relChips.appendChild(makeChip(`Relation: ${guardianRelation}`));
    }
    if (preferredLanguage) {
      relChips.appendChild(makeChip(`Preferred Language: ${preferredLanguage}`));
    }

    if (relChips.childNodes.length) {
      relNameBlock.appendChild(relChips);
    }

    relHeader.appendChild(relNameBlock);
    relationshipSection.appendChild(relHeader);

    // Primary guardian contact info row
    const relPrimaryRow = div('');
    Object.assign(relPrimaryRow.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '10px',
      justifyContent: 'center',
    });

    if (guardianNumber) {
      relPrimaryRow.appendChild(
        primaryItem('📞', 'Parent/Guardian Number', guardianNumber)
      );
    }

    if (guardianEmail) {
      const item = primaryItem('✉️', 'Parent/Guardian Email', guardianEmail);
      const vEl = item.querySelector('.v');
      if (vEl) vEl.style.wordBreak = 'break-all';
      relPrimaryRow.appendChild(item);
    }

    if (relPrimaryRow.childNodes.length) {
      relationshipSection.appendChild(relPrimaryRow);
    }

    // Wire toggle
    let relExpanded = false;
    relToggle.addEventListener('click', () => {
      relExpanded = !relExpanded;
      relationshipSection.style.display = relExpanded ? 'block' : 'none';
      relToggle.textContent = relExpanded
        ? 'Hide Relationship Information'
        : 'Show Relationship Information';
    });

    card.appendChild(relToggle);
    card.appendChild(relationshipSection);
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

    // guardian / relationship-related keys (handled separately)
    'parent_guardian_name',
    'guardian_name',
    'parent_name',
    'parent_guardian_relation',
    'guardian_relation',
    'relation',
    'parent_guardian_number',
    'guardian_number',
    'parent_phone',
    'parent_guardian_email',
    'guardian_email',
    'parent_email',
    'preferred_language',
    'language_preference',
    'home_language',
    'primary_language',
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
