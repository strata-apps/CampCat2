// functions/engagement_indicator.js
// Computes an "engagement score" per contact and updates contacts.indicator.
//
// Scoring rules (per contact):
// (1) Every *campaign* where the contact either:
//     - responded "Yes" in call_progress.response, OR
//     - appears in events.rsvp_ids for that campaign_id
//     => +2 pts per unique campaign (do NOT double count Yes + RSVP for same campaign)
// (2) Every call_progress outcome:
//     - "answered"  => +1 pt
//     - "no_answer" => -1 pt
// (3) Every event in events:
//     - if contact_id in event.contact_ids => +5 pts (attended)
//     - else, if contact has ANY call_progress row for that event.campaign_id
//       but is NOT in contact_ids          => -5 pts (did not show)
// (4) Clamp final score to [-10, 20].
//
// This runs for a set of contact_ids (e.g., the campaign’s queue) and
// writes scores into contacts.indicator.

const sup = () => window.supabase;

export async function updateEngagementIndicatorsForContacts(contactIds) {
  const s = sup();
  if (!s) return;

  // Normalize list of contact ids
  if (!contactIds || !contactIds.length) return;

  const normalized = [...new Set(contactIds.map((id) => String(id)))];
  if (!normalized.length) return;

  // Map "id as string" -> original id value (for writing back)
  const originalByStr = new Map();
  contactIds.forEach((id) => {
    const key = String(id);
    if (!originalByStr.has(key)) originalByStr.set(key, id);
  });

  // Base score map
  const scores = new Map();
  for (const idStr of normalized) {
    scores.set(idStr, 0);
  }

  // (A) call_progress rows for these contacts
  const { data: cpRows, error: cpErr } = await s
    .from('call_progress')
    .select('contact_id, campaign_id, outcome, response')
    .in('contact_id', normalized);

  if (cpErr) {
    console.error('[engagement] call_progress error', cpErr);
    return;
  }

  const callRows = cpRows || [];

  // Track campaigns with any positive "Yes" or RSVP engagement
  const campaignsYesOrRsvpByContact = new Map(); // contactStr -> Set(campaign_idStr)

  // Track which contacts participated in which campaigns (any outcome)
  const cpByCampaign = new Map(); // campaign_idStr -> Set(contactStr)

  //  (1) & (2): walk call_progress
  for (const row of callRows) {
    const idStr = String(row.contact_id);
    if (!scores.has(idStr)) continue;

    const campStr = row.campaign_id != null ? String(row.campaign_id) : null;
    const outcome = (row.outcome || '').toLowerCase();
    const resp = (row.response || '').toLowerCase();

    // collect campaigns for penalties and yes-scoring
    if (campStr) {
      if (!cpByCampaign.has(campStr)) cpByCampaign.set(campStr, new Set());
      cpByCampaign.get(campStr).add(idStr);
    }

    // (2) answered / no_answer
    let sc = scores.get(idStr) || 0;
    if (outcome === 'answered') sc += 1;
    else if (outcome === 'no_answer') sc -= 1;
    scores.set(idStr, sc);

    // (1) Yes response -> remember this campaign for +2 later
    if (resp === 'yes' && campStr) {
      let set = campaignsYesOrRsvpByContact.get(idStr);
      if (!set) {
        set = new Set();
        campaignsYesOrRsvpByContact.set(idStr, set);
      }
      set.add(campStr);
    }
  }

  // (B) events: for attendance, RSVPs, and penalties
  const { data: evRows, error: evErr } = await s
    .from('events')
    .select('event_id, campaign_id, contact_ids, rsvp_ids');

  if (evErr) {
    console.error('[engagement] events error', evErr);
    return;
  }

  const events = evRows || [];

  for (const ev of events) {
    const campStr = ev.campaign_id != null ? String(ev.campaign_id) : null;

    const rsvpArr = Array.isArray(ev.rsvp_ids) ? ev.rsvp_ids : [];
    const attendArr = Array.isArray(ev.contact_ids) ? ev.contact_ids : [];

    const attendSet = new Set(attendArr.map((v) => String(v)));

    // (1) RSVPs: union with "Yes" sources per campaign (no double count)
    if (campStr) {
      for (const cid of rsvpArr) {
        const idStr = String(cid);
        if (!scores.has(idStr)) continue;

        let set = campaignsYesOrRsvpByContact.get(idStr);
        if (!set) {
          set = new Set();
          campaignsYesOrRsvpByContact.set(idStr, set);
        }
        set.add(campStr);
      }
    }

    // (3) Attendance: +5 per event where contact is in contact_ids
    for (const cid of attendArr) {
      const idStr = String(cid);
      if (!scores.has(idStr)) continue;
      const sc = (scores.get(idStr) || 0) + 5;
      scores.set(idStr, sc);
    }

    // (3) Penalty: -5 when contact has calls under this campaign_id but is NOT in contact_ids
    if (campStr && cpByCampaign.has(campStr)) {
      const callers = cpByCampaign.get(campStr);
      for (const idStr of callers) {
        if (!scores.has(idStr)) continue;
        if (attendSet.has(idStr)) continue; // they attended → no penalty
        const sc = (scores.get(idStr) || 0) - 5;
        scores.set(idStr, sc);
      }
    }
  }

  // (1) Now add +2 per unique campaign with Yes / RSVP (no double count per campaign)
  for (const [idStr, campaignSet] of campaignsYesOrRsvpByContact.entries()) {
    if (!scores.has(idStr)) continue;
    const uniqueCampaigns = campaignSet.size || 0;
    if (!uniqueCampaigns) continue;
    const extra = uniqueCampaigns * 2;
    scores.set(idStr, (scores.get(idStr) || 0) + extra);
  }

  // (4) Clamp to [-10, 20] and prepare updates
  const updates = [];
  for (const idStr of normalized) {
    let sc = scores.get(idStr) || 0;
    if (sc > 20) sc = 20;
    if (sc < -10) sc = -10;

    const originalId = originalByStr.get(idStr) ?? idStr;
    updates.push({
      contact_id: originalId,
      indicator: sc,
    });
  }

  if (!updates.length) return;

  try {
    const { error: upErr } = await s
      .from('contacts')
      .upsert(updates, { onConflict: 'contact_id' });

    if (upErr) {
      console.error('[engagement] upsert indicators error', upErr);
    }
  } catch (e) {
    console.error('[engagement] unexpected error writing indicators', e);
  }
}
