import { getSettings, getKb } from '@/lib/crm';
import { admin } from '@/lib/supabase';
import { SettingsForm, KbEditor } from '@/components/SettingsForm';
import { ctx } from '@/lib/server-ctx';
import { KbPreview } from '@/components/KbPreview';
import { UserManager } from '@/components/Users';

export const dynamic = 'force-dynamic';

export default async function Settings() {
  const { t, session } = await ctx();
  const settings = await getSettings();
  const [kb, kbRes, storeRes] = await Promise.all([
    getKb(settings),
    admin().from('msgr_kb_items').select('id,kind,title,body').eq('is_active', true).order('kind').limit(200),
    admin().from('stores').select('id,name,region')
      .eq('is_active', true).eq('is_warehouse', false).order('name'),
  ]);
  const { data: users } = await admin()
    .from('msgr_users').select('id,email,name,role,is_active,last_login_at').order('created_at');

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
            stores: L('se_stores'), storesHint: L('se_stores_hint'),
            defaultStore: L('se_default_store'),
            language: L('se_language'), langMy: L('se_lang_my'), langEn: L('se_lang_en'),
            langMixed: L('se_lang_mixed'), persona: L('se_persona'), handoffMsg: L('se_handoff_msg'), handoff: L('se_handoff'),
            minConf: L('se_min_conf'), maxTurns: L('se_max_turns'),
            followupHours: L('se_followup_hours'), ghostHours: L('se_ghost_hours'),
            adCurrency: L('se_ad_currency'), fxRate: L('se_fx_rate'),
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
            edit: L('se_kb_edit'), save: L('se_kb_save'), cancel: L('se_kb_cancel'),
          }}
        />
      </section>

      <section className="space-y-3 lg:col-span-2">
        <h1 className="text-xl font-semibold">{t('us_title')}</h1>
        <p className="text-sm text-muted">{t('us_sub')}</p>
        <UserManager
          users={(users ?? []) as never}
          meId={session?.uid ?? ''}
          labels={{
            email: L('us_email'), name: L('us_name'), role: L('us_role'),
            agent: L('us_role_agent'), manager: L('us_role_manager'),
            agentHint: L('us_role_agent_hint'), managerHint: L('us_role_manager_hint'),
            password: L('us_password'), passwordHint: L('us_password_hint'),
            add: L('us_add'), active: L('us_active'), disabled: L('us_disabled'),
            disable: L('us_disable'), enable: L('us_enable'), resetPw: L('us_reset_pw'),
            lastLogin: L('us_last_login'), never: L('us_never'),
            emailTaken: L('us_email_taken'), pwShort: L('us_pw_short'),
            saved: L('us_saved'), selfNote: L('us_self_note'),
          }}
        />
      </section>
    </div>
  );
}
