import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, Check, FileText } from 'lucide-react';
import { toast } from 'sonner';

const DOCUMENTATION = `# DOCUMENTAÇÃO COMPLETA - PSControl

## 1. ESTRUTURA DE TELAS (36 páginas)

### Públicas
| Tela | Arquivo | Finalidade | Responsiva |
|------|---------|------------|------------|
| Landing | Landing.tsx | Página inicial marketing | ✅ |
| Auth | Auth.tsx | Login/Cadastro sellers | ✅ |
| AdminAuth | AdminAuth.tsx | Login admin separado | ✅ |
| AccessDenied | AccessDenied.tsx | Acesso negado | ✅ |
| NotFound | NotFound.tsx | 404 | ✅ |

### Seller (Revendedor)
| Tela | Arquivo | Finalidade |
|------|---------|------------|
| Dashboard | Dashboard.tsx | Painel principal com stats |
| Clients | Clients.tsx | CRUD completo de clientes |
| Servers | Servers.tsx | Gestão de servidores |
| Plans | Plans.tsx | Planos e preços |
| Panels | Panels.tsx | Links dos painéis |
| PanelResellers | PanelResellers.tsx | Sub-revendedores |
| Bills | Bills.tsx | Contas a pagar |
| Coupons | Coupons.tsx | Cupons de desconto |
| Referrals | Referrals.tsx | Sistema de indicações |
| ExternalApps | ExternalApps.tsx | Apps pagos (IBO, etc) |
| MyApps | MyApps.tsx | Apps do revendedor |
| Templates | Templates.tsx | Templates de mensagens |
| MessageHistory | MessageHistory.tsx | Histórico de mensagens |
| WhatsAppAutomation | WhatsAppAutomation.tsx | Config automação |
| ChatbotV3 | ChatbotV3.tsx | Chatbot novo |
| SellerChatbotMenu | SellerChatbotMenu.tsx | Menu chatbot seller |
| Chatbot | Chatbot.tsx | Chatbot legado |
| ChatbotLogs | ChatbotLogs.tsx | Logs do chatbot |
| Tutorials | Tutorials.tsx | Tutoriais em vídeo |
| Settings | Settings.tsx | Configurações |

### Admin
| Tela | Arquivo | Finalidade |
|------|---------|------------|
| AdminDashboard | AdminDashboard.tsx | Dashboard admin |
| Sellers | Sellers.tsx | Gestão de vendedores |
| Reports | Reports.tsx | Relatórios gerais |
| Backup | Backup.tsx | Backup/Restore |
| SystemHealth | SystemHealth.tsx | Autocura do sistema |
| AdminChatbot | AdminChatbot.tsx | Chatbot admin |
| AdminServerTemplates | AdminServerTemplates.tsx | Templates servidores |
| ServerIcons | ServerIcons.tsx | Ícones padrão |

---

## 2. COMPONENTES PRINCIPAIS

### UI Base (shadcn/ui) - 49 componentes
\`\`\`
accordion, alert, alert-dialog, aspect-ratio, avatar, badge,
breadcrumb, button, calendar, card, carousel, chart, checkbox,
collapsible, command, context-menu, dialog, drawer, dropdown-menu,
form, hover-card, input, input-otp, label, menubar, navigation-menu,
pagination, popover, progress, radio-group, resizable, scroll-area,
select, separator, sheet, sidebar, skeleton, slider, sonner, switch,
table, tabs, textarea, toast, toaster, toggle, toggle-group, tooltip
\`\`\`

### Componentes de Negócio
| Componente | Função |
|------------|--------|
| ClientCard | Card de cliente com ações |
| ClientForm/* | Formulário modular de cliente |
| ServerAppsManager | Gestão apps por servidor |
| ServerImageUpload | Upload de ícone servidor |
| SharedCreditPicker | Seletor de créditos |
| ExternalAppsManager | Gestão apps externos |
| SendMessageDialog | Modal envio mensagem |
| BulkCollectionDialog | Cobrança em massa |
| PaginationControls | Paginação reutilizável |
| StatCard | Card de estatística |
| ConfirmDialog | Confirmação de ação |

### Layout
| Componente | Função |
|------------|--------|
| AppLayout | Layout principal app |
| AdminLayout | Layout área admin |
| Sidebar | Menu lateral desktop |
| BottomNavigation | Menu inferior mobile |
| NavLink | Link de navegação |

### Proteção de Rotas
| Componente | Função |
|------------|--------|
| ProtectedRoute | Protege rotas seller |
| AdminProtectedRoute | Protege rotas admin |
| OnlineRequired | Requer conexão |

---

## 3. NAVEGAÇÃO (src/config/navigation.ts)

### Grupos de Menu
\`\`\`typescript
Principal: Dashboard, Clientes, Meus Apps, Apps Pagos, Servidores, Revendedores, Painéis, Planos
Financeiro: Contas a Pagar, Cupons, Indicações
Mensagens: Automação WhatsApp, Chatbot V3, Templates, Histórico
Sistema: Tutoriais, Vendedores*, Templates Servidores*, Autocura*, Relatórios*, Backup*, Configurações
(* = adminOnly)
\`\`\`

### Permissões
- \`adminOnly\`: Apenas admins veem
- \`sellerOnly\`: Apenas sellers veem (admin NÃO vê)
- Sem flag: Todos veem

---

## 4. HOOKS CUSTOMIZADOS (38 hooks)

### Autenticação e Segurança
\`\`\`
useAuth, useBruteForce, useFingerprint, usePasswordValidation, useCrypto
\`\`\`

### Dados e Cache
\`\`\`
useClientValidation, useRenewalMutation, usePerformanceOptimization, useSentMessages
\`\`\`

### WhatsApp e Chatbot
\`\`\`
useWhatsAppConfig, useWhatsAppGlobalConfig, useWhatsAppSellerInstance,
useChatbotV3, useChatbotFlows, useChatbotRules, useChatbotCategories,
useSellerChatbotConfig, useAdminChatbotConfig
\`\`\`

### Notificações
\`\`\`
useNotifications, useExpirationNotifications, useExternalAppsExpirationNotifications,
useBillsNotifications, usePaymentNotifications, usePushNotifications
\`\`\`

### Sistema
\`\`\`
useSystemHealth, useTrialApiStatus, useConnectionMonitor, useRealtimeConnectionSync,
useClearOfflineData, useOnboardingCheck
\`\`\`

### UI/UX
\`\`\`
useTheme, useMenuStyle, usePrivacyMode, usePWA, useMobile
\`\`\`

---

## 5. BANCO DE DADOS (73 tabelas)

### Principais Tabelas
| Tabela | Função | RLS |
|--------|--------|-----|
| profiles | Perfis de usuários | ✅ |
| clients | Clientes dos sellers | ✅ |
| servers | Servidores IPTV | ✅ |
| plans | Planos de assinatura | ✅ |
| bills_to_pay | Contas a pagar | ✅ |
| coupons | Cupons de desconto | ✅ |
| referrals | Sistema de indicações | ✅ |
| templates | Templates de mensagens | ✅ |
| message_history | Histórico mensagens | ✅ |

### WhatsApp/Chatbot
| Tabela | Função |
|--------|--------|
| whatsapp_seller_instances | Instâncias Evolution API |
| whatsapp_global_config | Config global WhatsApp |
| chatbot_v3_config | Config chatbot v3 |
| chatbot_v3_menus | Menus do chatbot |
| chatbot_v3_options | Opções dos menus |
| chatbot_v3_triggers | Gatilhos globais |
| chatbot_v3_variables | Variáveis customizadas |
| chatbot_contacts | Contatos do chatbot |
| chatbot_interactions | Histórico interações |

### Admin
| Tabela | Função |
|--------|--------|
| app_settings | Configurações globais |
| admin_chatbot_config | Chatbot do admin |
| admin_broadcasts | Broadcasts admin |
| server_templates | Templates de servidores |
| landing_platforms | Plataformas na landing |
| system_health_status | Status autocura |
| self_healing_logs | Logs autocura |

### Relacionamentos Chave
\`\`\`
profiles.id → clients.seller_id
profiles.id → servers.seller_id
clients.id → client_external_apps.client_id
servers.id → server_apps.server_id
\`\`\`

---

## 6. EDGE FUNCTIONS (41 funções)

### Autenticação
\`\`\`
create-seller, create-user-profile, set-user-role, fix-user-roles,
change-seller-password, generate-temp-password, setup-first-admin
\`\`\`

### WhatsApp/Evolution API
\`\`\`
evolution-api, whatsapp-automation, check-expirations, check-instance-blocks,
configure-seller-instance, send-welcome-message, send-reseller-message
\`\`\`

### Chatbot
\`\`\`
chatbot-v3, chatbot-webhook
\`\`\`

### Backup
\`\`\`
backup-data, restore-data, complete-backup-export, complete-backup-import,
deploy-backup-import, direct-backup-import
\`\`\`

### Sistema
\`\`\`
self-healing, connection-heartbeat, cleanup-trash, validate-api-access,
reset-trial, wipe-all-data
\`\`\`

### Notificações
\`\`\`
send-push-notification, save-push-subscription, get-vapid-public-key,
generate-vapid-keys, setup-notification-settings
\`\`\`

### Utilitários
\`\`\`
crypto, generate-fingerprint, generate-server-icon, setup-server-apps,
setup-whatsapp-automation, bulk-collection-processor, create-default-data
\`\`\`

---

## 7. AUTOMAÇÕES E INTEGRAÇÕES

### Evolution API (WhatsApp)
| Automação | Gatilho | Ação |
|-----------|---------|------|
| Boas-vindas | Cliente criado | Envia credenciais |
| Vencimento próximo | 3 dias antes | Lembra renovação |
| Vencido | Dia do vencimento | Avisa expiração |
| Cobrança em massa | Manual | Envia para selecionados |

### Chatbot V3
| Gatilho | Ação |
|---------|------|
| Palavra-chave | Responde com menu |
| Opção numérica | Navega menu |
| Trigger global | Resposta automática |

### Sistema de Autocura
| Componente | Verificação |
|------------|-------------|
| database | Conexão Supabase |
| whatsapp_api | Evolution API |
| edge_functions | Funções Supabase |
| storage | Supabase Storage |
| realtime | Supabase Realtime |

---

## 8. ESTADOS E FEEDBACKS

### Loading States
- Skeleton loaders em listas
- Spinner em botões durante ações
- Fallback do Suspense para rotas

### Mensagens (via Sonner)
\`\`\`typescript
toast.success("Operação realizada!")
toast.error("Erro: " + message)
toast.info("Informação")
toast.warning("Atenção")
\`\`\`

### Validações
- Formulários com react-hook-form + zod
- Feedback visual inline nos inputs
- Mensagens de erro contextuais

---

## 9. ARQUIVOS DE CONFIGURAÇÃO

| Arquivo | Função |
|---------|--------|
| src/config/navigation.ts | Estrutura de menus |
| tailwind.config.ts | Tema e cores |
| src/index.css | Variáveis CSS/Tokens |
| supabase/config.toml | Config Supabase |
| vite.config.ts | Config Vite |
| vercel.json | Deploy Vercel |

---

## 10. FLUXOS PRINCIPAIS

### Login Seller
\`\`\`
/auth → useAuth.signIn → profiles check → role check → /dashboard
\`\`\`

### Criar Cliente
\`\`\`
/clients → Dialog → Form validation → encrypt credentials → 
insert clients → insert apps → send welcome (optional) → refresh list
\`\`\`

### Renovar Cliente
\`\`\`
ClientCard → Renew button → confirm days → update expiration → 
update is_paid → send renewal message (optional)
\`\`\`

### Automação WhatsApp
\`\`\`
Cron/Manual → check-expirations → filter clients → 
evolution-api → send message → log history
\`\`\`

---

## 11. PADRÕES DE MANUTENÇÃO

### 11.1 Como Criar Novas Features
\`\`\`typescript
// ✅ SEMPRE: Pré-checagem antes de inserir
const existing = await fetchExistingClientIdsByPhone(supabase, sellerId, phones);
if (existing.has(phone)) { /* update */ } else { /* insert */ }

// ✅ SEMPRE: Operações idempotentes
// ✅ SEMPRE: Filtrar por seller_id
\`\`\`

### 11.2 Zonas Protegidas (NÃO MEXER)
| Tipo | Arquivos/Funções |
|------|------------------|
| Edge Críticas | crypto, create-seller, setup-first-admin |
| RLS Base | profiles, user_roles, app_settings |
| Hooks Globais | useAuth, useClientValidation, useConnectionMonitor |
| Auto-gerados | client.ts, types.ts, config.toml, .env |

### 11.3 Padrão de Importação
\`\`\`
1. PARSE → 2. NORMALIZE → 3. VALIDATE → 4. DEDUPE → 5. BATCH → 6. LOG
Nunca insert direto. Sempre verificar existência primeiro.
\`\`\`

### 11.4 Checklist Pré-Deploy
- [ ] Cache limpo (testar aba anônima)
- [ ] Zero erros no console
- [ ] /system-health OK
- [ ] Login/CRUD funcionando
- [ ] RLS ativo em novas tabelas

---

## 12. OBSERVAÇÕES TÉCNICAS

### Performance
- React.lazy para code splitting
- useMemo/useCallback em listas grandes
- Debounce em buscas (300ms)
- Paginação client-side (20 items)

### Segurança
- RLS em todas as tabelas
- Criptografia de senhas (AES via edge function)
- Tokens de sessão com timeout
- Validação de fingerprint

### Mobile
- Menu bottom navigation
- Dialogs adaptados (Sheet no mobile)
- Touch-friendly buttons (min 44px)
- Scroll areas otimizadas

---

*Documento gerado automaticamente - PSControl v1.0*
*Padrões de manutenção: docs/MAINTENANCE_STANDARDS.md*
`;

export default function ProjectDocumentation() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(DOCUMENTATION);
      setCopied(true);
      toast.success('Documentação copiada!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Erro ao copiar');
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <Card className="max-w-5xl mx-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-primary" />
            <CardTitle>Documentação do Projeto</CardTitle>
          </div>
          <Button 
            onClick={handleCopy} 
            size="lg"
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="h-5 w-5" />
                Copiado!
              </>
            ) : (
              <>
                <Copy className="h-5 w-5" />
                Copiar Tudo
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[70vh] rounded-lg border bg-muted/30 p-4">
            <pre className="text-sm whitespace-pre-wrap font-mono">
              {DOCUMENTATION}
            </pre>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
