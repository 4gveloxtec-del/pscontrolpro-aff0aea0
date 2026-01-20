import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar, getSidebarWidth } from './Sidebar';
import { BottomNavigation } from './BottomNavigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePrivacyMode } from '@/hooks/usePrivacyMode';
import { useMenuStyle } from '@/hooks/useMenuStyle';
import { FloatingNotifications } from '@/components/FloatingNotifications';
import { OnboardingTutorial } from '@/components/OnboardingTutorial';
import { OnboardingProgressBar } from '@/components/OnboardingProgressBar';
import { useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  Users,
  LogOut,
  EyeOff,
  Eye,
  Share2,
  RefreshCw,
  Clock,
  MessageCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { navItems, filterNavItems } from '@/config/navigation';

// Banner de período de teste
function TrialBanner({ daysRemaining }: { daysRemaining: number }) {
  const openAdminWhatsApp = () => {
    const phone = '5531998518865';
    const message = `Olá! Estou usando o período de teste do PSControl e gostaria de ativar minha conta como revendedor.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className={cn(
      "flex items-center justify-between gap-3 px-4 py-2 text-sm",
      daysRemaining <= 2 
        ? "bg-destructive/10 text-destructive border-b border-destructive/20" 
        : "bg-warning/10 text-warning border-b border-warning/20"
    )}>
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4" />
        <span>
          <strong>Período de teste:</strong> {daysRemaining} {daysRemaining === 1 ? 'dia restante' : 'dias restantes'}
        </span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={openAdminWhatsApp}
        className="gap-1 h-7 text-xs hover:bg-green-500/20"
      >
        <MessageCircle className="h-3 w-3" />
        Ativar conta
      </Button>
    </div>
  );
}

function MobileMenuContent({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, isAdmin, isSeller, signOut } = useAuth();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();
  const { menuStyle } = useMenuStyle();
  const location = useLocation();

  const filteredNavItems = filterNavItems(navItems, isAdmin, isSeller);

  const isCompact = menuStyle === 'compact';
  const isIconsOnly = menuStyle === 'icons-only';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center h-14 px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Users className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-sidebar-foreground">PSControl</span>
        </div>
      </div>

      <nav className={cn(
        "flex-1 overflow-y-auto py-3",
        isCompact || isIconsOnly ? "px-3" : "px-2"
      )}>
        <div className={cn(
          isCompact || isIconsOnly ? "grid gap-2" : "space-y-0.5",
          isCompact && "grid-cols-2",
          isIconsOnly && "grid-cols-4"
        )}>
          {filteredNavItems.map((item: any) => {
            const isActive = location.pathname === item.href;

            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={onNavigate}
                className={cn(
                  'rounded-lg transition-all duration-200',
                  isIconsOnly
                    ? 'h-11 flex items-center justify-center'
                    : isCompact
                      ? 'flex flex-col items-center gap-2 p-3'
                      : 'flex items-center gap-3 px-3 py-2',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
                aria-label={isIconsOnly ? item.title : undefined}
                title={isIconsOnly ? item.title : undefined}
              >
                <item.icon
                  className={cn(
                    isIconsOnly ? 'w-5 h-5' : isCompact ? 'w-6 h-6' : 'w-5 h-5 flex-shrink-0'
                  )}
                />
                {isIconsOnly ? (
                  <span className="sr-only">{item.title}</span>
                ) : (
                  <span className={cn(isCompact ? 'text-[11px] font-medium text-center leading-tight' : 'text-sm font-medium')}>
                    {item.title}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isPrivacyMode ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full justify-start',
                  isPrivacyMode && 'bg-warning/20 text-warning hover:bg-warning/30'
                )}
                onClick={togglePrivacyMode}
              >
                {isPrivacyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span className="ml-2">{isPrivacyMode ? 'Privacidade ON' : 'Ocultar Dados'}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{isPrivacyMode ? 'Desativar modo privacidade' : 'Ocultar dados sensíveis'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="mb-1 px-2">
          <p className="text-xs text-sidebar-foreground/60 truncate">
            {profile?.full_name || profile?.email}
          </p>
          <p className={cn(
            "text-xs font-medium",
            isAdmin ? "text-primary" : isSeller ? "text-success" : "text-warning"
          )}>
            {isAdmin ? 'Administrador' : isSeller ? 'Vendedor' : 'Usuário'}
          </p>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-destructive"
          onClick={signOut}
        >
          <LogOut className="w-4 h-4" />
          <span className="ml-2">Sair</span>
        </Button>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { user, loading, hasSystemAccess, trialInfo, isUser } = useAuth();
  const isMobile = useIsMobile();
  const { menuStyle } = useMenuStyle();
  const [menuOpen, setMenuOpen] = useState(false);
  
  const showTrialBanner = isUser && trialInfo.isInTrial;

  const sidebarWidth = getSidebarWidth(menuStyle);
  const isIconsOnly = menuStyle === 'icons-only';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Se usuário não tem acesso ao sistema (role = 'user'), redireciona
  if (!hasSystemAccess) {
    return <Navigate to="/access-denied" replace />;
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/landing`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'PSControl',
          text: 'Confira este aplicativo de gerenciamento de clientes!',
          url: url,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          navigator.clipboard.writeText(url);
          toast.success('Link copiado!');
        }
      }
    } else {
      navigator.clipboard.writeText(url);
      toast.success('Link copiado!');
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background">
      {/* Trial Banner - shows for users in trial period */}
      {showTrialBanner && (
        <div 
          className="fixed right-0 z-[60] transition-smooth safe-area-top"
          style={!isMobile ? { left: sidebarWidth, top: 0 } : { left: 0, top: 'env(safe-area-inset-top)' }}
        >
          <TrialBanner daysRemaining={trialInfo.daysRemaining} />
        </div>
      )}

      {/* Top Action Bar - Desktop only */}
      {!isMobile && (
        <div 
          className={cn(
            "fixed right-0 z-50 p-2 bg-background/80 backdrop-blur-sm transition-smooth",
            showTrialBanner ? "top-10" : "top-0"
          )}
          style={{ left: sidebarWidth }}
        >
          <div className="flex justify-end gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="gap-2 bg-background border-border touch-target"
              title="Atualizar"
            >
              <RefreshCw className="h-4 w-4" />
              {!isIconsOnly && <span>Atualizar</span>}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="gap-2 bg-background border-border touch-target"
              title="Compartilhar"
            >
              <Share2 className="h-4 w-4" />
              {!isIconsOnly && <span>Compartilhar</span>}
            </Button>
          </div>
        </div>
      )}
      
      <Sidebar />
      <main 
        className={cn(
          "min-h-screen transition-smooth",
          showTrialBanner ? "pt-20 sm:pt-[88px]" : "pt-14 sm:pt-12"
        )}
        style={{
          paddingLeft: !isMobile ? sidebarWidth : undefined,
          paddingBottom: isMobile ? 'calc(5rem + env(safe-area-inset-bottom))' : undefined
        }}
      >
        <div className={cn(
          "p-responsive animate-fade-in",
          isMobile ? "pb-4" : ""
        )}>
          <Outlet />
        </div>
      </main>
      {isMobile && (
        <>
          <BottomNavigation onMenuClick={() => setMenuOpen(true)} />
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetContent 
              side="left" 
              className="w-[280px] max-w-[85vw] p-0 bg-sidebar border-sidebar-border"
            >
              <MobileMenuContent onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
        </>
      )}
      <FloatingNotifications />
      <OnboardingTutorial />
      <OnboardingProgressBar />
    </div>
  );
}
