import { getSettings } from '@/lib/crm';
import { admin } from '@/lib/supabase';
import { SettingsForm, KbEditor } from '@/components/SettingsForm';

export const dynamic = 'force-dynamic';

export default async function Settings() {
  const [settings, kbRes, storeRes] = await Promise.all([
    getSettings(),
    admin().from('msgr_kb_items').select('id,kind,title,body').eq('is_active', true).order('kind').limit(200),
    admin().from('stores').select('id,name').eq('is_active', true).order('name'),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Bot သတ်မှတ်ချက်</h1>
        <SettingsForm initial={settings} stores={storeRes.data ?? []} />
      </section>
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">စည်းကမ်း / FAQ</h1>
        <p className="text-sm text-muted">
          ပစ္စည်းနာမည်၊ ဈေးနှုန်းနဲ့ stock က POS ကနေ တိုက်ရိုက်ရပါတယ် — ဒီမှာ ထပ်မထည့်ရပါ။
          ဒီစာရင်းက ပို့ခ၊ ငွေပေးချေမှု၊ ပြန်လဲစည်းကမ်း စတဲ့ ပစ္စည်းတစ်ခုချင်းနဲ့ မဆိုင်တာတွေအတွက်ပါ။
        </p>
        <KbEditor items={kbRes.data ?? []} />
      </section>
    </div>
  );
}
