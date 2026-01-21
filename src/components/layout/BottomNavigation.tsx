import { forwardRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Menu, LayoutDashboard, Server, Package, Users, AppWindow, UserCog, BarChart3 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface BottomNavigationProps {
  onMenuClick: () => void;
}

// Items para sellers (revendedores)
const sellerNavItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Server, label: 'Servidor', href: '/servers' },
  { icon: Package, label: 'Planos', href: '/plans' },
  { icon: Users, label: 'Clientes', href: '/clients' },
  { icon: AppWindow, label: 'Apps', href: '/external-apps' },
];

// Items para admin
const adminNavItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: UserCog, label: 'Vendedores', href: '/sellers' },
  { icon: BarChart3, label: 'Relatórios', href: '/reports' },
];

export const BottomNavigation = forwardRef<HTMLElement, BottomNavigationProps>(
  function BottomNavigation({ onMenuClick }, ref) {
    const navigate = useNavigate();
    const location = useLocation();
    const { isAdmin } = useAuth();

    // Admin vê itens de gestão, seller vê itens de clientes
    const quickNavItems = isAdmin ? adminNavItems : sellerNavItems;

    return (
      <nav 
        ref={ref} 
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{ 
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)'
        }}
      >
        <div className="mx-2 mb-2 sm:mx-3">
          <div className="bg-gradient-to-r from-sidebar via-sidebar to-sidebar/95 border border-sidebar-border/50 rounded-2xl shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="flex items-center justify-between h-16 sm:h-14 px-1">
              {/* Quick Nav Items */}
              <div className="flex items-center flex-1 justify-around">
                {quickNavItems.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <button
                      key={item.href}
                      onClick={() => {
                        // Avoid pushing the same route again (prevents subtle double-tap side effects)
                        if (!isActive) navigate(item.href);
                      }}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1 min-w-[3.5rem] sm:min-w-[3rem] min-h-[3.5rem] sm:min-h-[3rem] px-1.5 py-1.5 rounded-xl transition-smooth active:scale-95 touch-target',
                        isActive
                          ? 'text-primary bg-primary/10'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      )}
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      <span className="text-[9px] sm:text-[10px] font-medium leading-none truncate max-w-full">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Menu Button */}
              <button
                onClick={onMenuClick}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 min-w-[3.5rem] sm:min-w-[3rem] min-h-[3.5rem] sm:min-h-[3rem] px-2 py-1.5 rounded-xl touch-target',
                  'bg-gradient-to-r from-primary/20 to-primary/10',
                  'text-primary',
                  'hover:from-primary/30 hover:to-primary/15',
                  'active:scale-95 transition-smooth',
                  'border border-primary/20'
                )}
              >
                <Menu className="h-5 w-5 flex-shrink-0" />
                <span className="text-[9px] sm:text-[10px] font-medium leading-none">Menu</span>
              </button>
            </div>
          </div>
        </div>
      </nav>
    );
  }
);
