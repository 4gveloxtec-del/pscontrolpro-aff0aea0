# 🚀 Guia de Deploy - PSControl

## 📋 Pré-requisitos

- Node.js 18+ 
- npm ou bun
- Conta no GitHub
- Conta na Vercel (opcional)
- Projeto Supabase configurado

---

## 🏗️ Estrutura do Projeto

```
pscontrol/
├── src/                      # Frontend React
│   ├── components/           # Componentes UI (150+)
│   ├── hooks/                # Custom hooks (40+)
│   ├── pages/                # Páginas da aplicação (35+)
│   ├── lib/                  # Utilitários
│   ├── config/               # Configurações
│   └── integrations/         # Integrações Supabase
├── supabase/
│   ├── functions/            # Edge Functions (49)
│   ├── migrations/           # Migrações do banco
│   └── config.toml           # Configuração Supabase
├── public/                   # Assets estáticos
├── docs/                     # Documentação
├── vercel.json               # Configuração Vercel
├── .env.example              # Template de variáveis
└── package.json              # Dependências
```

---

## 🔧 Configuração Local

### 1. Clone o repositório
```bash
git clone https://github.com/seu-usuario/pscontrol.git
cd pscontrol
```

### 2. Instale as dependências
```bash
npm install
```

### 3. Configure as variáveis de ambiente
```bash
cp .env.example .env
```

Edite o `.env` com suas credenciais:
```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-anon-key
VITE_SUPABASE_PROJECT_ID=seu-project-id
```

### 4. Execute em desenvolvimento
```bash
npm run dev
```

---

## 🧪 Verificações Pré-Deploy

### Verificar tipos TypeScript
```bash
npx tsc --noEmit
```

### Verificar linting
```bash
npm run lint
```

### Build de produção
```bash
npm run build
```

### Preview local do build
```bash
npm run preview
```

---

## 🔐 Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `VITE_SUPABASE_URL` | ✅ | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Chave pública anon |
| `VITE_SUPABASE_PROJECT_ID` | ✅ | ID do projeto |
| `VITE_DEBUG_MODE` | ❌ | Ativar modo debug |

---

## 📦 Deploy na Vercel

### Via Interface Web

1. Acesse [vercel.com](https://vercel.com)
2. Clique em "New Project"
3. Importe o repositório do GitHub
4. Configure as variáveis de ambiente
5. Deploy automático!

### Configurações do Build

- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

### Via CLI

```bash
# Instale a CLI da Vercel
npm i -g vercel

# Faça login
vercel login

# Deploy
vercel --prod
```

---

## 🔄 Deploy Contínuo

O projeto está configurado para deploy contínuo:

1. **Push para `main`** → Deploy automático na Vercel
2. **Pull Request** → Deploy de preview
3. **Merge** → Atualização em produção

### GitHub Actions (opcional)

O projeto pode usar GitHub Actions para CI/CD adicional:
- Testes automatizados
- Verificação de tipos
- Linting
- Build de produção

---

## 🗄️ Edge Functions (Supabase)

As Edge Functions são deployadas automaticamente pelo Lovable Cloud.

### Lista de Functions (49 total)

**Autenticação & Usuários:**
- `create-user-profile` - Criar perfil
- `set-user-role` - Definir role
- `fix-user-roles` - Corrigir roles
- `change-seller-password` - Alterar senha
- `check-login-attempt` - Verificar login

**WhatsApp:**
- `process-whatsapp-command` - Processar comandos
- `evolution-api` - Proxy Evolution API
- `send-welcome-message` - Mensagem de boas-vindas
- `whatsapp-automation` - Automação
- `configure-seller-instance` - Configurar instância

**Clientes & Testes:**
- `create-test-client` - Criar cliente teste
- `check-test-expiration` - Verificar expiração
- `check-expirations` - Notificações de expiração
- `sync-client-renewal` - Sincronizar renovação

**Backup & Dados:**
- `backup-data` - Exportar backup
- `restore-data` - Restaurar backup
- `complete-backup-import` - Importação completa
- `wipe-all-data` - Limpar dados

**Notificações:**
- `send-push-notification` - Push notification
- `save-push-subscription` - Salvar subscription
- `get-vapid-public-key` - Chave VAPID
- `generate-vapid-keys` - Gerar chaves

---

## 🛡️ Segurança

### RLS Policies
Todas as tabelas têm Row Level Security habilitado com políticas por `seller_id`.

### Secrets
Gerenciados via Lovable Cloud ou Supabase Dashboard:
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `ENCRYPTION_KEY`

---

## 📊 Monitoramento

### Logs
- **Frontend:** Console do navegador
- **Edge Functions:** Lovable Cloud Dashboard
- **Database:** Supabase Dashboard

### Health Check
A aplicação inclui sistema de self-healing (`/system-health`).

---

## 🆘 Troubleshooting

### Build falha
```bash
# Limpe cache e reinstale
rm -rf node_modules
rm package-lock.json
npm install
npm run build
```

### Variáveis não carregam
- Verifique prefixo `VITE_`
- Reinicie o servidor de dev
- Verifique Vercel Dashboard

### Edge Functions não deployam
- Verifique `supabase/config.toml`
- Redeploy via Lovable

---

## 📞 Suporte

- **Documentação:** `/project-docs`
- **Padrões:** `docs/MAINTENANCE_STANDARDS.md`
- **Estrutura:** Ver blueprint na aplicação

---

*Última atualização: Janeiro 2026*
