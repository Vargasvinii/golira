-- GOLIRA v5.1 - novas reações do Mural: 👍🏽 🍪 🔥 💪 🍅
-- Reações antigas com 🦍 (que deixam de existir) são apagadas.
-- Pode rodar mais de uma vez.

delete from public.mural_reactions
 where emoji not in ('👍🏽', '🍪', '🔥', '💪', '🍅');

alter table public.mural_reactions drop constraint if exists mural_reactions_emoji_check;
alter table public.mural_reactions
  add constraint mural_reactions_emoji_check
  check (emoji in ('👍🏽', '🍪', '🔥', '💪', '🍅'));
