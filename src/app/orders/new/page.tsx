import Link from 'next/link';
import { shops } from '@/lib/orders';
import { admin } from '@/lib/supabase';
import { ctx } from '@/lib/server-ctx';
import { OrderForm, type Line } from '@/components/OrderForm';
import { orderFormLabels } from '@/lib/order-labels';

export const dynamic = 'force-dynamic';

interface DraftLine {
  product_name?: string; qty?: number; unit_price?: number; variant_id?: string | null;
}

export default async function NewOrder({
  searchParams,
}: { searchParams: Promise<{ contact?: string; convo?: string }> }) {
  const { t } = await ctx();
  const sp = await searchParams;
  const list = await shops();

  // Coming from a chat: carry the customer over, and the basket the bot pulled
  // out of the conversation, so staff are not retyping what was already said.
  let initial: Record<string, unknown> = {};
  if (sp.contact) {
    const db = admin();
    const { data: c } = await db.from('msgr_contacts')
      .select('name,phone,address,city').eq('id', sp.contact).maybeSingle();
    let items: Line[] = [];
    if (sp.convo) {
      const { data: draft } = await db.from('msgr_messages')
        .select('ai').eq('conversation_id', sp.convo).eq('author', 'system')
        .order('sent_at', { ascending: false }).limit(5);
      const found = (draft ?? [])
        .map((m) => (m.ai as { draft_order?: DraftLine[] } | null)?.draft_order)
        .find((d) => Array.isArray(d) && d.length);
      items = (found ?? []).map((d) => ({
        barcode: '',
        description: d.product_name ?? '',
        unit_price: Number(d.unit_price ?? 0),
        qty: Number(d.qty ?? 1),
      }));
    }
    initial = {
      customer_name: c?.name ?? '',
      phone: c?.phone ?? '',
      city: c?.city ?? '',
      delivery_address: c?.address ?? '',
      items,
    };
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/orders" className="text-xs text-muted hover:text-brand">{t('or2_back')}</Link>
        <h1 className="mt-1 text-xl font-semibold">{t('or2_new')}</h1>
      </div>
      <OrderForm
        shops={list as { id: string; name: string; region: string | null }[]}
        initial={initial}
        contactId={sp.contact ?? null}
        conversationId={sp.convo ?? null}
        labels={orderFormLabels(t)}
      />
    </div>
  );
}
