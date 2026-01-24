# Guia de Variáveis de Ambiente

**Versão:** 2.0  
**Atualizado:** 2026-01-24

---

## Visão Geral

Este documento descreve todas as variáveis de ambiente necessárias para o funcionamento do PSControl Pro em diferentes ambientes (desenvolvimento, staging e produção).

---

## Arquitetura de Variáveis

O projeto utiliza duas categorias de variáveis de ambiente:

| Categoria | Prefixo | Localização | Acesso |
|-----------|---------|-------------|--------|
| **Frontend** | `VITE_` | `.env` ou Vercel Dashboard | Compilado no JavaScript |
| **Backend** | - | Lovable Cloud / Supabase Secrets | Apenas Edge Functions |

---

## 1. Variáveis de Frontend (VITE)

Estas variáveis são **compiladas no bundle JavaScript** em tempo de build. Qualquer alteração requer um novo deploy.

### 1.1 Variáveis Críticas (Obrigatórias)

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase/Lovable Cloud | `https://abc123.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave anon/pública do Supabase | `eyJhbGciOiJIUzI1NiIs...` |
| `VITE_SUPABASE_PROJECT_ID` | ID do projeto Supabase | `abc123` |

**Sem estas variáveis, a aplicação exibirá uma tela de erro de configuração.**

### 1.2 Variáveis Opcionais

| Variável | Descrição | Default |
|----------|-----------|---------|
| `VITE_DEBUG_MODE` | Ativa logs de debug no console | `false` |

---

## 2. Variáveis de Backend (Edge Functions)

Estas variáveis são acessadas via `Deno.env.get()` nas Edge Functions.

### 2.1 Auto-Injetadas pelo Supabase

Estas variáveis estão **automaticamente disponíveis** em todas as Edge Functions:

| Variável | Descrição |
|----------|-----------|
| `SUPABASE_URL` | URL do projeto |
| `SUPABASE_ANON_KEY` | Chave anon/pública |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave admin (acesso total) |

### 2.2 Secrets Customizados (Configurar Manualmente)

Configurar em: **Lovable Cloud → Settings → Backend → Secrets**

| Secret | Obrigatório | Uso | Como Gerar |
|--------|-------------|-----|------------|
| `ENCRYPTION_KEY` | ✅ Sim | Criptografia AES-256 de dados sensíveis | `openssl rand -base64 32` |
| `VAPID_PUBLIC_KEY` | ✅ Sim | Chave pública para Web Push | `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | ✅ Sim | Chave privada para Web Push | (mesmo comando acima) |
| `VAPID_SUBJECT` | ✅ Sim | Contato para serviço de push | `mailto:admin@exemplo.com` |
| `LOVABLE_API_KEY` | ⚠️ Opcional | Geração de ícones com IA | Obtido no Lovable Dashboard |
| `SUPABASE_DB_URL` | ⚠️ Opcional | Acesso direto ao PostgreSQL | Obtido nas configurações do Supabase |

---

## 3. Configuração por Ambiente

### 3.1 Desenvolvimento Local

1. Copie o template:
   ```bash
   cp .env.example .env
   ```

2. Preencha as variáveis no arquivo `.env`:
   ```env
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbG...
   VITE_SUPABASE_PROJECT_ID=seu-projeto
   ```

3. Inicie o servidor:
   ```bash
   npm run dev
   ```

### 3.2 Staging/Preview (Lovable)

As variáveis são automaticamente configuradas pelo Lovable Cloud. Nenhuma ação necessária.

### 3.3 Produção (Vercel)

1. Acesse: **Vercel Dashboard → Projeto → Settings → Environment Variables**

2. Adicione cada variável:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`

3. Marque para: **Production**, **Preview** e **Development**

4. Clique em **Redeploy**

---

## 4. Sistema de Validação

O projeto inclui um sistema robusto de validação de variáveis:

### 4.1 Validação em Runtime

O arquivo `src/lib/env.ts` valida todas as variáveis no carregamento:

```typescript
import { env, validateEnv } from '@/lib/env';

// Verificar se a configuração é válida
const { valid, errors, warnings } = validateEnv();

if (!valid) {
  console.error('Erros de configuração:', errors);
}
```

### 4.2 Error Boundary Visual

O componente `EnvErrorBoundary` exibe uma tela amigável quando variáveis estão faltando, evitando a famosa "tela branca".

### 4.3 Detecção de Ambiente

```typescript
import { isLovableEnvironment, isVercelEnvironment, getEnvironmentName } from '@/lib/env';

// Verificar onde está rodando
console.log(getEnvironmentName()); // 'local', 'lovable', 'vercel', 'unknown'
```

---

## 5. Segurança

### ✅ Boas Práticas

- Nunca commitar o arquivo `.env` (já está no `.gitignore`)
- Usar `.env.example` apenas com placeholders
- Rotacionar secrets periodicamente
- Usar chaves diferentes para cada ambiente

### ❌ Evitar

- Hardcoding de URLs, tokens ou chaves
- Expor `SUPABASE_SERVICE_ROLE_KEY` no frontend
- Compartilhar secrets em canais não seguros

---

## 6. Troubleshooting

### Problema: Tela branca após deploy

**Causa:** Variáveis `VITE_*` não configuradas.

**Solução:** Adicionar as 3 variáveis obrigatórias no Vercel Dashboard e fazer redeploy.

### Problema: "ENCRYPTION_KEY not set"

**Causa:** Secret não configurado no backend.

**Solução:** Adicionar em Lovable Cloud → Settings → Backend → Secrets.

### Problema: Push notifications não funcionam

**Causa:** Secrets VAPID não configurados.

**Solução:** Gerar chaves com `npx web-push generate-vapid-keys` e adicionar os 3 secrets.

---

## 7. Referência Rápida

```bash
# Variáveis de Frontend (Vercel)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIs...
VITE_SUPABASE_PROJECT_ID=xxx

# Secrets de Backend (Lovable Cloud)
ENCRYPTION_KEY=<32-char-random>
VAPID_PUBLIC_KEY=<base64-key>
VAPID_PRIVATE_KEY=<base64-key>
VAPID_SUBJECT=mailto:admin@exemplo.com
LOVABLE_API_KEY=<lovable-key>
```

---

## 8. Arquivos Relacionados

| Arquivo | Descrição |
|---------|-----------|
| `.env.example` | Template com todas as variáveis |
| `src/lib/env.ts` | Módulo de validação e acesso |
| `src/components/EnvErrorBoundary.tsx` | Componente de erro visual |
| `docs/DEPLOY_GUIDE.md` | Guia completo de deploy |
| `docs/INTEGRATION_AUDIT.md` | Relatório de auditoria |
