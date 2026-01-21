# 🤖 Chatbot V3 - Arquitetura Modular

## Visão Geral

O Chatbot V3 é um sistema de auto-resposta profissional, modular e escalável, funcionando igualmente para **ADM** e **Revendedores**.

### Princípios Fundamentais

1. **Sem dependência de contexto** - Cada mensagem é processada independentemente
2. **Detecção por intenção (contains)** - Aceita variações de entrada
3. **Aceita números E texto** - O usuário pode digitar "1" ou "plano"
4. **Fácil de adicionar fluxos** - Estrutura modular e clara
5. **Nunca fica sem responder** - Fallback obrigatório

---

## 📊 Estrutura do Banco de Dados

### Tabelas Principais

| Tabela | Descrição |
|--------|-----------|
| `chatbot_v3_config` | Configurações gerais (habilitado, delays, fallback) |
| `chatbot_v3_menus` | Menus e submenus do chatbot |
| `chatbot_v3_options` | Opções de cada menu com keywords |
| `chatbot_v3_triggers` | Gatilhos globais (menu, voltar, humano) |
| `chatbot_v3_variables` | Variáveis dinâmicas ({empresa}, {pix}) |
| `chatbot_v3_contacts` | Contatos e estado atual de cada usuário |
| `chatbot_v3_logs` | Logs de interação para auditoria |

### Relacionamentos

```
chatbot_v3_config (1) ←→ (1) user
        ↓
chatbot_v3_menus (N) ←→ (1) user
        ↓
chatbot_v3_options (N) ←→ (1) menu
```

---

## 🔄 Fluxo de Processamento

```
Mensagem Recebida
       ↓
┌──────────────────────────────────────┐
│  1. GATILHOS GLOBAIS (prioridade)    │
│     - menu, voltar, início → main    │
│     - humano → aguardar atendente    │
└──────────────────────────────────────┘
       ↓ (não encontrou)
┌──────────────────────────────────────┐
│  2. MATCH POR NÚMERO                 │
│     - "1" → opção 1 do menu atual    │
│     - "2" → opção 2 do menu atual    │
└──────────────────────────────────────┘
       ↓ (não encontrou)
┌──────────────────────────────────────┐
│  3. MATCH POR KEYWORD                │
│     - "plano" → keywords da opção    │
│     - "teste" → keywords da opção    │
└──────────────────────────────────────┘
       ↓ (não encontrou)
┌──────────────────────────────────────┐
│  4. FALLBACK                         │
│     "Não entendi 😕                  │
│      Digite MENU para ver opções."   │
└──────────────────────────────────────┘
```

---

## 📁 Estrutura de Arquivos

```
supabase/functions/
└── chatbot-v3/
    └── index.ts          # Webhook principal

src/
├── hooks/
│   └── useChatbotV3.tsx  # Hook de gerenciamento
└── pages/
    └── ChatbotV3.tsx     # Interface de edição
```

---

## 🎛️ Tipos de Ação (action_type)

| Tipo | Descrição |
|------|-----------|
| `menu` | Navega para outro menu |
| `message` | Envia mensagem personalizada |
| `human` | Transfere para atendente |
| `end` | Encerra conversa e volta ao menu principal |

---

## 🔧 Como Adicionar Novos Fluxos

### 1. Criar um Novo Submenu

```sql
INSERT INTO chatbot_v3_menus (user_id, menu_key, title, message_text, parent_menu_key)
VALUES (
  'seu-user-id',
  'novo_menu',
  'Novo Menu',
  '📋 *Novo Menu*

*1* - Opção A
*2* - Opção B

*0* - Voltar',
  'main'
);
```

### 2. Adicionar Opções ao Menu

```sql
INSERT INTO chatbot_v3_options (menu_id, user_id, option_number, option_text, keywords, target_menu_key, action_type)
VALUES (
  'id-do-menu',
  'seu-user-id',
  1,
  'Opção A',
  ARRAY['opcao', 'opção', 'a'],
  'submenu_a',
  'menu'
);
```

### 3. Criar Gatilho Global (Opcional)

```sql
INSERT INTO chatbot_v3_triggers (user_id, trigger_name, keywords, action_type, target_menu_key, priority)
VALUES (
  'seu-user-id',
  'promocao',
  ARRAY['promoção', 'promocao', 'desconto'],
  'goto_menu',
  'promocoes',
  70
);
```

---

## 🏪 ADM vs Revendedor

### Estrutura Compartilhada

- Ambos usam as **mesmas tabelas**
- Cada um tem seus **próprios dados** (filtrado por `user_id`)
- O trigger `auto_create_chatbot_v3` cria dados padrão para novos usuários

### Personalização por Revendedor

Cada revendedor pode personalizar:
- ✅ Textos dos menus
- ✅ Preços e valores
- ✅ Variáveis ({empresa}, {pix})
- ✅ Horários de atendimento
- ❌ Estrutura base (definida pelo sistema)

---

## 📝 Variáveis Dinâmicas

| Variável | Descrição |
|----------|-----------|
| `{empresa}` | Nome da empresa |
| `{pix}` | Chave PIX |
| `{whatsapp}` | Número de contato |
| `{horario}` | Horário de atendimento |

### Uso no Texto

```
Olá! Seja bem-vindo à *{empresa}*!

💰 PIX: {pix}
📞 WhatsApp: {whatsapp}
🕐 Atendimento: {horario}
```

---

## 🛡️ Segurança (RLS)

Todas as tabelas possuem **Row Level Security** ativado:

```sql
-- Usuário só vê seus próprios dados
CREATE POLICY "Users can view own data"
ON chatbot_v3_menus FOR SELECT
USING (auth.uid() = user_id);
```

---

## 🐛 Debugging

### Endpoint de Diagnóstico

```bash
GET /functions/v1/chatbot-v3?diagnose=true
```

Retorna:
```json
{
  "status": "diagnostic",
  "version": "3.0.0",
  "configs": 5,
  "menus": 25,
  "triggers": 15
}
```

### Logs de Interação

Todas as interações são salvas em `chatbot_v3_logs` com:
- Mensagem recebida
- Resposta enviada
- Menu atual
- Trigger acionado (se houver)
- Flag de fallback

---

## ❌ Evitar Erros Comuns

1. **Nunca deixar menu sem opção 0 (voltar)**
2. **Sempre definir keywords alternativas**
3. **Testar variações numéricas E textuais**
4. **Verificar se target_menu_key existe**
5. **Manter fallback message configurado**

---

## 📞 Suporte

Para dúvidas sobre a implementação, consulte:
- Interface: `/chatbot-v3`
- Logs: Tabela `chatbot_v3_logs`
- Configurações: Aba "Configurações" na interface
