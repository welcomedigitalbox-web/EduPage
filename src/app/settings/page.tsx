import { getSettings, getKb } from '@/lib/crm';
import { admin } from '@/lib/supabase';
import { SettingsForm, KbEditor } from '@/components/SettingsForm';
import { ctx } from '@/lib/server-ctx';
import { KbPreview } from '@/components/KbPreview';
import { UserManager } from '@/components/Users';
import { FxRates } from '@/components/FxRates';
import { PaymentChannels } from '@/components/PaymentChannels';
import { ReceiptSettings } from '@/components/ReceiptSettings';
import { PageConnect } from '@/components/PageConnect';
import { paymentChannels } from '@/lib/orders';

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
  const { data: fx } = await admin()
    .from('msgr_fx_rates').select('date,mmk_per_usd,note').order('date', { ascending: false }).limit(90);
  const channels = await paymentChannels({ all: true });
  const { data: users } = await admin()
    .from('msgr_users').select('id,email,name,role,is_active,last_login_at').order('created_at');

  const L = (k: string) => t(k);
  const products = kb.filter((k) => k.kind === 'product');
  const policies = kb.filter((k) => k.kind !== 'product');

  const pageRow = settings as unknown as {
    page_id?: string | null; page_name?: string | null;
    page_connected_at?: string | null; page_connected_by?: string | null;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3 lg:col-span-2">
        <PageConnect
          appId={process.env.NEXT_PUBLIC_FB_APP_ID ?? null}
          current={{
            id: pageRow.page_id ?? null,
            name: pageRow.page_name ?? null,
            at: pageRow.page_connected_at ?? null,
            by: pageRow.page_connected_by ?? null,
          }}
          labels={{
            title: t('pg_title'), sub: t('pg_sub'),
            connected: t('pg_connected'), notConnected: t('pg_not_connected'),
            connect: t('pg_connect'), reconnect: t('pg_reconnect'),
            disconnect: t('pg_disconnect'), pick: t('pg_pick'),
            loading: t('pg_loading'), noPages: t('pg_no_pages'),
            cannotMessage: t('pg_cannot_message'), connectedBy: t('pg_connected_by'),
            failed: t('pg_failed'), sdkMissing: t('pg_sdk_missing'),
          }}
        />
      </section>

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
            adCurrency: L('se_ad_currency'),
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
        <FxRates
          rows={(fx ?? []) as never}
          labels={{
            title: t('fx_title'), sub: t('fx_sub'), date: t('fx_date'), rate: t('fx_rate'),
            add: t('fx_add'), del: t('fx_del'), empty: t('fx_empty'), effective: t('fx_effective'),
          }}
        />
      </section>

      <section className="space-y-3 lg:col-span-2">
        <ReceiptSettings
          initial={settings}
          labels={{
            title: t('se_receipt'), sub: t('se_receipt_sub'),
            name: t('se_receipt_name'), phone: t('se_receipt_phone'),
            note: t('se_receipt_note'), footer: t('se_receipt_footer'),
            footerPh: t('se_receipt_footer_ph'),
            save: t('se_save'), saved: t('se_saved'),
          }}
        />
      </section>

      <section className="space-y-3 lg:col-span-2">
        <PaymentChannels
          rows={channels as never}
          labels={{
            title: t('pc_title'), sub: t('pc_sub'), name: t('pc_name'), namePh: t('pc_name_ph'),
            kind: t('pc_kind'), wallet: t('pc_wallet'), bank: t('pc_bank'), cash: t('pc_cash'),
            accountName: t('pc_account_name'), accountNamePh: t('pc_account_name_ph'),
            accountNo: t('pc_account_no'), accountNoPh: t('pc_account_no_ph'),
            add: t('pc_add'), save: t('pc_save'), cancel: t('pc_cancel'), edit: t('pc_edit'),
            del: t('pc_del'), enable: t('pc_enable'), disable: t('pc_disable'),
            disabled: t('pc_disabled'), empty: t('pc_empty'), inUse: t('pc_in_use'),
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
