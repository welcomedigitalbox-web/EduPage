-- Tell customers how to actually place the order.
-- Staff can edit this text later in the dashboard (Settings -> Knowledge base).
insert into msgr_kb_items (kind, title, body, is_active)
values (
  'policy',
  'အော်ဒါ တင်နည်း',
  'ဖောက်သည်က ဝယ်ဖို့ စိတ်ဝင်စားတာ သေချာပြီဆိုရင် — ဈေးနှုန်း/ပို့ခ ပြောပြီးတိုင်း — "မှာယူဖို့ဆိုရင် **order confirm** လို့ စာပြန်ပေးပါရှင်" လို့ အမြဲ ဖိတ်ခေါ်ပါ။ ဖောက်သည်က "order confirm" လို့ ရေးပြီဆိုရင် အမည်၊ ဖုန်းနံပါတ်၊ လိပ်စာအပြည့်အစုံ တောင်းပြီး staff ကို လွှဲပါ။',
  true
);

notify pgrst, 'reload schema';
