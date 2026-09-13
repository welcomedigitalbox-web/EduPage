-- ---------- Customer-facing receipt ----------
-- The receipt is what leaves the building, so the shop controls its wording
-- without a deploy. Header lines identify the shop; the footer carries the
-- thank-you, the return window, whatever the shop wants at the bottom.

alter table msgr_settings
  add column if not exists receipt_shop_name text,
  add column if not exists receipt_phone     text,
  add column if not exists receipt_note      text,
  add column if not exists receipt_footer    text;

update msgr_settings
   set receipt_footer = coalesce(receipt_footer,
       'ကျေးဇူးတင်ပါတယ်ရှင် 🙏' || chr(10) ||
       'ပစ္စည်း လက်ခံရရှိပြီး ပြဿနာရှိပါက ၂ ရက်အတွင်း ဆက်သွယ်ပေးပါ။')
 where id = 1;

notify pgrst, 'reload schema';
