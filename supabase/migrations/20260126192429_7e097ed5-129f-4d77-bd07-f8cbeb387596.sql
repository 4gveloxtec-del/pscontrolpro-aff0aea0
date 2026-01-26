-- Desbloquear sessões presas para o número de teste
UPDATE bot_sessions 
SET locked = false, 
    updated_at = NOW() 
WHERE user_id = '5531998518865' 
   OR user_id LIKE '%998518865';

-- Também resetar sessions antigas (mais de 1 hora com lock)
UPDATE bot_sessions 
SET locked = false, 
    updated_at = NOW() 
WHERE locked = true 
  AND updated_at < NOW() - INTERVAL '1 hour';