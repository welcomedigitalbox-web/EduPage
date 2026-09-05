-- =====================================================================
-- Edu Baby House — delivery / payment / return policy for the bot.
-- Replaces the placeholder rows seeded by 001_messenger.sql.
-- Safe to re-run: it deletes its own rows first.
-- =====================================================================

delete from msgr_kb_items
where title in (
  'Delivery', 'Payment', 'Return',
  'ပို့ခ (Delivery fee)', 'ပို့ဆောင်ချိန် (Delivery time)',
  'ငွေပေးချေမှု (Payment)', 'ပြန်လဲ/ပြန်အမ်း (Return)'
);

insert into msgr_kb_items (kind, title, body) values

('policy', 'ပို့ခ (Delivery fee)',
 'ရန်ကုန်၊ မန္တလေး၊ နေပြည်တော် — ပို့ခ ၄၀၀၀ မှ ၅၀၀၀ ကျပ်။ မြို့နယ်ပေါ်မူတည်ပြီး ကွာပါတယ်။
အခြားမြို့နယ်များအတွက် ပို့ခကို staff က အတည်ပြုပေးပါမယ်။'),

('policy', 'ပို့ဆောင်ချိန် (Delivery time)',
 'မန္တလေး — နေ့လယ် ၃ နာရီ မတိုင်ခင် order ဆိုရင် နေ့ချင်းပြီး အပ်ပေးနိုင်ပါတယ်။ ၃ နာရီကျော်ရင် နောက်ရက် အပ်ပါတယ်။
ရန်ကုန် — confirm ပြီး နောက်ရက် ပို့ပေးပါတယ်။
အခြားမြို့များ — ၂ ရက်မှ ၅ ရက်ခန့် ကြာနိုင်ပါတယ်။'),

('policy', 'ငွေပေးချေမှု (Payment)',
 'COD (ပစ္စည်းရောက်မှ ငွေချေ) က ရန်ကုန်၊ မန္တလေး၊ နေပြည်တော် သုံးမြို့သာ ရပါတယ်။

အခြားမြို့များအတွက် COD မရပါ — စရံ ကြိုလွှဲပြီးမှ ပို့ဆောင်ပေးပါတယ် —
• ၅ သိန်း (၅၀၀,၀၀၀ ကျပ်) အောက် order — စရံ ၅၀,၀၀၀ ကျပ်
• ၁၀ သိန်း (၁,၀၀၀,၀၀၀ ကျပ်) အထိ order — စရံ ၁၀၀,၀၀၀ ကျပ်

ငွေလွှဲအကောင့်ကို staff က ပေးပါမယ်။'),

('policy', 'ပြန်လဲ/ပြန်အမ်း (Return)',
 'ပစ္စည်းရောက်ပြီး ၇ ရက်အတွင်း ပြန်လဲပေးပါတယ်။
အသေးစိတ်ကို staff က ကူညီပေးပါမယ်။')

on conflict do nothing;

select kind, title from msgr_kb_items where is_active order by title;
