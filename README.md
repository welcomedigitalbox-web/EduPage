# Messenger AI CRM

Facebook Page Messenger အတွက် AI ဖြေပေးတဲ့ bot + lead tracking + ads ROI dashboard။
Next.js 15 (App Router) + Supabase (Postgres) + Anthropic + Meta Graph API။

---

## ဒီစနစ်က ဖြေပေးတဲ့ မေးခွန်းတွေ

| မေးခွန်း | ဘယ်မှာကြည့် | ဘယ်လိုတွက်လဲ |
|---|---|---|
| ဘယ်နှယောက် လာဆက်သွယ်လဲ | ခြုံငုံ → "လာဆက်သွယ်သူ" | `contacts` အသစ် အရေအတွက် |
| ဘယ်နှယောက် conversation မဖြစ်သွားဘူးလဲ | ခြုံငုံ → "စကားမဖြစ်သွားသူ" + Inbox → "ဘယ်သူမှ မပြန်ရသေး" | `inbound_count <= 1` |
| ဘယ်နှယောက် sale ဖြစ်သွားလဲ | ခြုံငုံ → "ရောင်းရသူ" | `orders` (confirmed/delivered) |
| Follow up လုပ်ဖို့ လိုသေးလား | Follow-up စာမျက်နှာ | cron က ၁၅ မိနစ်တစ်ခါ scan လုပ်ပြီး task ထုတ်ပေး |
| Ads budget ဘယ်လောက်ကုန်ပြီး sale ဖြစ်လား | Ads စာမျက်နှာ | Marketing API spend ÷ ကိုယ့် leads/orders → CPL, CPA, ROAS |
| Bot က ဘယ်သူကို ပြန်ထားလဲ | Inbox → "Bot ပြန်ဖြေထား" | `conversations.last_reply_by = 'bot'` |
| လူက ဘယ်သူတွေ လိုက်စစ်ရမလဲ | Inbox → "လူ လိုက်စစ်ရမယ်" | `status = 'needs_human'` |

---

## Bot က ဘယ်အချိန် လူ့ဆီ လွှဲလဲ (handoff rules)

Model မမေးခင်ကတည်းက စစ်တာ (`preflightHandoff`):
1. Bot ကို settings မှာ ပိတ်ထားရင်
2. Bot က `max_bot_turns` (default 6) ကျော် ဖြေပြီးသွားရင်
3. ဖောက်သည်က စာမပါဘဲ ပုံပဲပို့ရင် (ငွေလွှဲ slip ဖြစ်နိုင်)
4. Handoff keyword ပါရင် ("ပြန်အမ်း", "တိုင်", "manager" …)

Model ဖြေပြီးမှ စစ်တာ:
5. `needs_human = true` လို့ model ကိုယ်တိုင် ဆုံးဖြတ်ရင် (complaint, refund, order confirm, KB မှာမပါတဲ့မေးခွန်း)
6. `confidence < min_confidence` (default 0.60) ဖြစ်ရင်

လူတစ်ယောက် dashboard ကနေ ဒါမှမဟုတ် Meta inbox ကနေ ပြန်ဖြေလိုက်တာနဲ့ thread က
`human_handling` ဖြစ်သွားပြီး **bot ထပ်မဝင်ဖြေတော့ပါ**။

---

## Setup — အဆင့်ဆင့်

### ၁။ Supabase
1. project အသစ်ဆောက် → SQL editor
2. `supabase/001_schema.sql` ကို paste ပြီး run
3. (optional) `supabase/002_seed.sql` — နမူနာ knowledge base
4. Settings → API ကနေ URL, anon key, **service_role key** ကူးယူ

### ၂။ Meta App
1. [developers.facebook.com](https://developers.facebook.com) → Create App → **Business**
2. Products ထဲမှာ **Messenger** နဲ့ **Marketing API** ထည့်
3. Messenger → Page ချိတ် → **Page Access Token** ယူ
   (ရေရှည်သုံးဖို့ Business Settings → System Users ကနေ token ထုတ်တာ ပိုကောင်း — expire မဖြစ်ဘူး)
4. လိုအပ်တဲ့ permissions:
   - `pages_messaging` — စာပြန်ပို့ဖို့
   - `pages_manage_metadata` — webhook subscribe ဖို့
   - `pages_read_engagement`
   - `ads_read` — ads spend ဆွဲဖို့
5. App Settings → Basic ကနေ **App Secret** ကူးယူ

### ၃။ Deploy
```bash
npm install
cp .env.example .env.local   # ကိုယ့် key တွေ ဖြည့်
npm run dev
```
Vercel မှာ တင်မယ်ဆိုရင် — GitHub push → Vercel import → env vars အားလုံး ထည့် → deploy။
`vercel.json` ထဲမှာ cron ၂ ခု ပါပြီးသား (ads sync ၁ နာရီတစ်ခါ၊ follow-up sweep ၁၅ မိနစ်တစ်ခါ)။

### ၄။ Webhook ချိတ်
Meta App → Messenger → Settings → Webhooks → Add Callback URL:

- **Callback URL**: `https://your-app.vercel.app/api/webhook/messenger`
- **Verify Token**: `.env` ထဲက `FB_VERIFY_TOKEN` အတိအကျ
- **Subscribe to fields**: `messages`, `messaging_postbacks`, `message_echoes`, `messaging_referrals`, `message_reads`

`message_echoes` မယူရင် — staff က Meta inbox ကနေ ပြန်ဖြေတာကို စနစ်က မသိလို့ bot က
ထပ်ဖြေပြီး ဖောက်သည်နဲ့ စကားထပ်နေပါလိမ့်မယ်။ မဖြစ်မနေ ယူပါ။

### ၅။ Ads attribution
Ad တွေကို **Click to Messenger** objective နဲ့ run ပါ။ Meta က webhook ထဲကို
`referral.ad_id` ထည့်ပေးလို့ ဘယ် ad ကလာလဲ အလိုအလျောက် မှတ်သွားပါတယ်။
Organic post ကနေလာတဲ့သူတွေအတွက်က m.me link မှာ `?ref=` ထည့်လို့ရပါတယ်
(ဥပမာ `m.me/yourpage?ref=fb_post_sept`)。

Ads data ပထမဆုံးတစ်ခါ ဆွဲဖို့:
```bash
curl "https://your-app.vercel.app/api/cron/sync-ads?days=30" \
  -H "Authorization: Bearer $CRON_SECRET"
```

### ၆။ Knowledge base ဖြည့်
`/settings` မှာ ပစ္စည်း၊ ဈေးနှုန်း၊ delivery, payment စည်းကမ်းတွေ ထည့်ပါ။
**KB ဗလာဖြစ်နေရင် bot က ဘာမှ မဖြေဘဲ လူ့ဆီပဲ လွှဲပါလိမ့်မယ်** — ဒါက ရည်ရွယ်ချက်ရှိပါတယ်၊
မမှန်တဲ့ဈေးနှုန်း ပြောလိုက်တာက မဖြေတာထက် ပိုဆိုးလို့ပါ။

---

## သိထားသင့်တဲ့ ကန့်သတ်ချက်တွေ

**24-hour messaging window** — ဖောက်သည်က နောက်ဆုံးစာပို့ပြီး ၂၄ နာရီကျော်သွားရင်
Meta က စာပြန်ပို့ခွင့် မပေးတော့ပါ။ Follow-up စာရင်းထဲက အချိန်ကျော်နေတဲ့သူတွေကို
messenger ကနေ ဆက်လို့မရတော့ဘူး — ဖုန်းခေါ်ရပါလိမ့်မယ်။ ဒါကြောင့် `follow_up_hours`
ကို ၄ နာရီလောက်ပဲ ထားတာ ပိုကောင်းပါတယ်။

**Attribution က ၁၀၀% မတိကျပါ** — Meta ရဲ့ "messaging conversations started" နဲ့
ကိုယ့်စနစ်က lead အရေအတွက် အမြဲကွာပါတယ်။ Meta က 7-day attribution window သုံးပြီး
ကိုယ့်စနစ်က webhook ရောက်တဲ့အချိန်ကို မှတ်လို့ပါ။ Trend ကြည့်ဖို့ကတော့ လုံလောက်ပါတယ်၊
တစ်ကျပ်တည်း တိကျအောင် မမျှော်လင့်ပါနဲ့。

**Order က လက်နဲ့ မှတ်ရပါတယ်** — bot က order ရိုက်မထည့်ပါ (မှားရင် အန္တရာယ်ကြီးလို့)။
Thread ထဲက "အရောင်းမှတ်မယ်" ခလုတ်နဲ့ လူကိုယ်တိုင် သိမ်းရပါတယ်။ ဒါကို မလုပ်ရင်
ROAS, CPA တွေ အလုပ်မလုပ်ပါ။

**AI cost** — စာတစ်စောင်ကို ~1500-3000 tokens။ တစ်နေ့ ၅၀၀ စာဆိုရင် Sonnet နဲ့
တစ်လ ~$15-30 လောက် ကျပါတယ်။ `ai_runs` table မှာ token အကုန်လုံး မှတ်ထားပါတယ်။

---

## Project structure

```
supabase/001_schema.sql       tables, views, RLS
src/lib/env.ts                env vars
src/lib/supabase.ts           service-role client (server only)
src/lib/meta.ts               Send API, signature verify, Marketing API
src/lib/ai.ts                 Claude tool-call → reply + stage + confidence
src/lib/crm.ts                contact/convo upsert, stage machine, handoff, follow-ups
src/lib/queries.ts            dashboard reads
src/app/api/webhook/messenger webhook GET verify + POST events (incl. echoes)
src/app/api/cron/sync-ads     Marketing API → ad_insights
src/app/api/cron/follow-ups   silence sweeper → follow_ups + ghosted
src/app/                      dashboard pages
src/middleware.ts             password gate (webhook/cron excluded)
```

## Environment variables

`.env.example` ကြည့်ပါ။ မဖြစ်မနေလိုတာ: `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `FB_PAGE_ACCESS_TOKEN`, `FB_PAGE_ID`,
`FB_VERIFY_TOKEN`, `FB_APP_SECRET`, `ANTHROPIC_API_KEY`。
