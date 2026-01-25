# BotEngine - Documentação Técnica

> Motor de chatbot isolado. Fornece apenas **infraestrutura** — sem menus, fluxos ou mensagens prontas.

---

## 🏢 Arquitetura Multi-Revendedor (Multi-Tenant)

O BotEngine foi projetado para operar com **total isolamento** entre revendedores, mesmo utilizando:
- ✅ Uma única Evolution API global
- ✅ Um único webhook global (`connection-heartbeat`)
- ✅ Um único banco de dados

### Como Funciona o Isolamento

```
┌─────────────────────────────────────────────────────────────────┐
│                    EVOLUTION API GLOBAL                         │
│                     (Único endpoint)                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 WEBHOOK: connection-heartbeat                    │
│                                                                  │
│   1. Identifica seller_id pelo instance_name                    │
│   2. Chama bot-engine-intercept com seller_id                   │
│   3. Aplica isolamento via RLS                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
    │ Revendedor A│    │ Revendedor B│    │ Revendedor C│
    ├─────────────┤    ├─────────────┤    ├─────────────┤
    │ • Seu bot   │    │ • Seu bot   │    │ • Seu bot   │
    │ • Seus menus│    │ • Seus menus│    │ • Seus menus│
    │ • Seus fluxos│   │ • Seus fluxos│   │ • Seus fluxos│
    │ • Sessões   │    │ • Sessões   │    │ • Sessões   │
    │   isoladas  │    │   isoladas  │    │   isoladas  │
    └─────────────┘    └─────────────┘    └─────────────┘
```

### Garantias de Isolamento por Camada

| Camada | Mecanismo | Garantia |
|--------|-----------|----------|
| **Banco de Dados** | RLS (Row Level Security) | `seller_id = auth.uid()` |
| **Edge Functions** | Parâmetro seller_id | Filtra TODAS as queries |
| **Frontend Hooks** | user.id automático | Queries já filtradas |
| **Webhook** | instance_name → seller | Identificação na entrada |

### Tabelas Isoladas por seller_id

Todas as tabelas do BotEngine possuem:
- Coluna `seller_id UUID NOT NULL`
- Índice em `seller_id`
- RLS habilitado
- Policy `USING (auth.uid() = seller_id)`

```sql
-- Exemplo de política RLS
CREATE POLICY "Sellers can manage their own menus"
ON public.bot_engine_menus
FOR ALL
USING (auth.uid() = seller_id)
WITH CHECK (auth.uid() = seller_id);
```

### O Que Cada Revendedor Possui

| Recurso | Tabela | Isolamento |
|---------|--------|------------|
| Configuração do Bot | `bot_engine_config` | 1 registro por seller |
| Fluxos de Conversa | `bot_engine_flows` | N fluxos por seller |
| Nós dos Fluxos | `bot_engine_nodes` | Via flow_id + seller_id |
| Conexões | `bot_engine_edges` | Via flow_id + seller_id |
| Menus Dinâmicos | `bot_engine_menus` | UNIQUE(seller_id, menu_key) |
| Sessões Ativas | `bot_engine_sessions` | Por contato + seller |
| Estado de Navegação | `bot_sessions` | user_id + seller_id |
| Log de Mensagens | `bot_logs` | seller_id obrigatório |

---

## ⚠️ Garantias de Isolamento

| Garantia | Descrição |
|----------|-----------|
| ✅ **Não modifica funções existentes** | Nenhuma função de negócio IPTV é alterada |
| ✅ **Não altera integrações prontas** | Evolution API, webhooks e comandos continuam intactos |
| ✅ **Não recria APIs** | Usa as mesmas APIs e endpoints já existentes |
| ✅ **Camada aditiva** | Apenas adiciona interceptação opcional |
| ✅ **Escalável e reutilizável** | Baseado em tabelas de configuração, não código fixo |
| ✅ **Documentado** | Cada função possui documentação inline |

### Ponto de Integração Único

O BotEngine se conecta ao sistema existente em **apenas um ponto**:

```
connection-heartbeat (webhook existente)
         ↓
   [try/catch seguro]
         ↓
   bot-engine-intercept → Se falhar ou retornar false, 
         ↓                 continua para IPTV normalmente
   [Se intercepted: true]
         ↓
   Envia resposta e continua
```

**Código de integração** (`connection-heartbeat`, linhas ~820-876):
- Envolvido em `try/catch` para nunca quebrar o fluxo principal
- Se `intercepted: false` → continua para comandos IPTV
- Se ocorrer erro → log e continua normalmente

---

## 📁 Estrutura de Arquivos

```
src/lib/botEngine/
├── index.ts          # Exportações centralizadas
├── types.ts          # Tipos TypeScript
├── utils.ts          # Utilitários (normalização, etc.)
├── core.ts           # Funções core (setState, pushStack, popStack, etc.)
├── commands.ts       # Comandos globais (menu, voltar, sair, etc.)
├── navigation.ts     # Navegação (ir/voltar)
└── integration.ts    # Integração com APIs existentes

supabase/functions/
├── bot-engine-process/index.ts    # Processador principal de fluxos
└── bot-engine-intercept/index.ts  # Interceptador no webhook
```

---

## 🗄️ Tabelas do Banco

| Tabela | Descrição |
|--------|-----------|
| `bot_engine_config` | Configuração por seller (habilitado, timeout, etc.) |
| `bot_engine_flows` | Fluxos de conversa (trigger, keywords, prioridade) |
| `bot_engine_nodes` | Nós dos fluxos (start, message, input, condition, action, end) |
| `bot_engine_edges` | Conexões entre nós (condições, prioridade) |
| `bot_engine_sessions` | Sessões ativas de conversa |
| `bot_engine_message_log` | Log de mensagens trocadas |
| `bot_sessions` | Estado/stack de navegação (tabela legada) |
| `bot_logs` | Log de mensagens (tabela legada) |

---

## 🔌 Como Ligar Novos Fluxos

### 1. Criar um Fluxo

```sql
INSERT INTO bot_engine_flows (seller_id, name, trigger_type, trigger_keywords, is_active, is_default)
VALUES (
  'seller-uuid',
  'Fluxo de Vendas',
  'keyword',
  ARRAY['comprar', 'planos', 'preços'],
  true,
  false
);
```

### 2. Criar Nós do Fluxo

```sql
-- Nó inicial (entry point)
INSERT INTO bot_engine_nodes (flow_id, seller_id, node_type, is_entry_point, config)
VALUES (
  'flow-uuid',
  'seller-uuid',
  'start',
  true,
  '{}'::jsonb
);

-- Nó de mensagem
INSERT INTO bot_engine_nodes (flow_id, seller_id, node_type, config)
VALUES (
  'flow-uuid',
  'seller-uuid',
  'message',
  '{"message_text": "Olá {{name}}! Escolha uma opção:", "message_type": "text"}'::jsonb
);

-- Nó de input
INSERT INTO bot_engine_nodes (flow_id, seller_id, node_type, config)
VALUES (
  'flow-uuid',
  'seller-uuid',
  'input',
  '{"variable_name": "opcao", "prompt_message": "Digite o número da opção:"}'::jsonb
);
```

### 3. Conectar Nós com Edges

```sql
INSERT INTO bot_engine_edges (flow_id, seller_id, source_node_id, target_node_id, condition_type, condition_value, priority)
VALUES 
  ('flow-uuid', 'seller-uuid', 'start-node-uuid', 'message-node-uuid', 'always', NULL, 0),
  ('flow-uuid', 'seller-uuid', 'message-node-uuid', 'input-node-uuid', 'always', NULL, 0);
```

---

## ⚡ Como Adicionar Novas Ações no executeAction

### Edge Function (`supabase/functions/bot-engine-intercept/index.ts`)

```typescript
function executeAction(action: string, currentStack: string[]): ActionResult {
  switch (action) {
    // ... ações existentes ...

    case 'nova_acao':
      return {
        success: true,
        newState: 'NOVO_ESTADO',
        clearStack: false,  // opcional
        popStack: false,    // opcional
      };

    default:
      return { success: false };
  }
}
```

### Frontend (`src/lib/botEngine/commands.ts`)

```typescript
export async function processGlobalCommand(
  userId: string,
  sellerId: string,
  message: string
): Promise<CommandResult> {
  // ... código existente ...

  switch (command.action) {
    // ... cases existentes ...

    case 'nova_acao':
      await setState(userId, sellerId, 'NOVO_ESTADO');
      return { handled: true, command: 'nova_acao', newState: 'NOVO_ESTADO' };

    default:
      return { handled: false };
  }
}
```

---

## 🌐 Como Criar Novos Comandos Globais

### 1. Adicionar no Array de Comandos

**Edge Function** (`supabase/functions/bot-engine-intercept/index.ts`):

```typescript
const GLOBAL_COMMANDS = [
  // ... comandos existentes ...
  { keywords: ['ajuda', 'help', '?'], action: 'ajuda' },
];
```

**Frontend** (`src/lib/botEngine/commands.ts`):

```typescript
export const GLOBAL_COMMANDS: GlobalCommand[] = [
  // ... comandos existentes ...
  {
    keywords: ['ajuda', 'help', '?'],
    action: 'ajuda',
    description: 'Exibe ajuda do sistema'
  },
];
```

### 2. Implementar a Ação

Adicione o case no `executeAction` (veja seção anterior).

### 3. Deploy

Após alterar a Edge Function:
```
O deploy é automático ao salvar o arquivo no Lovable.
```

---

## 🔄 Fluxo de Execução

```
Mensagem Recebida
       ↓
┌─────────────────────────┐
│  1. lockSession(userId) │
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│  2. parseInput(message) │
└───────────┬─────────────┘
            ↓
┌─────────────────────────────┐
│  3. Verificar comando global│
│     (menu, voltar, sair...) │
└───────────┬─────────────────┘
            ↓
    ┌───────┴───────┐
    │ É comando?    │
    └───────┬───────┘
       Sim  │  Não
            │    └──→ Passa para fluxo existente
            ↓
┌─────────────────────────┐
│  4. executeAction       │
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│  5. Atualizar state/stack│
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│  6. Log da mensagem     │
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│  7. unlockSession       │
└─────────────────────────┘
```

---

## 📋 Tipos de Nós Suportados

| Tipo | Descrição | Config |
|------|-----------|--------|
| `start` | Ponto de entrada | `{}` |
| `message` | Envia mensagem | `{ message_text, message_type, media_url, buttons }` |
| `input` | Aguarda input | `{ variable_name, prompt_message }` |
| `condition` | Avalia condição | (usa edges com condition_type) |
| `action` | Executa ação | `{ action_type, variable_to_set, variable_value }` |
| `delay` | Aguarda tempo | `{ delay_seconds }` |
| `end` | Finaliza fluxo | `{ end_message }` |

---

## 🔒 Estados Especiais

| Estado | Comportamento |
|--------|---------------|
| `AGUARDANDO_PAGAMENTO` | Bloqueia comandos globais |
| `CONFIRMACAO_CRITICA` | Bloqueia comandos globais |
| `INPUT_OBRIGATORIO` | Bloqueia comandos globais |
| `ENCERRADO` | Sessão finalizada |
| `AGUARDANDO_HUMANO` | Bypass para atendimento |

---

## ⚠️ Regras Importantes (Contrato de Isolamento)

### O que o BotEngine FAZ:
1. ✅ Interceptar mensagens ANTES do processamento IPTV
2. ✅ Gerenciar estado/sessão do chatbot
3. ✅ Responder com menus dinâmicos configurados em banco
4. ✅ Logar todas as interações
5. ✅ Usar lock atômico para anti-duplicação

### O que o BotEngine NÃO FAZ:
1. ❌ **NÃO modifica funções existentes** — Código IPTV permanece intacto
2. ❌ **NÃO altera integrações prontas** — Evolution API, webhooks existentes
3. ❌ **NÃO recria APIs** — Usa infraestrutura existente
4. ❌ **NÃO interfere em `/comandos`** — Comandos com `/` passam direto
5. ❌ **NÃO cria menus fixos em código** — Tudo vem do banco de dados

### Tabelas Exclusivas (não afetam tabelas existentes):
- `bot_engine_config` — Configuração por seller
- `bot_engine_flows` — Fluxos de conversa
- `bot_engine_nodes` — Nós dos fluxos
- `bot_engine_edges` — Conexões entre nós
- `bot_engine_menus` — Menus dinâmicos
- `bot_engine_sessions` — Sessões ativas
- `bot_engine_message_log` — Log de mensagens
- `bot_sessions` — Estado/stack de navegação (legado)
- `bot_logs` — Log de mensagens (legado)

---

## 🧪 Testando

### Habilitar BotEngine para um Seller

```sql
INSERT INTO bot_engine_config (seller_id, is_enabled)
VALUES ('seller-uuid', true)
ON CONFLICT (seller_id) DO UPDATE SET is_enabled = true;
```

### Verificar Logs

```sql
SELECT * FROM bot_engine_message_log 
WHERE seller_id = 'seller-uuid' 
ORDER BY processed_at DESC 
LIMIT 20;
```

### Verificar Sessões

```sql
SELECT * FROM bot_engine_sessions 
WHERE seller_id = 'seller-uuid' 
  AND status = 'active';
```
