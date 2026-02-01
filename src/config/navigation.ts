import {
  // Principal - Ícones modernos e elegantes
  LayoutGrid,
  UsersRound,
  
  // Apps - Ícones de dispositivos
  TabletSmartphone,
  Layers3,
  
  // Infraestrutura - Ícones técnicos
  HardDrive,
  Network,
  Globe2,
  Gem,
  
  // Financeiro - Ícones elegantes
  Wallet,
  Ticket,
  Gift,
  
  // Mensagens - Ícones de comunicação
  MessageCircleCode,
  BotMessageSquare,
  BellRing,
  TerminalSquare,
  FileText,
  ClockArrowUp,
  
  // Sistema - Ícones administrativos
  GraduationCap,
  ShieldCheck,
  ServerCog,
  Activity,
  TrendingUp,
  DatabaseBackup,
  SlidersHorizontal,
} from 'lucide-react';

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  sellerOnly?: boolean; // Apenas sellers veem este item (admin NÃO vê)
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * Configuração centralizada de navegação
 * Usado tanto no Sidebar (Desktop) quanto no Menu Mobile
 * 
 * adminOnly: Apenas admins veem
 * sellerOnly: Apenas sellers veem (admin NÃO vê - são itens específicos de revenda)
 */
export const navGroups: NavGroup[] = [
  {
    title: 'Principal',
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: LayoutGrid },
      { title: 'Clientes', href: '/clientes', icon: UsersRound, sellerOnly: true },
    ],
  },
  {
    title: 'Apps',
    items: [
      { title: 'Apps do Revendedor', href: '/my-apps', icon: TabletSmartphone, sellerOnly: true },
      { title: 'Apps Pagos', href: '/external-apps', icon: Layers3, sellerOnly: true },
    ],
  },
  {
    title: 'Infraestrutura',
    items: [
      { title: 'Servidores', href: '/servers', icon: HardDrive, sellerOnly: true },
      { title: 'Revendedores', href: '/panel-resellers', icon: Network, sellerOnly: true },
      { title: 'Painéis', href: '/panels', icon: Globe2, sellerOnly: true },
      { title: 'Planos', href: '/plans', icon: Gem, sellerOnly: true },
    ],
  },
  {
    title: 'Financeiro',
    items: [
      { title: 'Contas a Pagar', href: '/bills', icon: Wallet, sellerOnly: true },
      { title: 'Cupons', href: '/coupons', icon: Ticket, sellerOnly: true },
      { title: 'Indicações', href: '/referrals', icon: Gift, sellerOnly: true },
    ],
  },
  {
    title: 'Mensagens',
    items: [
      { title: 'Conectar WhatsApp', href: '/whatsapp-automation', icon: MessageCircleCode },
      { title: 'Chatbot', href: '/bot-engine', icon: BotMessageSquare },
      { title: 'Lembretes', href: '/reminders', icon: BellRing, sellerOnly: true },
      { title: 'Comandos de Teste', href: '/test-commands', icon: TerminalSquare, sellerOnly: true },
      { title: 'Templates', href: '/templates', icon: FileText },
      { title: 'Histórico', href: '/message-history', icon: ClockArrowUp, sellerOnly: true },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { title: 'Tutoriais', href: '/tutorials', icon: GraduationCap },
      { title: 'Vendedores', href: '/sellers', icon: ShieldCheck, adminOnly: true },
      { title: 'Templates Servidores', href: '/server-templates', icon: ServerCog, adminOnly: true },
      { title: 'Autocura', href: '/admin/system-health', icon: Activity, adminOnly: true },
      { title: 'Relatórios', href: '/reports', icon: TrendingUp, adminOnly: true },
      { title: 'Backup', href: '/backup', icon: DatabaseBackup, adminOnly: true },
      { title: 'Configurações', href: '/settings', icon: SlidersHorizontal },
    ],
  },
];

/**
 * Lista plana de todos os itens de navegação (para uso em menus simplificados)
 */
export const navItems: NavItem[] = navGroups.flatMap((group) => group.items);

/**
 * Filtra itens de navegação baseado nas permissões do usuário
 * 
 * Lógica:
 * - adminOnly: Apenas admins veem
 * - sellerOnly: Apenas sellers veem (admins NÃO veem - são itens de gestão de clientes)
 * - Sem flag: Todos veem
 */
export function filterNavItems(items: NavItem[], isAdmin: boolean, isSeller: boolean): NavItem[] {
  return items.filter((item) => {
    // Item só para admins
    if (item.adminOnly) return isAdmin;
    // Item só para sellers (admin NÃO vê itens de gestão de clientes)
    if (item.sellerOnly) return isSeller && !isAdmin;
    // Sem restrição, todos veem
    return true;
  });
}

/**
 * Filtra grupos de navegação baseado nas permissões do usuário
 */
export function filterNavGroups(groups: NavGroup[], isAdmin: boolean, isSeller: boolean): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: filterNavItems(group.items, isAdmin, isSeller),
    }))
    .filter((group) => group.items.length > 0);
}
