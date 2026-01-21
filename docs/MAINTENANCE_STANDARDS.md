# PADRÕES DE MANUTENÇÃO - PSControl

> Documento definitivo para evolução segura do sistema.
> Última atualização: 2026-01-21

---

## 1. COMO CRIAR NOVAS FEATURES

### 1.1 Regras Obrigatórias

Toda nova feature DEVE seguir estes princípios:

```typescript
// ✅ CORRETO: Sempre filtrar por seller_id
const { data } = await supabase
  .from('clients')
  .select('*')
  .eq('seller_id', user.id);

// ❌ ERRADO: Query sem filtro de seller
const { data } = await supabase.from('clients').select('*');
```

### 1.2 Checklist de Nova Feature

- [ ] **Pré-checagem**: Validar existência antes de inserir
- [ ] **Idempotência**: Operação pode rodar N vezes sem efeito colateral
- [ ] **Filtro seller_id**: Toda query filtra pelo vendedor atual
- [ ] **RLS**: Política de segurança criada para a tabela
- [ ] **Tipos**: Atualizar interfaces TypeScript
- [ ] **Testes**: Validar fluxo completo

### 1.3 Padrão de Componentes

```typescript
// Estrutura padrão para novos componentes
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export function NovaFeature() {
  const { user } = useAuth();
  
  // 1. Sempre verificar autenticação
  if (!user) return null;
  
  // 2. Sempre usar seller_id nas queries
  // 3. Sempre tratar erros
  // 4. Sempre mostrar loading states
}
```

### 1.4 Padrão de Hooks

```typescript
// Hook padrão com cache e invalidação
export function useNovaFeature() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['nova-feature', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('tabela')
        .select('*')
        .eq('seller_id', user.id);
        
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
}
```

---

## 2. ZONAS PROTEGIDAS (NÃO MEXER)

### 2.1 Edge Functions Críticas

| Função | Motivo | Risco se Alterar |
|--------|--------|------------------|
| `crypto` | Criptografia de senhas | Dados ilegíveis |
| `create-seller` | Criação de usuários | Auth quebrada |
| `setup-first-admin` | Bootstrap do sistema | Acesso perdido |
| `check-login-attempt` | Anti brute-force | Segurança comprometida |
| `generate-fingerprint` | Device tracking | Sessões inválidas |

### 2.2 RLS Policies Base

```sql
-- NUNCA ALTERAR estas políticas sem revisão completa:

-- profiles: Base de todo o sistema
-- user_roles: Controle de acesso
-- app_settings: Configurações globais

-- Se precisar mudar, SEMPRE:
-- 1. Fazer backup
-- 2. Testar em ambiente isolado
-- 3. Validar com admin
```

### 2.3 Hooks Globais

| Hook | Função | Dependentes |
|------|--------|-------------|
| `useAuth` | Autenticação central | Todos os componentes |
| `useClientValidation` | Normalização de dados | Clients, Import, Bulk |
| `useWhatsAppConfig` | Config WhatsApp | Automação, Chatbot |
| `useConnectionMonitor` | Status de conexão | Realtime, Sync |

### 2.4 Arquivos Intocáveis

```
❌ NUNCA EDITAR DIRETAMENTE:
├── src/integrations/supabase/client.ts  (auto-gerado)
├── src/integrations/supabase/types.ts   (auto-gerado)
├── supabase/config.toml                 (auto-gerado)
├── .env                                 (auto-gerado)
└── package.json                         (usar ferramentas)
```

---

## 3. PADRÃO DE IMPORTAÇÃO

### 3.1 Regra de Ouro

```typescript
// ❌ NUNCA: Insert direto sem verificação
await supabase.from('clients').insert(newClients);

// ✅ SEMPRE: Verificar existência primeiro
const existing = await fetchExistingClientIdsByPhone(supabase, sellerId, phones);
const toInsert = clients.filter(c => !existing.has(c.phone));
const toUpdate = clients.filter(c => existing.has(c.phone));
```

### 3.2 Funções de Deduplicação

```typescript
// Usar sempre os helpers de src/lib/idempotency.ts
import { 
  normalizeClientPhone,
  fetchExistingClientIdsByPhone,
  ensureTemplateExistsOrCreate,
  ensureClientNotificationTracking 
} from '@/lib/idempotency';
```

### 3.3 Fluxo de Importação em Massa

```
1. PARSE: Converter texto/arquivo para objetos
   ↓
2. NORMALIZE: Padronizar campos (telefone, categoria, data)
   ↓
3. VALIDATE: Verificar campos obrigatórios
   ↓
4. DEDUPE: Buscar existentes por chave lógica
   ↓
5. SPLIT: Separar inserts de updates
   ↓
6. BATCH: Processar em lotes de 50-200
   ↓
7. LOG: Registrar resultado (inserted, updated, skipped, errors)
```

### 3.4 Chaves de Deduplicação por Tabela

| Tabela | Chave Lógica | Helper |
|--------|--------------|--------|
| clients | (seller_id, phone) | fetchExistingClientIdsByPhone |
| servers | (seller_id, name) | buscar por nome normalizado |
| templates | (seller_id, type, name) | ensureTemplateExistsOrCreate |
| notifications | (seller_id, client_id, type, cycle) | ensureClientNotificationTracking |

---

## 4. CHECKLIST ANTES DE DEPLOY

### 4.1 Verificações Obrigatórias

```markdown
## PRÉ-DEPLOY CHECKLIST

### Cache e Estado
- [ ] localStorage limpo (testar em aba anônima)
- [ ] React Query cache invalidado onde necessário
- [ ] Nenhum estado stale persistindo

### Console e Logs
- [ ] Zero erros no console
- [ ] Zero warnings críticos
- [ ] Logs de debug removidos

### Sistema de Saúde
- [ ] /system-health mostra todos os componentes OK
- [ ] Database: ✅
- [ ] Edge Functions: ✅
- [ ] Realtime: ✅
- [ ] Storage: ✅

### Funcionalidades Core
- [ ] Login/Logout funcionando
- [ ] Dashboard carregando
- [ ] CRUD de clientes OK
- [ ] Automação WhatsApp respondendo

### Segurança
- [ ] RLS policies ativas em novas tabelas
- [ ] Nenhum dado sensível exposto no console
- [ ] Tokens não logados
```

### 4.2 Comandos de Verificação

```bash
# Verificar tipos TypeScript
npx tsc --noEmit

# Verificar linting
npx eslint src/

# Verificar build
npm run build
```

### 4.3 Testes Manuais Mínimos

```markdown
1. [ ] Abrir app em aba anônima
2. [ ] Fazer login como seller
3. [ ] Navegar para Dashboard
4. [ ] Criar um cliente teste
5. [ ] Editar o cliente
6. [ ] Deletar o cliente
7. [ ] Verificar console limpo
8. [ ] Fazer logout
```

---

## 5. PADRÕES DE CÓDIGO

### 5.1 Estrutura de Arquivos

```
src/
├── components/
│   ├── ui/           # shadcn base (não editar diretamente)
│   ├── layout/       # AppLayout, Sidebar, etc
│   └── [feature]/    # Componentes por feature
├── hooks/
│   ├── use[Feature].tsx    # Um hook por feature
│   └── useAuth.tsx         # Autenticação global
├── pages/
│   └── [Page].tsx    # Uma página por rota
├── lib/
│   ├── utils.ts      # Funções utilitárias
│   └── idempotency.ts # Helpers de deduplicação
└── config/
    └── navigation.ts # Estrutura de menus
```

### 5.2 Convenções de Nomenclatura

```typescript
// Componentes: PascalCase
export function ClientCard() {}

// Hooks: camelCase com prefixo "use"
export function useClients() {}

// Funções: camelCase
export function formatPhoneNumber() {}

// Constantes: UPPER_SNAKE_CASE
export const MAX_CLIENTS_PER_PAGE = 20;

// Tipos/Interfaces: PascalCase
interface ClientData {}
```

### 5.3 Tratamento de Erros

```typescript
// Padrão para mutations
const mutation = useMutation({
  mutationFn: async (data) => {
    const { error } = await supabase.from('table').insert(data);
    if (error) throw error;
  },
  onSuccess: () => {
    toast.success('Operação realizada!');
    queryClient.invalidateQueries({ queryKey: ['table'] });
  },
  onError: (error) => {
    console.error('[mutation-name]', error);
    toast.error('Erro: ' + error.message);
  },
});
```

---

## 6. TROUBLESHOOTING

### 6.1 Problemas Comuns

| Sintoma | Causa Provável | Solução |
|---------|----------------|---------|
| Dados não aparecem | RLS bloqueando | Verificar políticas |
| Duplicatas na lista | Import sem dedupe | Usar helpers idempotency |
| Console warning ref | Radix + React 18 | Já corrigido em dialog.tsx |
| 401 em Edge Function | JWT expirado | Verificar auth header |
| Query lenta | Sem índice | Criar index na coluna |

### 6.2 Onde Buscar Logs

```typescript
// Edge Functions: Supabase Dashboard > Edge Functions > Logs
// Ou via CLI: supabase functions logs <function-name>

// Frontend: Console do navegador (F12)

// Database: Supabase Dashboard > Logs > Postgres
```

### 6.3 Rollback de Emergência

```markdown
1. Acessar Lovable > projeto > histórico de versões
2. Identificar última versão estável
3. Restaurar versão
4. Se dados afetados: usar restore-data com backup recente
```

---

## 7. CONTATOS E RESPONSABILIDADES

| Área | Responsável | Ação Permitida |
|------|-------------|----------------|
| Admin Principal | Sandel Rodrigues | Tudo |
| Sellers | Revendedores | CRUD próprio |
| Sistema | Lovable AI | Suporte técnico |

---

## 8. CHANGELOG DE MANUTENÇÃO

| Data | Versão | Mudança |
|------|--------|---------|
| 2026-01-21 | 1.0.0 | Documento inicial criado |

---

*Este documento é a referência definitiva para manutenção do PSControl.*
*Qualquer alteração em zonas protegidas requer aprovação do admin principal.*
