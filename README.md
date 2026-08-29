# Messenger AI CRM — POS ချိတ်ဆက်ထားသော Messenger AI

သီးခြား Next.js app တစ်ခု။ **POS ရဲ့ Supabase project တစ်ခုတည်းကို** သုံးပါတယ်။
ပစ္စည်း၊ ဈေးနှုန်း၊ stock၊ customer၊ အရောင်း — ဘာမှ ထပ်မမှတ်ပါ။ POS ထဲကအတိုင်း တိုက်ရိုက်ယူပါတယ်။

---

## ၁။ POS နဲ့ ဘယ်လို ချိတ်ထားလဲ

| Bot/dashboard က လိုတာ | POS ရဲ့ ဘယ် table ကနေ ယူလဲ |
|---|---|
| ပစ္စည်းနာမည်၊ ဈေးနှုန်း | `products` + `product_variants` (variant ရှိရင် `price_override`) |
| Stock ရှိ/မရှိ | `store_inventory` (settings မှာရွေးထားတဲ့ store) |
| ဒီ store မှာ မရောင်းတဲ့ပစ္စည်း | `store_product_settings.is_available = false` → KB ထဲ မထည့် |
| ဖောက်သည်မှတ်တမ်း | `customers` (ဖုန်းနံပါတ်နဲ့ ရှာပြီး ချိတ်၊ မရှိရင် အသစ်ဖွင့်) |
| အရောင်း / ဝင်ငွေ | `sales` + `sale_items` (`channel='messenger'`, `order_status='pending'`) |
| Ads campaign | `ad_campaigns` + `ad_daily_stats` (sync က အလိုအလျောက် ဖြည့်ပေး) |

အသစ်ထည့်တာက `msgr_` နဲ့စတဲ့ table တွေပဲ — POS table တစ်ခုမှ မထိပါ:
`msgr_contacts`, `msgr_conversations`, `msgr_messages`, `msgr_lead_events`,
`msgr_follow_ups`, `msgr_sale_links`, `msgr_kb_items`, `msgr_settings`,
`msgr_ai_runs`, `msgr_ad_daily`。

### အရေးကြီးတဲ့ design ဆုံးဖြတ်ချက် ၂ ခု

**Bot က stock မလျော့စေပါ။** Messenger order က POS `sales` ထဲကို
`order_status='pending'` နဲ့ဝင်သွားပြီး၊ POS ရဲ့ **Sale Order** စာမျက်နှာမှာ
ဝန်ထမ်းက အတည်ပြုမှသာ stock လျော့ပါတယ်။ (POS ရဲ့ `checkout_sale` RPC က
`auth.uid()` လိုတာမို့ webhook ကနေ ခေါ်လို့မရပါ — ဒါ့အပြင် မသေချာသေးတဲ့
chat order တွေအတွက် stock ကြိုပိတ်ထားရင် ဆိုင်ခန်းက ရောင်းစရာ ကုန်သွားပါလိမ့်မယ်။)

**Bot က order ကိုယ်တိုင် မဖွင့်ပါ။** AI က ဖောက်သည်ပြောတဲ့ ပစ္စည်း/အရေအတွက်ကို
POS id အတိအကျနဲ့ *draft* လုပ်ပေးရုံပါ။ Dashboard ထဲမှာ လူက ကြည့်၊ ပြင်၊
"POS ထဲ သိမ်းမယ်" နှိပ်မှသာ တကယ့် sale ဖြစ်ပါတယ်။

---

## ၂။ Facebook Page API — ဘာယူပြီး ဘယ်မှာထည့်ရမလဲ

Token တွေအားလုံး **env var အဖြစ်ပဲ** ထားပါတယ်။ Database ထဲ မထားပါ —
POS ရဲ့ RLS က `authenticated` အားလုံးကို read ခွင့်ပေးထားတာမို့
DB ထဲထားရင် login ဝင်ထားတဲ့ cashier တိုင်း Page token ဖတ်လို့ရသွားပါလိမ့်မယ်။

> ⚠️ သတိပြုရန် — POS ရဲ့ `ad_accounts.access_token` column မှာလည်း
> ဒီပြဿနာရှိနေပါတယ်။ token တကယ်ထည့်တော့မယ်ဆိုရင် အဲ့ column ကို
> service-role only RLS ပြောင်းသင့်ပါတယ်။

### ယူရမယ့် ၅ ခု

| Env var | ဘယ်ကယူလဲ |
|---|---|
| `FB_PAGE_ID` | Page → About → Page ID (ဂဏန်းချည်း) |
| `FB_PAGE_ACCESS_TOKEN` | အောက်က အဆင့် ၃ ကြည့်ပါ |
| `FB_APP_SECRET` | App → Settings → Basic → App Secret |
| `FB_VERIFY_TOKEN` | ကိုယ်တိုင် ကြိုက်တာရိုက်ထည့် (ဥပမာ `mm-shop-2026-xyz`) |
| `META_AD_ACCOUNT_ID` | Ads Manager URL ထဲက `act_1234567890` |

### အဆင့် ၁ — App ဆောက်

[developers.facebook.com](https://developers.facebook.com) → My Apps → Create App
→ **Business** type ရွေး → App name ထည့်။

### အဆင့် ၂ — Product ၂ ခု ထည့်

- **Messenger** — စာလက်ခံ/ပြန်ပို့ဖို့
- **Marketing API** — ads spend ဆွဲဖို့

### အဆင့် ၃ — Page Access Token (အရေးအကြီးဆုံး)

နည်း ၂ မျိုးရှိပါတယ်။ **နည်းလမ်း B ကို အကြံပြုပါတယ်။**

**A) မြန်တဲ့နည်း (စမ်းသပ်ဖို့ပဲ)**
Messenger → Settings → Access Tokens → Page ရွေး → Generate Token။
ဒီ token က ရက်အနည်းငယ်နဲ့ expire ဖြစ်တတ်ပြီး၊ token ထုတ်ပေးတဲ့သူ
Page admin ကနေ ထွက်သွားရင် ချက်ချင်း သေသွားပါတယ်။

**B) System User token (ထုတ်လုပ်မှုအတွက်)**
[business.facebook.com/settings](https://business.facebook.com/settings) →
Users → **System Users** → Add → role: Admin →
**Add Assets** မှာ Page နဲ့ Ad Account နှစ်ခုလုံး ပေး →
**Generate New Token** → App ရွေး → permission တွေ ticks →
Token Expiration = **Never**。

ဒီ token က မကုန်ဘူး၊ လူတစ်ယောက်ချင်းနဲ့ မဆိုင်ဘူး၊ ads နဲ့ messenger
နှစ်ခုလုံးအတွက် တစ်ခုတည်း သုံးလို့ရပါတယ် (`META_ADS_ACCESS_TOKEN` မထည့်ရင်
`FB_PAGE_ACCESS_TOKEN` ကိုပဲ ads အတွက် သုံးပါတယ်)。

### အဆင့် ၄ — Permission တွေ

| Permission | ဘာအတွက် |
|---|---|
| `pages_messaging` | ဖောက်သည်ဆီ စာပြန်ပို့ဖို့ |
| `pages_manage_metadata` | webhook subscribe လုပ်ဖို့ |
| `pages_read_engagement` | Page အချက်အလက်ဖတ်ဖို့ |
| `ads_read` | ads spend ဆွဲဖို့ |
| `business_management` | System User token သုံးရင် |

Development mode မှာ ကိုယ့် Page ကို စမ်းလို့ရပါတယ်။ **တခြားလူတွေရဲ့ စာတွေပါ
လက်ခံဖို့ App Review တင်ရပါမယ်** (`pages_messaging` က review လိုတဲ့ permission)。
Review မှာ bot ဘာလုပ်လဲ ဗီဒီယိုနဲ့ ပြရပါတယ် — ပုံမှန် ၃-၇ ရက် ကြာပါတယ်။

### အဆင့် ၅ — Webhook ချိတ်

App → Messenger → Settings → Webhooks → Add Callback URL:

```
Callback URL : https://<သင့်app>.vercel.app/api/webhook/messenger
Verify Token : .env ထဲက FB_VERIFY_TOKEN အတိအကျ
```

Subscribe လုပ်ရမယ့် fields:
`messages`, `messaging_postbacks`, `message_echoes`, `messaging_referrals`, `message_reads`

> `message_echoes` မယူရင် — ဝန်ထမ်းက Meta Business Suite inbox ကနေ
> ပြန်ဖြေတာကို ဒီစနစ်က မသိလို့ bot က ထပ်ဖြေပြီး ဖောက်သည်နဲ့ စကားထပ်ပါလိမ့်မယ်။
> **မဖြစ်မနေ ယူပါ။**

ပြီးရင် အောက်နားက Page စာရင်းမှာ **Subscribe** နှိပ်ဖို့ မမေ့ပါနဲ့။
(webhook URL ချိတ်ရုံနဲ့ မလုံလောက်ပါ — Page ကို subscribe လုပ်မှ စာဝင်ပါတယ်။)

### အဆင့် ၆ — Ad attribution

Ad တွေကို **Click to Messenger** objective နဲ့ run ပါ။ Meta က webhook ထဲကို
`referral.ad_id` ထည့်ပေးလို့ ဘယ် ad ကလာလဲ အလိုအလျောက် မှတ်ပါတယ်။
Organic post အတွက် `m.me/yourpage?ref=fb_post_sept` လို link သုံးပါ။

---

## ၃။ Setup

```bash
npm install
cp .env.example .env.local     # POS ရဲ့ Supabase URL/service key + FB tokens
npm run dev
```

၁. **POS ရဲ့ Supabase project** ရဲ့ SQL editor မှာ `supabase/001_messenger.sql` run
၂. `/settings` သွား → **Bot က ဘယ် POS store ရဲ့ ဈေး/stock ကို ပြောမလဲ** ရွေး
   (မရွေးရင် bot က ပစ္စည်းအကြောင်း ဘာမှ မပြောနိုင်ဘဲ လူ့ဆီပဲ လွှဲပါလိမ့်မယ်)
၃. ပို့ခ / ငွေပေးချေမှု / ပြန်လဲစည်းကမ်း ကို စည်းကမ်း KB မှာ ထည့်
၄. Ads data ပထမတစ်ခါ ဆွဲ:
```bash
curl "https://<app>.vercel.app/api/cron/sync-ads?days=30" -H "Authorization: Bearer $CRON_SECRET"
```

Vercel မှာ cron ၂ ခု `vercel.json` ထဲ ပါပြီးသား — ads sync (၁ နာရီ) နဲ့
follow-up sweep (၁၅ မိနစ်)。

---

## ၄။ Bot က ဘယ်အချိန် လူ့ဆီလွှဲလဲ

Model မမေးခင် (စျေးသက်သာပြီး ယုံရတယ်):
1. Settings မှာ bot ပိတ်ထားရင်
2. Bot က `max_bot_turns` (default 6) ကျော် ဖြေပြီးရင်
3. စာမပါဘဲ ပုံပဲပို့ရင် (ငွေလွှဲ slip ဖြစ်နိုင်)
4. Handoff keyword ပါရင်

Model ဖြေပြီးမှ:
5. `needs_human = true` (complaint, refund, KB မှာမပါတာ, order အတည်ပြုရန်)
6. `confidence < min_confidence` (default 0.60)

လူတစ်ယောက် dashboard က ဒါမှမဟုတ် Meta inbox က ပြန်ဖြေလိုက်တာနဲ့
thread က `human_handling` ဖြစ်ပြီး **bot ထပ်မဝင်တော့ပါ**。

---

## ၅။ ကန့်သတ်ချက်

**24-hour messaging window** — ဖောက်သည်ရဲ့ နောက်ဆုံးစာက ၂၄ နာရီကျော်ရင်
Meta က စာပြန်ပို့ခွင့် မပေးတော့ပါ။ ဒါကြောင့် `follow_up_hours` ကို ၄ ထားထားပါတယ်။
အချိန်လွန်သွားတဲ့သူကို ဖုန်းခေါ်ရပါလိမ့်မယ်။

**Meta ရေတွက်တာနဲ့ ကိုယ့်ရေတွက်တာ ကွာပါလိမ့်မယ်** — Ads စာမျက်နှာမှာ
"Meta chat" နဲ့ "Lead" နှစ်ခုလုံး ပြထားတာ ဒါကြောင့်ပါ။ Meta က 7-day
attribution window သုံးပြီး ကိုယ့်စနစ်က webhook ရောက်ချိန်ကို မှတ်လို့ပါ။

**Order မမှတ်ရင် ROAS မထွက်ပါ** — dashboard က "POS ထဲ သိမ်းမယ်" မနှိပ်ဘဲ
Messenger မှာပဲ ပြောပြီး POS မှာ လက်နဲ့ရိုက်ထည့်လိုက်ရင် အဲ့ sale က
ဘယ် ad ကလာမှန်း ဘယ်တော့မှ မသိတော့ပါ။

**AI ကုန်ကျစရိတ်** — စာတစ်စောင် ~2000-4000 tokens (product list ပါလို့
နည်းနည်းများပါတယ်)。တစ်နေ့ ၅၀၀ စာဆိုရင် တစ်လ ~$25-45 ခန့်။
ပစ္စည်းများရင် `max_kb_products` လျှော့ပါ။ Token အကုန်လုံး
`msgr_ai_runs` မှာ မှတ်ထားပါတယ်။

---

## Project structure

```
supabase/001_messenger.sql    msgr_* tables + views (POS project ထဲမှာ run)
src/lib/pos.ts                POS bridge — products, stock, customers, sales
src/lib/ai.ts                 Claude tool-call → reply + stage + draft order
src/lib/crm.ts                stage machine, handoff, follow-ups, KB builder
src/lib/meta.ts               Send API, signature verify, Marketing API
src/app/api/webhook/messenger webhook (verify + events + echoes)
src/app/api/orders            draft basket → POS pending sale
src/app/api/cron/sync-ads     Marketing API → msgr_ad_daily + POS ad tables
src/app/api/cron/follow-ups   silence sweeper
```

---

## ၆။ Cron — Vercel Hobby plan သတိပြုရန်

Vercel Hobby plan မှာ cron က **တစ်နေ့ တစ်ကြိမ်ပဲ** run လို့ရပါတယ်။ ဒီထက်ပိုတဲ့
expression (`0 * * * *` စသည်) ထည့်ရင် **deploy ကိုယ်တိုင် fail** ဖြစ်ပါတယ်။

ဒါကြောင့် `vercel.json` ကို တစ်နေ့တစ်ကြိမ် (Hobby မှာ deploy ဖြစ်အောင်) ထားပြီး၊
တကယ့် schedule ကို **GitHub Actions** (`.github/workflows/cron.yml`) နဲ့ မောင်းပါတယ် —
အခမဲ့၊ plan နဲ့ မဆိုင်ဘူး၊ ၁၅ မိနစ်တစ်ခါ ရပါတယ်။

Follow-up sweep ကို တစ်နေ့တစ်ကြိမ်ပဲ မောင်းလို့ မရပါ — အဲ့ဒီအချိန်ဆို Messenger ရဲ့
၂၄ နာရီ window ပိတ်သွားပြီး ဖောက်သည်ဆီ စာပြန်ပို့လို့ မရတော့လို့ပါ။

GitHub repo → Settings → Secrets and variables → Actions မှာ ထည့်ရမယ့် secret ၂ ခု:

| Secret | တန်ဖိုး |
|---|---|
| `APP_URL` | `https://<app>.vercel.app` (နောက်မှာ `/` မပါစေနဲ့) |
| `CRON_SECRET` | Vercel env ထဲက `CRON_SECRET` နဲ့ အတိအကျတူရမယ် |

Pro plan သုံးရင် `vercel.json` ကို `0 * * * *` နဲ့ `*/15 * * * *` ပြန်ပြောင်းပြီး
GitHub Actions file ကို ဖျက်လိုက်လို့ ရပါတယ်။
