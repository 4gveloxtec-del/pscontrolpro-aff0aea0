# PSControl Pro - Sistema de Gestão de Clientes IPTV

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/seu-usuario/pscontrol)

Sistema profissional para revendedores IPTV gerenciarem clientes, renovações, automações WhatsApp e muito mais.

## 🚀 Tecnologias

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS + shadcn/ui
- **Backend:** Supabase (Database + Auth + Edge Functions)
- **State:** TanStack Query
- **Deploy:** Vercel

## 📦 Instalação

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/pscontrol.git
cd pscontrol

# Instale dependências
npm install

# Configure variáveis de ambiente
cp .env.example .env
# Edite .env com suas credenciais Supabase

# Execute em desenvolvimento
npm run dev
```

## 🔧 Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run preview` | Preview do build |
| `npm run lint` | Verificar linting |

## 📁 Estrutura do Projeto

```
src/
├── components/     # 150+ componentes React
├── hooks/          # 40+ custom hooks
├── pages/          # 35+ páginas
├── lib/            # Utilitários
├── config/         # Configurações
└── integrations/   # Supabase client

supabase/
├── functions/      # 49 Edge Functions
├── migrations/     # Migrações SQL
└── config.toml     # Configuração

docs/
├── DEPLOY_GUIDE.md           # Guia de deploy
└── MAINTENANCE_STANDARDS.md  # Padrões de desenvolvimento
```

## ✨ Funcionalidades

- ✅ Gestão completa de clientes
- ✅ Automação WhatsApp (Evolution API)
- ✅ Geração de testes automatizada
- ✅ Notificações de vencimento
- ✅ Dashboard com métricas
- ✅ Multi-servidor IPTV
- ✅ Backup e restauração
- ✅ PWA (instalável)
- ✅ Tema claro/escuro

## 🔐 Variáveis de Ambiente

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-anon-key
VITE_SUPABASE_PROJECT_ID=seu-project-id
```

## 📖 Documentação

- [Guia de Deploy](docs/DEPLOY_GUIDE.md)
- [Padrões de Manutenção](docs/MAINTENANCE_STANDARDS.md)
- [Blueprint do Projeto](/project-docs) (na aplicação)

## 🚀 Deploy

### Vercel (Recomendado)

1. Conecte seu repositório GitHub à Vercel
2. Configure as variáveis de ambiente
3. Deploy automático em cada push

### Manual

```bash
npm run build
# Upload da pasta dist/ para seu servidor
```

## 📄 Licença

Projeto privado - Todos os direitos reservados.

---

Desenvolvido com ❤️ usando [Lovable](https://lovable.dev)
