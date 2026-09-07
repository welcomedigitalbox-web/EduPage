import { ctx } from '@/lib/server-ctx';
import { AskPanel } from '@/components/AskPanel';

export const dynamic = 'force-dynamic';

export default async function Ask() {
  const { t } = await ctx();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('ask_title')}</h1>
        <p className="text-sm text-muted">{t('ask_sub')}</p>
      </div>
      <AskPanel
        suggestions={[t('ask_s1'), t('ask_s2'), t('ask_s3'), t('ask_s4')]}
        labels={{
          placeholder: t('ask_ph'), send: t('ask_send'), thinking: t('ask_thinking'),
          failed: t('ask_failed'), hint: t('ask_hint'),
        }}
      />
    </div>
  );
}
