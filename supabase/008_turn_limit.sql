-- 6 bot replies is far too few for a real shop chat: once the counter was hit
-- every later question fell through to the handoff message.
alter table msgr_settings alter column max_bot_turns set default 20;
update msgr_settings set max_bot_turns = 20 where max_bot_turns < 20;

notify pgrst, 'reload schema';
