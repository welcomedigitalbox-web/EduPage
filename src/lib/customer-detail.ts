import { admin } from './supabase';
import { customerPurchases, fetchLoyaltyTiers, fetchSalesReps, fetchStores } from './pos';

export async function contactDetail(contactId: string) {
  const db = admin();
  const { data: contact } = await db
    .from('msgr_contacts')
    .select('*')
    .eq('id', contactId)
    .maybeSingle();
  if (!contact) return null;

  const [convo, stores, tiers, reps] = await Promise.all([
    db.from('msgr_conversations').select('id,status,last_reply_by,inbound_count,outbound_count')
      .eq('contact_id', contactId).maybeSingle().then((r) => r.data),
    fetchStores(),
    fetchLoyaltyTiers(),
    fetchSalesReps(),
  ]);

  const customer = contact.customer_id
    ? await db.from('customers')
        .select('id,name,phone,email,delivery_address,loyalty_tier_id,store_id,created_at')
        .eq('id', contact.customer_id).maybeSingle().then((r) => r.data)
    : null;

  const purchases = contact.customer_id ? await customerPurchases(contact.customer_id) : [];

  const { data: events } = await db
    .from('msgr_lead_events').select('*').eq('contact_id', contactId)
    .order('created_at', { ascending: false }).limit(20);

  return {
    contact, conversation: convo, customer, purchases,
    stores, tiers, reps, events: events ?? [],
  };
}
