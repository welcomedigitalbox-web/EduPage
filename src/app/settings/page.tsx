import { getSettings, getKb } from '@/lib/crm';
import { admin } from '@/lib/supabase';
import { SettingsForm, KbEditor } from '@/components/SettingsForm';
import { ctx } from '@/lib/server-ctx';
import { KbPreview } from '@/components/KbPreview';

export const dynamic = 'force-dynamic';

export default async function Settings() {
  const { t } = await ctx();
  const settings = await getSettings();
  const [kb, kbRes, storeRes] = await Promise.all([
    getKb(settings),
    admin().from('msgr_kb_items').select('id,kind,title,body').eq('is_active', true).order('kind').limit(200),
    admin().from('stores').select('id,name').eq('is_active', true).order('name'),
  ]);

  const L = (k: string) => t(k);
  const products = kb.filter((k) => k.kind === 'product');
  const policies = kb.filter((k) => k.kind !== 'product');

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">{t('se_bot')}</h1>
        <SettingsForm
          initial={settings}
          stores={storeRes.data ?? []}
          labels={{
            enabled: L('se_enabled'), business: L('se_business'), store: L('se_store'),
            storeHint: L('se_store_hint'), pick: L('se_pick'), quoteStock: L('se_quote_stock'),
            language: L('se_language'), langMy: L('se_lang_my'), langEn: L('se_lang_en'),
            langMixed: L('se_lang_mixed'), persona: L('se_persona'), handoff: L('se_handoff'),
            minConf: L('se_min_conf'), maxTurns: L('se_max_turns'),
            followupHours: L('se_followup_hours'), ghostHours: L('se_ghost_hours'),
            save: L('se_save'), saved: L('se_saved'),
          }}
        />
      </section>
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">{t('se_kb')}</h1>
        <p className="text-sm text-muted">{t('se_kb_sub')}</p>
        <KbPreview
          products={products}
          policies={policies}
          labels={{
            title: t('kb_preview'), sub: t('kb_preview_sub'),
            productCount: t('kb_products', { n: products.length }),
            policyCount: t('kb_policies', { n: policies.length }),
            noStore: t('kb_no_store'), outOfStock: t('kb_out_of_stock'),
            showAll: t('kb_show_all'),
          }}
        />
        <KbEditor
          items={kbRes.data ?? []}
          labels={{
            add: L('se_kb_add'), policy: L('se_kb_kind_policy'), faq: L('se_kb_kind_faq'),
            titlePh: L('se_kb_title_ph'), bodyPh: L('se_kb_body_ph'),
            addBtn: L('se_kb_add_btn'), del: L('se_kb_delete'), empty: L('se_kb_empty'),
          }}
        />
      </section>
    </div>
  );
}
