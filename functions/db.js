// functions/db.js
import supabase from '../supabaseClient.js';

/* --------------------- Call Campaigns --------------------- */

export async function upsertCampaignDraft({
  campaign_id,
  campaign_name,
  filters = null,
  student_ids = [],
  dates = null,
  survey_questions = [],
  survey_options = [],
  workflow = null,
  created_at = null,
}) {
  const now = new Date().toISOString();
  const row = {
    campaign_id,
    campaign_name,
    filters,
    student_ids,
    dates,
    survey_questions,
    survey_options,
    workflow,
    created_at: created_at ?? now,
    updated_at: now,
  };
  const { error } = await supabase
    .from('call_campaigns')
    .upsert(row, { onConflict: 'campaign_id' });
  if (error) throw error;
  return campaign_id;
}

export async function updateCampaignWorkflow(campaign_id, workflow) {
  const { error } = await supabase
    .from('call_campaigns')
    .update({ workflow, updated_at: new Date().toISOString() })
    .eq('campaign_id', campaign_id);
  if (error) throw error;
}

export async function listCallCampaigns() {
  const { data, error } = await supabase
    .from('call_campaigns')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function deleteCallCampaign(campaign_id) {
  const { error } = await supabase
    .from('call_campaigns')
    .delete()
    .eq('campaign_id', campaign_id);
  if (error) throw error;
}

/* ----------------------- Contacts ------------------------ */
export async function fetchContacts(filters = {}, limit = 200) {
  let q = supabase.from('contacts')
    .select('contact_id, contact_first, contact_last, contact_email, contact_phone')
    .limit(limit);

  if (filters.contact_first) q = q.ilike('contact_first', `%${filters.contact_first}%`);
  if (filters.contact_last)  q = q.ilike('contact_last',  `%${filters.contact_last}%`);
  if (filters.contact_email) q = q.ilike('contact_email', `%${filters.contact_email}%`);
  if (filters.contact_phone) q = q.ilike('contact_phone', `%${filters.contact_phone}%`);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/* -------------------- Call Progress + Interactions -------------------- */

export async function upsertCallProgress({
  campaign_id,
  contact_id,
  outcome,            // 'answered' | 'no_answer' | etc.
  responses = null,   // string or null
  notes = null,       // string or null
}) {
  const now = new Date().toISOString();
  const row = {
    campaign_id,
    contact_id,
    outcome,
    responses,
    notes,
    last_called_at: now,
    attempts: 1,
  };
  // onConflict composite: campaign_id,contact_id
  const { error } = await supabase
    .from('call_progress')
    .upsert(row, { onConflict: 'campaign_id,contact_id' });
  if (error) throw error;
}

export async function insertInteraction({ contact_id, campaign_id, user_id = null, call_time = null }) {
  const { error } = await supabase
    .from('interactions')
    .insert({
      contact_id,
      campaign_id,
      user_id,
      call_time: call_time ?? new Date().toISOString(),
    });
  if (error) throw error;
}

export async function listInteractions({ contact_id, campaign_id, limit = 100 }) {
  const { data, error } = await supabase
    .from('interactions')
    .select('id, contact_id, campaign_id, user_id, call_time')
    .eq('contact_id', contact_id)
    .eq('campaign_id', campaign_id)
    .order('call_time', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/* --------------------------- Tasks --------------------------- */

export async function insertTask({ text, active = true, user_id = null }) {
  const { error } = await supabase
    .from('tasks')
    .insert({ text, active, user_id });
  if (error) throw error;
}
