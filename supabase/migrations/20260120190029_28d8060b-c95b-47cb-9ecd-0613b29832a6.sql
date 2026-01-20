-- Tabela para armazenar configuração do chatbot do admin
CREATE TABLE public.admin_chatbot_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  node_key text NOT NULL UNIQUE,
  title text NOT NULL,
  content text NOT NULL,
  parent_key text,
  options jsonb DEFAULT '[]'::jsonb,
  response_type text DEFAULT 'menu',
  icon text DEFAULT '📋',
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_chatbot_config ENABLE ROW LEVEL SECURITY;

-- Only admins can manage
CREATE POLICY "Admins can manage chatbot config"
ON public.admin_chatbot_config
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Everyone can view (for webhook usage)
CREATE POLICY "Anyone can view chatbot config"
ON public.admin_chatbot_config
FOR SELECT
USING (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_admin_chatbot_config_updated_at
  BEFORE UPDATE ON public.admin_chatbot_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir configuração padrão
INSERT INTO public.admin_chatbot_config (node_key, title, content, parent_key, options, response_type, icon, sort_order) VALUES
-- Menu Inicial
('inicial', 'Menu Principal', '👋 Olá! Seja bem-vindo(a) à *SANPLAY IPTV* 🎬📺
Qualidade, estabilidade e o melhor do entretenimento!

Escolha uma opção abaixo 👇

1️⃣ Conhecer os Planos
2️⃣ Teste Grátis 🎁
3️⃣ Formas de Pagamento 💳
4️⃣ Suporte Técnico 🛠️
5️⃣ Falar com Atendente 👨‍💻', NULL, '[{"key": "1", "label": "Conhecer os Planos", "target": "planos"}, {"key": "2", "label": "Teste Grátis", "target": "teste"}, {"key": "3", "label": "Formas de Pagamento", "target": "pagamento"}, {"key": "4", "label": "Suporte Técnico", "target": "suporte"}, {"key": "5", "label": "Falar com Atendente", "target": "atendente"}]', 'menu', '🏠', 0),

-- Menu Planos
('planos', 'Planos', '📋 *CONHECER PLANOS*

1- Plano Mensal
2- Plano Trimestral
3- Plano Semestral
4- Plano Anual

Digite a opção desejada
Para voltar digite *', 'inicial', '[{"key": "1", "label": "Mensal", "target": "plano_mensal"}, {"key": "2", "label": "Trimestral", "target": "plano_trimestral"}, {"key": "3", "label": "Semestral", "target": "plano_semestral"}, {"key": "4", "label": "Anual", "target": "plano_anual"}]', 'menu', '📋', 1),

('plano_mensal', 'Plano Mensal', '*PLANO MENSAL* 💰

VALORES:
1- 1 TELA: R$25,00
2- 2 TELAS: R$40,00
3- 3 TELAS: R$55,00

Digite opção ou * para voltar', 'planos', '[]', 'text', '💰', 2),

('plano_trimestral', 'Plano Trimestral', '*PLANO TRIMESTRAL* 💰

VALORES:
1- 1 TELA: R$25/mês
2- 2 TELAS: R$40/mês
3- 3 TELAS: R$50/mês

ESCOLHA A OPÇÃO. * para voltar', 'planos', '[]', 'text', '💰', 3),

('plano_semestral', 'Plano Semestral', '*PLANO SEMESTRAL* 💰

VALORES:
1- 1 TELA: R$120
2- 2 TELAS: R$220
3- 3 TELAS: R$270

ESCOLHA A OPÇÃO. * para voltar', 'planos', '[]', 'text', '💰', 4),

('plano_anual', 'Plano Anual', '*PLANO ANUAL* 💰 (12 meses)

VALORES:
1- 1 TELA: R$240 (R$20/mês)
2- 2 TELAS: R$360 (R$30/mês)
3- 3 TELAS: R$420 (R$35/mês)

* para voltar', 'planos', '[]', 'text', '💰', 5),

-- Menu Teste
('teste', 'Teste Grátis', '🎁 *TESTE GRÁTIS 4H*

EM QUAL APARELHO? 📱📺🖥️🎮

1- CELULAR ANDROID
2- CELULAR IOS
3- TV BOX
4- FIRE STICK
5- TV SMART
6- TV ANDROID
7- COMPUTADOR
8- Outros

💳 Pagamento só após teste
⏰ 4 horas de teste
* menu principal', 'inicial', '[{"key": "1", "label": "Android", "target": "teste_android"}, {"key": "2", "label": "iOS", "target": "teste_ios"}, {"key": "3", "label": "TV Box", "target": "teste_android"}, {"key": "4", "label": "Fire Stick", "target": "teste_firestick"}, {"key": "5", "label": "Smart TV", "target": "teste_smarttv"}, {"key": "6", "label": "TV Android", "target": "teste_android"}, {"key": "7", "label": "Computador", "target": "teste_pc"}, {"key": "8", "label": "Outros", "target": "teste_outros"}]', 'menu', '🎁', 6),

('teste_android', 'Android/TV Box', '📱 *ANDROID/TV BOX/TV ANDROID*

Instale um dos apps:

📲 *IBO REVENDA*
https://play.google.com/store/apps/details?id=com.colinet.boxv3

📲 *FACILITA24*
https://play.google.com/store/apps/details?id=facilita.app

📲 *VU REVENDA*
https://play.google.com/store/apps/details?id=com.gplayer.pro

✅ Tire print após abrir pra ativar teste!
* para voltar', 'teste', '[]', 'text', '📱', 7),

('teste_ios', 'iOS', '📱 *IOS (iPhone/iPad)*

Baixe o app:

📲 *XCLOUD MOBILE*
https://apps.apple.com/br/app/xcloud-mobile/id6471106231

✅ Manda msg após instalar que crio usuário/senha!
* para voltar', 'teste', '[]', 'text', '🍎', 8),

('teste_firestick', 'Fire Stick', '🔥 *FIRE STICK*

Instale o app *ZONE X*

✅ Tire print após abrir pra ativar teste!
* para voltar', 'teste', '[]', 'text', '🔥', 9),

('teste_smarttv', 'Smart TV', '📺 *TV SMART*

Me envie:
📌 Marca da TV
📸 Foto do controle

⏳ Aguarde atendimento
* para voltar', 'teste', '[]', 'text', '📺', 10),

('teste_pc', 'Computador', '💻 *COMPUTADOR*

Abra o link que vou enviar.

⏳ Aguarde atendimento
* para voltar', 'teste', '[]', 'text', '💻', 11),

('teste_outros', 'Outros', '❓ *OUTROS APARELHOS*

Qual modelo você tem?
Informe para envio correto.

⏳ Aguardando sua resposta
* para voltar', 'teste', '[]', 'text', '❓', 12),

-- Outros menus
('pagamento', 'Pagamento', '💳 *FORMAS DE PAGAMENTO*

✅ PIX (Mercado Pago)
✅ Cartão (até 12x)

Para Pix digite: /Pix
* para voltar', 'inicial', '[]', 'text', '💳', 13),

('suporte', 'Suporte', '🛠️ *SUPORTE TÉCNICO*

Seu chamado foi registrado!

⏳ Aguarde atendimento
* para voltar', 'inicial', '[]', 'text', '🛠️', 14),

('atendente', 'Atendente', '👨‍💻 *ATENDIMENTO HUMANO*

💬 Um atendente irá responder em breve.

⏳ Aguarde resposta
* para voltar', 'inicial', '[]', 'text', '👨‍💻', 15);