-- Limpar sessões antigas para forçar novo primeiro contato (testar boas-vindas com lista)
DELETE FROM public.bot_sessions 
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa';

-- Também limpar sessões do bot_engine_sessions
DELETE FROM public.bot_engine_sessions 
WHERE seller_id = '63f2d73c-1632-4ff0-a03c-42992e63d0fa';