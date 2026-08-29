function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
function opt(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  supabaseUrl: () => req('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseServiceKey: () => req('SUPABASE_SERVICE_ROLE_KEY'),

  fbPageToken: () => req('FB_PAGE_ACCESS_TOKEN'),
  fbPageId: () => req('FB_PAGE_ID'),
  fbVerifyToken: () => req('FB_VERIFY_TOKEN'),
  fbAppSecret: () => opt('FB_APP_SECRET'),
  fbApiVersion: () => opt('FB_API_VERSION', 'v21.0'),

  metaAdAccountId: () => opt('META_AD_ACCOUNT_ID'),
  metaAdsToken: () => opt('META_ADS_ACCESS_TOKEN') || opt('FB_PAGE_ACCESS_TOKEN'),

  anthropicKey: () => req('ANTHROPIC_API_KEY'),
  aiModel: () => opt('AI_MODEL', 'claude-sonnet-4-5'),

  cronSecret: () => opt('CRON_SECRET'),
  dashboardPassword: () => opt('DASHBOARD_PASSWORD'),
};
