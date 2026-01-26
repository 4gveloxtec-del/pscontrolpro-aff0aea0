-- Limpar TODAS as sessões do bot para o seller Sandel
-- Isso garante que a próxima mensagem receba o menu como primeira interação
DELETE FROM public.bot_sessions
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa';

DELETE FROM public.bot_engine_sessions
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa';