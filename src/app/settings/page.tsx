import { getSettings } from '@/lib/crm';
import { admin } from '@/lib/supabase';
import { SettingsForm, KbEditor } from '@/components/SettingsForm';

export const dynamic = 'force-dynamic';

export default async function Settings() {
  const settings = await getSettings();
  const { data: kb } = await admin()
    .from('kb_items').select('id,kind,title,body,price,in_stock')
    .eq('is_active', true).order('kind').limit(200);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Bot သတ်မှတ်ချက်</h1>
        <SettingsForm initial={settings} />
      </section>
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Knowledge base</h1>
        <p className="text-sm text-muted">
          Bot က ဒီထဲက အချက်အလက်တွေကိုပဲ သုံးပြီး ဖြေပါတယ်။ ဒီထဲမပါတာမေးရင် လူ့ဆီ အလိုအလျောက် လွှဲပါတယ်။
        </p>
        <KbEditor items={kb ?? []} />
      </section>
    </div>
  );
}
