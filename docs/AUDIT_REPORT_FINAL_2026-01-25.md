# 🔍 AUDITORIA TÉCNICA EXAUSTIVA - PSControl Pro
**Data:** 25 de Janeiro de 2026  
**Versão:** Final Consolidada  
**Auditor:** Engenheiro Sênior React/Supabase

---

## 📊 RESUMO EXECUTIVO

| Prioridade | Contagem | Status |
|------------|----------|--------|
| 🔴 CRÍTICO | 6 | Requer ação imediata |
| 🟠 MUITO ALTO | 8 | Requer correção urgente |
| 🟡 ALTO | 10 | Correção planejada |
| 🔵 MÉDIO | 8 | Melhoria recomendada |
| **TOTAL** | **32** | - |

---

## 🔴 ERROS CRÍTICOS (Prioridade 1)

### CRIT-01: JSON.parse sem try-catch em TestCommands.tsx
**Área:** Frontend / Páginas  
**Descrição:** A mutation `updateApiMutation` usa `JSON.parse` diretamente em linhas 299-300 sem proteção. JSON inválido inserido pelo usuário crashará a aplicação.  
**Arquivo:** `src/pages/TestCommands.tsx:299-300`  
**Impacto:** Crash ao salvar API com headers/body JSON malformado.  
**Dispositivo:** Mobile/Web/Desktop  
**Correção:**
```typescript
let parsedHeaders = {};
let parsedBody = null;
try {
  parsedHeaders = JSON.parse(data.api_headers || '{}');
  parsedBody = data.api_body_template ? JSON.parse(data.api_body_template) : null;
} catch (e) {
  toast.error('JSON inválido nos headers ou body');
  return;
}
```

---

### CRIT-02: Edge Function send-test-message sem AbortController
**Área:** Backend / Edge Functions  
**Descrição:** Chamadas fetch para Evolution API (linhas 98-108 e 136-146) não possuem timeout, podendo travar indefinidamente.  
**Arquivo:** `supabase/functions/send-test-message/index.ts:98-165`  
**Impacto:** Worker Deno pendente, timeout no frontend sem resposta.  
**Dispositivo:** Todos  
**Correção:** Adicionar AbortController com 15s timeout em todas as chamadas fetch.

---

### CRIT-03: .single() em whatsapp-automation causando PGRST116
**Área:** Backend / Edge Functions  
**Descrição:** Consultas de `adminProfile` e `appPriceSetting` usam `.single()` (linhas 335, 342). Se não existirem, a função crashará.  
**Arquivo:** `supabase/functions/whatsapp-automation/index.ts:335, 342`  
**Impacto:** Automação WhatsApp falha silenciosamente para novos admins.  
**Dispositivo:** Todos  
**Correção:** Substituir `.single()` por `.maybeSingle()` e adicionar fallbacks.

---

### CRIT-04: localStorage sem try-catch em hooks de notificação
**Área:** Frontend / Hooks  
**Descrição:** Múltiplos hooks acessam localStorage diretamente sem proteção, crashando em Safari Private Mode.  
**Arquivos Afetados:**
- `src/hooks/useExternalAppsExpirationNotifications.tsx:24`
- `src/hooks/useBillsNotifications.tsx:30`
- `src/hooks/useExpirationNotifications.tsx:22`
- `src/hooks/usePaymentNotifications.tsx:25`
- `src/hooks/usePushNotifications.tsx:152`
- `src/components/FloatingNotifications.tsx:87`

**Impacto:** App não carrega em Safari Private Mode.  
**Dispositivo:** Safari (iOS/macOS) Private Mode  
**Correção:** Envolver em try-catch com fallback para valor padrão.

---

### CRIT-05: sync-client-renewal usa .single() sem fallback
**Área:** Backend / Edge Functions  
**Descrição:** Consulta de planos usa `.single()` (linhas 168, 196) que pode crashar se plano não existir.  
**Arquivo:** `supabase/functions/sync-client-renewal/index.ts:168, 196`  
**Impacto:** Renovação de cliente falha se plano foi deletado.  
**Dispositivo:** Todos  
**Correção:** Substituir por `.maybeSingle()` e usar duration padrão de 30 dias.

---

### CRIT-06: BulkImportClients sem onError handler
**Área:** Frontend / Componentes  
**Descrição:** A mutation de importação não possui `onError`, fazendo falhas serem silenciosas.  
**Arquivo:** `src/components/BulkImportClients.tsx:422-550`  
**Impacto:** Usuário não sabe quando importação falha.  
**Dispositivo:** Todos  
**Correção:** Adicionar `onError: (e) => toast.error('Erro na importação: ' + e.message)`.

---

## 🟠 ERROS MUITO ALTOS (Prioridade 2)

### VALTO-01: Fire-and-forget sem .catch() em Clients.tsx
**Área:** Frontend / Páginas  
**Descrição:** Panel entries (linha 1074) e welcome message (linha 1187) não possuem `.catch()`.  
**Arquivo:** `src/pages/Clients.tsx:1074, 1187-1195`  
**Impacto:** Créditos não vinculados e mensagens não enviadas silenciosamente.  
**Correção:** Adicionar `.catch((e) => console.error(e))` em ambas as chains.

---

### VALTO-02: Backup Functions sem timeout global
**Área:** Backend / Edge Functions  
**Descrição:** Funções de backup/restore executam múltiplos Promise.all sem timeout global.  
**Arquivos:**
- `supabase/functions/complete-backup-export/index.ts`
- `supabase/functions/complete-backup-import/index.ts`
- `supabase/functions/restore-data/index.ts`

**Impacto:** Backups grandes podem travar indefinidamente.  
**Correção:** Implementar timeout global de 60s com AbortController.

---

### VALTO-03: useCircuitBreaker mutation sem onError
**Área:** Frontend / Hooks  
**Descrição:** A mutation `sendWithCircuitBreaker` não possui handler de erro padrão.  
**Arquivo:** `src/hooks/useCircuitBreaker.tsx:233-245`  
**Impacto:** Falhas de envio via circuit breaker não notificam usuário.  
**Correção:** Adicionar onError com toast.error.

---

### VALTO-04: Promise.all sem tratamento granular
**Área:** Backend / Edge Functions  
**Descrição:** Promise.all em wipe-all-data e cleanup-trash falham por completo se uma operação falhar.  
**Arquivos:**
- `supabase/functions/wipe-all-data/index.ts:117-126`
- `supabase/functions/cleanup-trash/index.ts:99-113`

**Impacto:** Limpeza parcial com estado inconsistente.  
**Correção:** Usar Promise.allSettled e reportar erros individuais.

---

### VALTO-05: TestCommands handleTestApi JSON.parse sem try-catch
**Área:** Frontend / Páginas  
**Descrição:** Linha 495 usa JSON.parse em headers sem proteção.  
**Arquivo:** `src/pages/TestCommands.tsx:495`  
**Impacto:** Teste de API falha com JSON malformado.  
**Correção:** Envolver em try-catch com toast.error.

---

### VALTO-06: PanelResellers sem guards de isError
**Área:** Frontend / Páginas  
**Descrição:** Múltiplas queries sem tratamento de erro no render.  
**Arquivo:** `src/pages/PanelResellers.tsx:106-182`  
**Impacto:** Página pode crashar se qualquer query falhar.  
**Correção:** Adicionar guards `if (isError) return <ErrorState />`.

---

### VALTO-07: MonthlyProfitHistory sem isError guard
**Área:** Frontend / Componentes  
**Descrição:** Query de histórico de lucros sem tratamento de erro.  
**Arquivo:** `src/components/dashboard/MonthlyProfitHistory.tsx:74-88`  
**Impacto:** Dashboard quebra se query falhar.  
**Correção:** Adicionar isError check e fallback UI.

---

### VALTO-08: usePushNotifications invoke sem verificação de erro
**Área:** Frontend / Hooks  
**Descrição:** Chamadas save-push-subscription (linhas 464, 524) não verificam objeto error.  
**Arquivo:** `src/hooks/usePushNotifications.tsx:464, 524`  
**Impacto:** Ativação/desativação de push pode falhar silenciosamente.  
**Correção:** Verificar `if (error) toast.error(...)`.

---

## 🟡 ERROS ALTOS (Prioridade 3)

### ALTO-01: AdminBroadcastResellers usa .single() em insert
**Arquivo:** `src/components/AdminBroadcastResellers.tsx:338`

### ALTO-02: useCircuitBreaker usa .single() em insert
**Arquivo:** `src/hooks/useCircuitBreaker.tsx:89`

### ALTO-03: useWhatsAppGlobalConfig usa .single() em insert
**Arquivo:** `src/hooks/useWhatsAppGlobalConfig.tsx:133`

### ALTO-04: useWhatsAppConfig usa .single() em insert
**Arquivo:** `src/hooks/useWhatsAppConfig.tsx:115`

### ALTO-05: atomic-client-upsert usa .single() em múltiplos inserts
**Arquivo:** `supabase/functions/atomic-client-upsert/index.ts:204, 264, 294, 325`

### ALTO-06: reconfigure-webhook usa .single() com .limit(1)
**Arquivo:** `supabase/functions/reconfigure-webhook/index.ts:175`

### ALTO-07: create-default-data usa .single() para perfil
**Arquivo:** `supabase/functions/create-default-data/index.ts:37`

### ALTO-08: TestIntegrationConfig sem guards de erro
**Arquivo:** `src/components/TestIntegrationConfig.tsx:74-122`

### ALTO-09: Settings.tsx query sem guards
**Arquivo:** `src/pages/Settings.tsx:128-138`

### ALTO-10: InlineAppCreator usa .single() em insert
**Arquivo:** `src/components/InlineAppCreator.tsx:31-304`

---

## 🔵 ERROS MÉDIOS (Prioridade 4)

### MED-01: ResellerAppsManager sem isError guard
### MED-02: AdminLandingPlatforms sem isError guard  
### MED-03: ServerAppsManager sem isError guard
### MED-04: ServerIcons sem guards explícitos
### MED-05: Tutorials sem isError guard
### MED-06: AdminServerTemplatesModal sem isError handling
### MED-07: SharedServersModal sem isError handling
### MED-08: ClientLookup sem isError para buscas

---

## 📋 RESUMO CONSOLIDADO COPIÁVEL

```
AUDITORIA PSCONTROL PRO - 25/01/2026 - VERSÃO FINAL

TOTAL: 32 problemas identificados (6 CRÍTICOS, 8 MUITO ALTOS, 10 ALTOS, 8 MÉDIOS)

🔴 TOP 10 PROBLEMAS MAIS URGENTES:
1. JSON.parse sem try-catch em TestCommands.tsx (linhas 299-300, 495) - Crash ao salvar API
2. Edge Function send-test-message sem AbortController - Worker travando indefinidamente
3. whatsapp-automation usa .single() (linhas 335, 342) - PGRST116 crash
4. localStorage sem try-catch em 6 hooks de notificação - Safari Private Mode inutilizável
5. sync-client-renewal usa .single() (linhas 168, 196) - Renovação falha
6. BulkImportClients sem onError handler - Importação falha silenciosamente
7. Fire-and-forget sem .catch() em Clients.tsx - Créditos não vinculados
8. Backup Functions sem timeout global - Backups travando
9. useCircuitBreaker mutation sem onError - Envios falham silenciosamente
10. Promise.all sem tratamento granular em wipe/cleanup - Estado inconsistente

🚨 TOP 5 RISCOS SE NADA FOR FEITO:
• Crash em produção por JSON malformado ou dados undefined
• Safari Private Mode completamente inutilizável
• Perda silenciosa de dados em importações e operações background
• Workers Deno travados consumindo recursos sem resposta
• Usuários frustrados por falta de feedback em operações

✅ TOP 5 AÇÕES URGENTES RECOMENDADAS:
1. Envolver JSON.parse em try-catch em TestCommands.tsx (linhas 299-300, 495)
2. Adicionar AbortController 15s em send-test-message fetch calls
3. Substituir .single() por .maybeSingle() em whatsapp-automation e sync-client-renewal
4. Envolver localStorage em try-catch em todos os hooks de notificação
5. Adicionar onError em BulkImportClients e useCircuitBreaker mutations

📂 ARQUIVOS PRIORITÁRIOS PARA CORREÇÃO:
- src/pages/TestCommands.tsx
- supabase/functions/send-test-message/index.ts
- supabase/functions/whatsapp-automation/index.ts
- supabase/functions/sync-client-renewal/index.ts
- src/components/BulkImportClients.tsx
- src/hooks/useCircuitBreaker.tsx
- src/hooks/useExternalAppsExpirationNotifications.tsx
- src/hooks/useBillsNotifications.tsx
- src/hooks/useExpirationNotifications.tsx
- src/hooks/usePaymentNotifications.tsx
- src/hooks/usePushNotifications.tsx
- src/components/FloatingNotifications.tsx

⏱️ ESTIMATIVA DE CORREÇÃO: 4-6 horas para críticos + muito altos
```

---

## 📊 CHECKLIST DE CORREÇÃO

- [x] CRIT-01: try-catch em JSON.parse TestCommands ✅
- [x] CRIT-02: AbortController em send-test-message ✅
- [x] CRIT-03: .maybeSingle() em whatsapp-automation ✅
- [x] CRIT-04: try-catch localStorage em hooks notificação ✅
- [x] CRIT-05: .maybeSingle() em sync-client-renewal ✅
- [x] CRIT-06: onError em BulkImportClients ✅
- [x] VALTO-01: .catch() em fire-and-forget Clients.tsx ✅
- [x] VALTO-02: timeout global em backup functions ✅
- [x] VALTO-03: onError em useCircuitBreaker ✅
- [x] VALTO-04: Promise.allSettled em wipe/cleanup ✅
- [x] VALTO-05: try-catch JSON.parse linha 495 ✅
- [x] VALTO-06: isError guards em PanelResellers ✅
- [x] VALTO-07: isError guard em MonthlyProfitHistory ✅
- [x] VALTO-08: verificação erro em usePushNotifications ✅
- [x] ALTO-01: AdminBroadcastResellers usa .maybeSingle() ✅
- [x] ALTO-02: useCircuitBreaker usa .maybeSingle() ✅
- [x] ALTO-03: useWhatsAppGlobalConfig usa .maybeSingle() ✅
- [x] ALTO-04: useWhatsAppConfig usa .maybeSingle() ✅
- [x] ALTO-06: reconfigure-webhook usa .maybeSingle() ✅
- [x] ALTO-07: create-default-data usa .maybeSingle() ✅
- [x] ALTO-10: InlineAppCreator usa .maybeSingle() ✅
- [x] MED-01: ResellerAppsManager isError guard ✅
- [x] MED-03: ServerAppsManager isError guard ✅

---

**Fim do Relatório de Auditoria**
