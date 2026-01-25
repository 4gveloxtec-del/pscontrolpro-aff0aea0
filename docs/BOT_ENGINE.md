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
│   1. Extrai instance_name (suporta 10+ formatos Evolution API)  │
│   2. ❌ SEM instance_name → Rejeita com HTTP 400                │
│   3. Busca seller_id (instance_name OU original_instance_name)  │
│   4. ❌ SEM seller_id → Rejeita/Ignora mensagem                 │
│   5. ✅ Chama bot-engine-intercept COM seller_id obrigatório    │
│   6. Aplica isolamento via RLS em TODAS as queries              │
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

### Identificação Obrigatória do Revendedor

**REGRA CRÍTICA**: Nenhuma mensagem é processada sem `seller_id` definido.

| Etapa | Validação | Resultado se Falhar |
|-------|-----------|---------------------|
| 1. Extração | `instance_name` do payload | HTTP 400 - Rejeita |
| 2. Lookup | `whatsapp_seller_instances.instance_name` | Ignora mensagem |
| 3. Fallback | `whatsapp_seller_instances.original_instance_name` | Ignora mensagem |
| 4. Passagem | `seller_id` para BotEngine | Não processa |

```typescript
// Fluxo no connection-heartbeat (simplificado)
const instanceName = extractInstanceName(body); // 10+ formatos suportados

if (!instanceName) {
  return Response(400, "Instance name required"); // ❌ BLOQUEADO
}

const instance = await findSellerByInstance(instanceName);

if (!instance?.seller_id) {
  console.log("No seller found for instance"); // ❌ IGNORADO
  return Response(200, "No seller mapped");
}

// ✅ Só processa com seller_id válido
await botEngineIntercept({
  seller_id: instance.seller_id, // OBRIGATÓRIO
  sender_phone: senderPhone,
  message_text: messageText,
});
```

### Garantias de Isolamento por Camada

| Camada | Mecanismo | Garantia |
|--------|-----------|----------|
| **Banco de Dados** | RLS (Row Level Security) | `seller_id = auth.uid()` |
| **Edge Functions** | Parâmetro seller_id | Filtra TODAS as queries |
| **Frontend Hooks** | user.id automático | Queries já filtradas |
| **Webhook** | instance_name → seller | Identificação na entrada |

### Tabelas Isoladas por seller_id (RLS Ativo)

| Tabela | RLS Policy |
|--------|------------|
| `bot_engine_config` | `seller_id = auth.uid() OR has_role(admin)` |
| `bot_engine_flows` | `seller_id = auth.uid() OR has_role(admin)` |
| `bot_engine_nodes` | `seller_id = auth.uid() OR has_role(admin)` |
| `bot_engine_edges` | `seller_id = auth.uid() OR has_role(admin)` |
| `bot_engine_sessions` | `seller_id = auth.uid() OR has_role(admin)` |
| `bot_engine_message_log` | `seller_id = auth.uid() OR has_role(admin)` |
| `bot_engine_menus` | `seller_id = auth.uid() OR has_role(admin)` |
| `bot_engine_actions` | `seller_id = auth.uid() OR has_role(admin)` |
| `bot_engine_usage_metrics` | `seller_id = auth.uid() OR has_role(admin)` |
| `bot_engine_audit_log` | `seller_id = auth.uid() OR has_role(admin)` |
| `bot_sessions` | `seller_id = auth.uid() OR has_role(admin)` |
| `bot_logs` | `seller_id = auth.uid() OR has_role(admin)` |

```sql
-- Exemplo de política RLS
CREATE POLICY "Sellers manage own config"
ON public.bot_engine_config
FOR ALL USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
```

---

## 📊 Métricas de Uso (Billing)

Estrutura para cobrança por uso mensal:

### Tabela `bot_engine_usage_metrics`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `seller_id` | UUID | Revendedor |
| `period_start` | TIMESTAMPTZ | Início do período (mês) |
| `period_end` | TIMESTAMPTZ | Fim do período |
| `messages_received` | INT | Total de mensagens recebidas |
| `messages_sent` | INT | Total de mensagens enviadas |
| `sessions_created` | INT | Sessões iniciadas |
| `sessions_completed` | INT | Sessões finalizadas |
| `human_transfers` | INT | Transferências para humano |
| `flows_executed` | INT | Fluxos executados |
| `nodes_processed` | INT | Nós processados |

### Funções de Suporte

```sql
-- Incrementar métrica (uso interno)
SELECT increment_bot_usage('seller-uuid', 'messages_received', 1);

-- Obter resumo para billing
SELECT * FROM get_bot_usage_summary('seller-uuid');
-- Retorna: messages_received, messages_sent, sessions_created, etc.
```

---

## 🔍 Auditoria e Logs

### Tabela `bot_engine_audit_log`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `seller_id` | UUID | Revendedor (obrigatório) |
| `event_type` | TEXT | session_start, message_in, message_out, flow_change, error |
| `event_category` | TEXT | session, message, flow, config, security |
| `session_id` | UUID | Sessão relacionada |
| `flow_id` | UUID | Fluxo relacionado |
| `contact_phone` | TEXT | Telefone do contato |
| `event_data` | JSONB | Dados detalhados do evento |

```sql
-- Registrar evento de auditoria
SELECT log_bot_audit_event(
  'seller-uuid',           -- seller_id
  'session_start',         -- event_type
  'session',               -- event_category
  'session-uuid',          -- session_id
  NULL,                    -- flow_id
  NULL,                    -- node_id
  '5511999999999',         -- contact_phone
  '{"source": "webhook"}'  -- event_data
);
```

---

### O Que Cada Revendedor Possui

| Recurso | Tabela | Isolamento |
|---------|--------|------------|
| **Configuração Completa** | `bot_engine_config` | 1 registro por seller |
| Fluxos de Conversa | `bot_engine_flows` | N fluxos por seller |
| Nós dos Fluxos | `bot_engine_nodes` | Via flow_id + seller_id |
| Conexões | `bot_engine_edges` | Via flow_id + seller_id |
| Menus Dinâmicos | `bot_engine_menus` | UNIQUE(seller_id, menu_key) |
| Sessões Ativas | `bot_engine_sessions` | Por contato + seller |
| Estado de Navegação | `bot_sessions` | UNIQUE(user_id, seller_id) |
| Log de Mensagens | `bot_logs` | seller_id obrigatório |
| **Métricas de Uso** | `bot_engine_usage_metrics` | Por período + seller |
| **Logs de Auditoria** | `bot_engine_audit_log` | seller_id obrigatório |

---

## ⚙️ Configuração por Revendedor (bot_engine_config)

Cada revendedor possui sua própria configuração completa do bot:

### Mensagens Personalizadas

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `welcome_message` | TEXT | Mensagem de boas-vindas inicial |
| `welcome_media_url` | TEXT | URL de mídia para enviar junto |
| `welcome_media_type` | ENUM | none, image, video, audio, document |
| `fallback_message` | TEXT | Quando não entender a mensagem |
| `inactivity_message` | TEXT | Ao encerrar por inatividade |
| `outside_hours_message` | TEXT | Fora do horário de atendimento |
| `human_takeover_message` | TEXT | Ao transferir para humano |

### Horário de Funcionamento

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `business_hours_enabled` | BOOLEAN | Ativar controle de horário |
| `business_hours_start` | TIME | Hora de início (ex: "08:00") |
| `business_hours_end` | TIME | Hora de fim (ex: "22:00") |
| `business_days` | INT[] | Dias ativos [1=Seg, 7=Dom] |
| `timezone` | TEXT | Fuso horário (America/Sao_Paulo) |

### Comportamento

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `typing_simulation` | BOOLEAN | Simular "digitando..." |
| `auto_reply_delay_ms` | INT | Delay antes de responder (ms) |
| `max_inactivity_minutes` | INT | Tempo para encerrar sessão |
| `session_expire_minutes` | INT | Expiração total da sessão |
| `human_takeover_enabled` | BOOLEAN | Permitir transferência para humano |

### Controle de Fluxos

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `main_menu_key` | TEXT | Menu principal (ref: bot_engine_menus) |
| `enabled_flows` | TEXT[] | IDs de fluxos habilitados (vazio = todos) |
| `disabled_commands` | TEXT[] | Comandos globais desabilitados |
| `custom_variables` | JSONB | Variáveis personalizadas {empresa, pix...} |

### Carregamento Dinâmico

```typescript
// O motor carrega configurações automaticamente pelo seller_id
const { data: config } = await supabase
  .from('bot_engine_config')
  .select('*')
  .eq('seller_id', sellerId)
  .eq('is_enabled', true)
  .maybeSingle();

// Verificar horário de funcionamento
function isWithinBusinessHours(config: BotEngineConfig): boolean {
  if (!config.business_hours_enabled) return true;
  
  const now = new Date();
  const currentDay = now.getDay() || 7; // 1-7 (Seg-Dom)
  
  if (!config.business_days.includes(currentDay)) return false;
  
  const [startH, startM] = config.business_hours_start.split(':');
  const [endH, endM] = config.business_hours_end.split(':');
  
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseInt(startH) * 60 + parseInt(startM);
  const endMinutes = parseInt(endH) * 60 + parseInt(endM);
  
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}
```

---

## 🔐 Sessões Isoladas por Revendedor

### Estrutura Obrigatória da Sessão

Toda sessão do bot DEVE conter:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `user_id` | TEXT | Telefone do contato (normalizado) |
| `seller_id` | UUID | ID do revendedor (OBRIGATÓRIO) |
| `state` | TEXT | Estado atual da sessão |
| `previous_state` | TEXT | Estado anterior (automático via trigger) |
| `context` | JSONB | Variáveis e dados da sessão |
| `locked` | BOOLEAN | Trava anti-duplicação |
| `stack` | JSONB | Histórico de navegação |

### Regra Crítica: Chave Composta

```
⚠️ NUNCA buscar sessões apenas pelo telefone!

❌ PROIBIDO:
.eq('user_id', phone)

✅ OBRIGATÓRIO:
.eq('user_id', phone)
.eq('seller_id', sellerId)
```

### Implementação no Código

Todas as operações de sessão utilizam a chave composta `(user_id, seller_id)`:

```typescript
// ✅ getState - Busca estado com isolamento
export async function getState(userId: string, sellerId: string) {
  const { data } = await supabase
    .from('bot_sessions')
    .select('state')
    .eq('user_id', userId)
    .eq('seller_id', sellerId)  // ← OBRIGATÓRIO
    .maybeSingle();
  return data?.state;
}

// ✅ setState - Upsert com conflito correto
export async function setState(userId: string, sellerId: string, state: string) {
  await supabase
    .from('bot_sessions')
    .upsert({
      user_id: userId,
      seller_id: sellerId,  // ← OBRIGATÓRIO
      state,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,seller_id'  // ← Chave composta
    });
}

// ✅ lockSession - Lock atômico isolado
const { data: locked } = await supabase
  .from('bot_sessions')
  .update({ locked: true })
  .eq('user_id', userId)
  .eq('seller_id', sellerId)  // ← OBRIGATÓRIO
  .or('locked.eq.false,updated_at.lt.TIMEOUT')
  .select('id')
  .maybeSingle();
```

### Cenário: Mesmo Telefone em Revendedores Diferentes

```
Telefone: 5511999999999

┌─────────────────────────────────┐
│ Revendedor A (seller_id: abc)   │
├─────────────────────────────────┤
│ user_id: 5511999999999          │
│ state: MENU_PRINCIPAL           │
│ context: { plano: "Mensal" }    │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ Revendedor B (seller_id: xyz)   │
├─────────────────────────────────┤
│ user_id: 5511999999999          │  ← Mesmo telefone
│ state: AGUARDANDO_PAGAMENTO     │  ← Estado diferente
│ context: { valor: 50 }          │  ← Contexto diferente
└─────────────────────────────────┘

→ São sessões COMPLETAMENTE INDEPENDENTES!
```

### Garantias de Isolamento

| Garantia | Implementação |
|----------|---------------|
| **Banco de Dados** | UNIQUE(user_id, seller_id) |
| **RLS** | `seller_id = auth.uid()` |
| **Edge Functions** | Parâmetro seller_id obrigatório |
| **Frontend** | Hooks filtram por user.id |
| **Upsert** | onConflict: 'user_id,seller_id' |

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
