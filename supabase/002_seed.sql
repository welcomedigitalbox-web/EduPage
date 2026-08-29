-- Optional seed: sample knowledge base rows so the bot has something to answer with.
insert into kb_items (kind, title, body, keywords, price, currency, in_stock) values
('product','Vitamin C Serum 30ml','ဗီတာမင်စီ serum 30ml။ မျက်နှာအရေပြားလင်းလက်စေပြီး အမာရွတ်ဖျော့စေပါတယ်။ တစ်နေ့ ညတိုင်း သုံးပါ။', array['serum','vitamin c','ဗီတာမင်','အသား'], 28000, 'MMK', true),
('policy','Delivery','ရန်ကုန်မြို့တွင်း ၁ ရက်၊ နယ်မြို့များ ၂-၃ ရက်။ ရန်ကုန် delivery ၂၀၀၀ ကျပ်၊ နယ် ၄၀၀၀ ကျပ်။ ၅၀၀၀၀ အထက် အခမဲ့ပို့ပေးပါတယ်။', array['delivery','ပို့','ပို့ခ','ဘယ်တော့ရ'], null, null, true),
('policy','Payment','KBZPay, WavePay, CB Pay နဲ့ COD (ရန်ကုန်သာ) လက်ခံပါတယ်။', array['payment','ငွေ','kpay','wave','cod'], null, null, true),
('faq','Return policy','ပစ္စည်းပျက်စီးမှုရှိပါက ၇ ရက်အတွင်း ပြန်လဲပေးပါတယ်။ သုံးပြီးသားပစ္စည်း ပြန်မလဲပေးပါ။', array['return','ပြန်လဲ','ပြန်အမ်း'], null, null, true)
on conflict do nothing;
