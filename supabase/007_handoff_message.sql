-- What the bot says when it cannot answer, instead of going silent.
alter table msgr_settings
  add column if not exists handoff_message text
    default 'ဒီအကြောင်းလေးကို သေချာစစ်ပြီး admin မှ မကြာခင် ပြန်ဖြေပေးပါမယ်ရှင် 🙏';

update msgr_settings
  set handoff_message = 'ဒီအကြောင်းလေးကို သေချာစစ်ပြီး admin မှ မကြာခင် ပြန်ဖြေပေးပါမယ်ရှင် 🙏'
  where handoff_message is null;

notify pgrst, 'reload schema';
