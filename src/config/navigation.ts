import {
  LayoutDashboard,
  Users,
  Server,
  CreditCard,
  Tag,
  UserPlus,
  MessageSquare,
  Settings,
  UserCog,
  BarChart3,
  Package,
  Database,
  PlayCircle,
  History,
  Globe,
  AppWindow,
  UsersRound,
  Bot,
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
      { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { title: 'Clientes', href: '/clients', icon: Users, sellerOnly: true },
      { title: 'Apps Pagos', href: '/external-apps', icon: AppWindow, sellerOnly: true },
      { title: 'Servidores', href: '/servers', icon: Server, sellerOnly: true },
      { title: 'Revendedores', href: '/panel-resellers', icon: UsersRound, sellerOnly: true },
      { title: 'Painéis', href: '/panels', icon: Globe, sellerOnly: true },
      { title: 'Planos', href: '/plans', icon: Package, sellerOnly: true },
    ],
  },
  {
    title: 'Financeiro',
    items: [
      { title: 'Contas a Pagar', href: '/bills', icon: CreditCard, sellerOnly: true },
      { title: 'Cupons', href: '/coupons', icon: Tag, sellerOnly: true },
      { title: 'Indicações', href: '/referrals', icon: UserPlus, sellerOnly: true },
    ],
  },
  {
    title: 'Mensagens',
    items: [
      { title: 'Automação WhatsApp', href: '/whatsapp-automation', icon: Bot },
      { title: 'Chatbot', href: '/chatbot', icon: MessageSquare },
      { title: 'Templates', href: '/templates', icon: MessageSquare },
      { title: 'Histórico', href: '/message-history', icon: History, sellerOnly: true },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { title: 'Tutoriais', href: '/tutorials', icon: PlayCircle },
      { title: 'Vendedores', href: '/sellers', icon: UserCog, adminOnly: true },
      { title: 'Templates Servidores', href: '/server-templates', icon: Server, adminOnly: true },
      { title: 'Relatórios', href: '/reports', icon: BarChart3, adminOnly: true },
      { title: 'Backup', href: '/backup', icon: Database, adminOnly: true },
      { title: 'Configurações', href: '/settings', icon: Settings },
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
