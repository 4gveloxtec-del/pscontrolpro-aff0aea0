# 🔍 NOVA AUDITORIA TÉCNICA - PSControl Pro
**Data:** 25 de Janeiro de 2026 (V2)  
**Auditor:** Engenheiro Sênior React/Supabase  
**Status:** 20 NOVOS ERROS IDENTIFICADOS

---

## 📊 RESUMO EXECUTIVO

| Prioridade | Contagem |
|------------|----------|
| 🔴 CRÍTICO | 4 |
| 🟠 MUITO ALTO | 6 |
| 🟡 ALTO | 6 |
| 🔵 MÉDIO | 4 |
| **TOTAL** | **20** |

---

## 🔴 ERROS CRÍTICOS (Prioridade 1)

### CRIT-01: Dashboard queries sem isError guards
**Arquivo:** `src/pages/Dashboard.tsx:72-285`  
**Descrição:** 9 queries paralelas (clientStats, monthlyRevenue, expirationCounts, urgentClients, serverRevenue, categoryRevenue, categoryTotals, archivedCount, billsData) não possuem tratamento de erro. Se qualquer query falhar, o dashboard pode exibir dados zerados ou crashar.  
**Impacto:** Dashboard exibe informações incorretas sem feedback de erro.  
**Correção:**
```tsx
const { data: clientStats, isError: statsError } = useQuery({ ... });
// No render:
if (statsError || revenueError || ...) {
  return <ErrorState message="Erro ao carregar dashboard" />;
}
```

---

### CRIT-02: Clients.tsx fire-and-forget sem .catch() nas operações background
**Arquivo:** `src/pages/Clients.tsx:1074-1079, 1086-1122, 1126-1147, 1150-1183, 1187-1199`  
**Descrição:** Múltiplas operações background (panel_clients insert, external_apps save, premium_accounts save, server_app_credentials save, welcome message) usam `.then()` sem `.catch()` adequado ou async IIFE sem try-catch externo.  
**Impacto:** Falhas silenciosas em operações críticas de vinculação de dados.  
**Correção:**
```typescript
supabase.from('panel_clients').insert(panelEntries)
  .then(({ error }) => {
    if (error) {
      console.error('[Clients] Error:', error);
      toast.warning('Créditos não vinculados: ' + error.message);
    }
  })
  .catch(e => toast.error('Falha na operação: ' + e.message));
```

---

### CRIT-03: BulkCollectionDialog mutations sem onError completo
**Arquivo:** `src/components/BulkCollectionDialog.tsx:193-236`  
**Descrição:** As mutations `pauseMutation`, `resumeMutation` e `cancelMutation` não possuem `onError` handler, tornando falhas silenciosas.  
**Impacto:** Usuário não sabe quando pause/resume/cancel falha.  
**Correção:**
```typescript
const pauseMutation = useMutation({
  mutationFn: async () => { ... },
  onSuccess: () => { toast.info('Envio pausado'); refetchJob(); },
  onError: (error: Error) => { toast.error('Erro ao pausar: ' + error.message); }
});
```

---

### CRIT-04: ClientLookup sem isError guard nas queries
**Arquivo:** `src/pages/ClientLookup.tsx:178-265`  
**Descrição:** As queries `searchResults` e `clientFullData` não tratam estado de erro. Se a busca falhar, o usuário vê uma lista vazia sem feedback.  
**Impacto:** Falhas de rede parecem resultados "sem dados".  
**Correção:** Adicionar guards `isError` com mensagem e botão de retry.

---

## 🟠 ERROS MUITO ALTOS (Prioridade 2)

### VALTO-01: Dashboard.tsx uso de Promise.all sem try-catch
**Arquivo:** `src/pages/Dashboard.tsx:78-95, 153-165`  
**Descrição:** `Promise.all` em `clientStats` e `expirationCounts` não possui tratamento de erro interno. Se uma query falhar, todas falham silenciosamente.  
**Impacto:** Dashboard mostra zeros em caso de falha parcial.  
**Correção:** Usar `Promise.allSettled` ou envolver cada promise individualmente.

---

### VALTO-02: console.log em produção para debug
**Arquivos:** Múltiplos arquivos com logs excessivos
- `src/components/BulkImportClients.tsx:301, 324`
- `src/pages/Clients.tsx` (múltiplas linhas)
- `src/hooks/useAuth.tsx` (múltiplas linhas)
  
**Descrição:** Logs de debug ativos em produção impactam performance e expõem dados.  
**Impacto:** Performance degradada e potencial exposição de dados sensíveis.  
**Correção:** Remover ou envolver em `if (import.meta.env.DEV)`.

---

### VALTO-03: ManualMessageSender query templates sem isError
**Arquivo:** `src/components/ManualMessageSender.tsx:75-96`  
**Descrição:** Query de templates não trata erro. Se falhar, botões de mensagem não aparecem sem explicação.  
**Impacto:** Usuário não consegue enviar mensagens sem saber por quê.  
**Correção:** Adicionar isError guard com mensagem.

---

### VALTO-04: SendMessageDialog múltiplas queries sem guards consolidados
**Arquivo:** `src/components/SendMessageDialog.tsx:197-402`  
**Descrição:** 8 queries paralelas (templates, customCategories, plans, servers, clientExternalApps, sellerInstance, globalConfig, premiumAccounts) sem tratamento de erro unificado.  
**Impacto:** Modal pode renderizar incompleto sem feedback.  
**Correção:** Combinar isError de todas as queries críticas.

---

### VALTO-05: TestIntegrationConfig sem guard isError nas queries
**Arquivo:** `src/components/TestIntegrationConfig.tsx:74-122`  
**Descrição:** Queries de APIs, servers e config não tratam erro. Se falharem, formulário fica vazio sem explicação.  
**Impacto:** Configuração impossível sem feedback de erro.  
**Correção:** Adicionar verificação `isError` com UI de erro.

---

### VALTO-06: Clients.tsx updateMutation e deleteMutation com try-catch incompleto
**Arquivo:** `src/pages/Clients.tsx:1230-1400+`  
**Descrição:** As mutations de update usam `.single()` em linhas como 1278-1279 que podem falhar com PGRST116.  
**Impacto:** Crash na edição de cliente se query não encontrar dados.  
**Correção:** Usar `.maybeSingle()` e verificar resultado.

---

## 🟡 ERROS ALTOS (Prioridade 3)

### ALTO-01: BulkImportClients console.log em produção
**Arquivo:** `src/components/BulkImportClients.tsx:301, 324`  
**Descrição:** Logs de parsing de data em produção.  
**Correção:** Remover console.log ou envolver em DEV check.

---

### ALTO-02: ManualMessageSender sendViaApi não trata todas as falhas
**Arquivo:** `src/components/ManualMessageSender.tsx:180-237`  
**Descrição:** Se `ensureClientNotificationTracking` falhar após envio, o erro é ignorado.  
**Correção:** Adicionar try-catch com toast.warning.

---

### ALTO-03: check-expirations Edge Function sem tratamento de erro em loops
**Arquivo:** `supabase/functions/check-expirations/index.ts:393-437`  
**Descrição:** Erros individuais no loop de envio de notificações são logados mas não acumulados para retorno.  
**Impacto:** Função retorna sucesso mesmo com falhas parciais significativas.  
**Correção:** Acumular erros e incluir no response.

---

### ALTO-04: SendMessageDialog credentialsCache não limpa em caso de erro
**Arquivo:** `src/components/SendMessageDialog.tsx:155-192`  
**Descrição:** Se decrypt falhar, usa fallback mas mantém valores possivelmente incorretos no cache.  
**Correção:** Em caso de erro total, limpar cache do client específico.

---

### ALTO-05: Dashboard.tsx serverProfits pode crashar com map em null
**Arquivo:** `src/pages/Dashboard.tsx:433-448`  
**Descrição:** `serversData.map()` assume que serversData nunca é undefined, mas query pode falhar.  
**Impacto:** Crash se servers query falhar.  
**Correção:** Usar `(serversData || []).map()` (já feito) mas adicionar isError guard.

---

### ALTO-06: BulkCollectionDialog interval validation pode ser bypass
**Arquivo:** `src/components/BulkCollectionDialog.tsx:353`  
**Descrição:** Validação de intervalo (5-120) é feita no onChange mas pode ser editada diretamente no input.  
**Correção:** Validar também no submit/mutation.

---

## 🔵 ERROS MÉDIOS (Prioridade 4)

### MED-01: Dashboard falta skeleton loading nos cards
**Arquivo:** `src/pages/Dashboard.tsx`  
**Descrição:** Enquanto queries carregam, cards mostram zeros em vez de skeletons.  
**Correção:** Implementar skeleton loading nos StatCards.

---

### MED-02: ClientLookup decryption cache pode crescer indefinidamente
**Arquivo:** `src/pages/ClientLookup.tsx:161-164`  
**Descrição:** Caches de credenciais não são limpos, podem crescer com uso prolongado.  
**Correção:** Limpar cache ao fechar modal ou implementar LRU cache.

---

### MED-03: SendMessageDialog premiumAccountsCache não expira
**Arquivo:** `src/components/SendMessageDialog.tsx:117-118`  
**Descrição:** Cache de contas premium persistem indefinidamente na sessão.  
**Correção:** Limpar cache quando dialog fecha ou cliente muda.

---

### MED-04: ManualMessageSender daysUntil pode retornar NaN
**Arquivo:** `src/components/ManualMessageSender.tsx:135-143`  
**Descrição:** Se dateStr for inválido, pode retornar NaN sem fallback.  
**Correção:** Adicionar validação e retornar 0 como fallback.

---

## ✅ TOP 5 AÇÕES URGENTES

1. **Adicionar isError guards no Dashboard** - 9 queries sem tratamento de erro
2. **Adicionar .catch() em operações fire-and-forget** - Clients.tsx linhas 1074-1199
3. **Adicionar onError em BulkCollectionDialog mutations** - pause/resume/cancel silenciosos
4. **Adicionar guards no ClientLookup** - Busca falha silenciosamente
5. **Remover console.log de produção** - Múltiplos arquivos

---

## 📋 CHECKLIST DE CORREÇÃO

- [ ] CRIT-01: Dashboard isError guards
- [ ] CRIT-02: Clients.tsx fire-and-forget .catch()
- [ ] CRIT-03: BulkCollectionDialog mutations onError
- [ ] CRIT-04: ClientLookup isError guards
- [ ] VALTO-01: Dashboard Promise.allSettled
- [ ] VALTO-02: Remover console.log produção
- [ ] VALTO-03: ManualMessageSender isError
- [ ] VALTO-04: SendMessageDialog guards
- [ ] VALTO-05: TestIntegrationConfig isError
- [ ] VALTO-06: Clients.tsx .maybeSingle() em update
- [ ] ALTO-01 a ALTO-06: Correções de robustez
- [ ] MED-01 a MED-04: Melhorias de UX

---

**Estimativa de correção:** 3-4 horas para críticos + muito altos

*Relatório gerado em 25/01/2026*
