import Link from 'next/link';
import { notFound } from 'next/navigation';
import { contactDetail } from '@/lib/customer-detail';
import { ctx } from '@/lib/server-ctx';
import { STAGE_KEY } from '@/lib/i18n';
import { StageBadge, money, ago } from '@/components/ui';
import { ProfileForm, HouseholdLink } from '@/components/CustomerDetail';
import type { LeadStage } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await ctx();
  const { id } = await params;
  const data = await contactDetail(id);
  if (!data) notFound();

  const { contact, conversation, customer, purchases, stores, tiers, reps, events, household } = data;
  const spent = purchases
    .filter((p) => p.order_status !== 'cancelled')
    .reduce((s, p) => s + Number(p.total || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/customers" className="text-xs text-muted hover:text-brand">{t('cd_back')}</Link>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold">
            {contact.name ?? `PSID ${contact.psid.slice(-6)}`}
            <StageBadge stage={contact.stage as LeadStage}
              label={t(STAGE_KEY[contact.stage] ?? contact.stage)} />
          </h1>
          <p className="text-xs text-muted">
            {t('cd_source')}: {contact.source_ad_id ? `ad · ${contact.source_ad_id}` : (contact.source_type ?? 'organic')}
          </p>
        </div>
        {conversation && (
          <Link href={`/inbox/${conversation.id}`} className="btn">{t('cd_open_chat')}</Link>
        )}
      </div>

      <div className={`card p-3 text-sm ${customer ? 'border-good/50' : 'border-warn/50'}`}>
        {customer ? t('cd_pos_linked') : t('cd_pos_not_linked')}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <ProfileForm
          contactId={contact.id}
          initial={{
            name: contact.name ?? '',
            phone: contact.phone ?? '',
            email: contact.email ?? customer?.email ?? '',
            address: contact.address ?? '',
            city: contact.city ?? '',
            store_id: contact.store_id ?? customer?.store_id ?? '',
            preferred_rep_id: contact.preferred_rep_id ?? '',
            loyalty_tier_id: customer?.loyalty_tier_id ?? '',
            notes: contact.notes ?? '',
            tags: contact.tags ?? [],
          }}
          stores={stores}
          reps={reps}
          tiers={tiers}
          labels={{
            profile: t('cd_profile'), name: t('cd_name'), phone: t('cd_phone'),
            email: t('cd_email'), address: t('cd_address'), city: t('cd_city'),
            store: t('cd_store'), rep: t('cd_rep'), tier: t('cd_tier'), none: t('cd_none'),
            save: t('cd_save'), savePos: t('cd_save_pos'), saved: t('cd_saved'),
            needContact: t('cd_need_contact'), notes: t('cd_notes'), tags: t('cd_tags'),
            discountNote: t('cd_discount_note'),
          }}
        />

        <aside className="space-y-4">
          <div className="card p-4">
            <div className="label">{t('cd_total_spent')}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{money(spent)}</div>
          </div>

          <HouseholdLink
            contactId={contact.id}
            linkedCustomerId={contact.customer_id ?? null}
            household={household}
            money={money}
            labels={{
              title: t('hh_title'), sub: t('hh_sub'), search: t('hh_search'),
              link: t('hh_link'), unlink: t('hh_unlink'), noneFound: t('hh_none_found'),
              spent: t('hh_spent', { v: '{v}' }), members: t('hh_members'),
              noMembers: t('hh_no_members'), confirmUnlink: t('hh_confirm_unlink'),
            }}
          />

          <div className="card p-3">
            <div className="label mb-2">{t('th_history')}</div>
            <ul className="space-y-1 text-xs text-muted">
              {events.map((e) => (
                <li key={e.id}>
                  {e.from_stage ?? '—'} → <span className="text-white">{e.to_stage}</span>
                  <span className="ml-1">({ago(e.created_at, t)})</span>
                </li>
              ))}
              {!events.length && <li>{t('th_no_history')}</li>}
            </ul>
          </div>
        </aside>
      </div>

      <div className="card overflow-x-auto">
        <div className="label p-3">{t('cd_purchases')}</div>
        <table className="w-full text-sm">
          <thead className="text-muted">
            <tr className="border-b border-edge">
              <th className="p-3 text-left font-normal">{t('cd_ref')}</th>
              <th className="p-3 text-left font-normal">{t('cd_date')}</th>
              <th className="p-3 text-left font-normal">{t('cd_channel')}</th>
              <th className="p-3 text-left font-normal">{t('cd_status')}</th>
              <th className="p-3 text-right font-normal">{t('cd_amount')}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {purchases.map((p) => (
              <tr key={p.id} className="border-b border-edge/60">
                <td className="p-3">{p.sale_ref ?? p.id.slice(0, 8)}</td>
                <td className="p-3">{new Date(p.created_at).toLocaleDateString()}</td>
                <td className="p-3 text-xs text-muted">{p.channel ?? 'in-store'} · {p.store_id}</td>
                <td className="p-3 text-xs text-muted">{p.order_status ?? p.payment_method}</td>
                <td className="p-3 text-right">{money(Number(p.total))}</td>
              </tr>
            ))}
            {!purchases.length && (
              <tr><td colSpan={5} className="p-6 text-center text-muted">{t('cd_no_purchases')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
