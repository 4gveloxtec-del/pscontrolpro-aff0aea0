import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePrivacyMode } from '@/hooks/usePrivacyMode';
import { useMenuStyle } from '@/hooks/useMenuStyle';
import { cn } from '@/lib/utils';
import {
  LogOut,
  EyeOff,
  Eye,
  RefreshCw,
  Share2,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { navGroups, filterNavGroups } from '@/config/navigation';

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, profile, role, authState, isAdmin, isSeller, signOut } = useAuth();
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();
  const { menuStyle } = useMenuStyle();
  const location = useLocation();

  const identityLabel = profile?.full_name || profile?.email || user?.email || '';
  const shortName = (profile?.full_name || profile?.email || user?.email || 'U').split('@')[0];
  const avatarInitial = (profile?.full_name || profile?.email || user?.email || 'U').charAt(0).toUpperCase();
  const roleLabel = authState === 'authenticated' && !role
    ? 'Carregando...'
    : isAdmin
      ? 'Administrador'
      : 'Vendedor';

  const filteredGroups = filterNavGroups(navGroups, isAdmin, isSeller);

  const isCompact = menuStyle === 'compact';
  const isIconsOnly = menuStyle === 'icons-only';

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-sidebar to-sidebar/95">
      {/* Header com Logo */}
      <div className={cn(
        "flex items-center border-b border-sidebar-border/50",
        isIconsOnly ? "h-14 justify-center px-2" : "h-16 px-5"
      )}>
        <div className={cn("flex items-center", isIconsOnly ? "gap-0" : "gap-3")}>
          <div className="relative">
            <div className={cn(
              "rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/25",
              isIconsOnly ? "w-9 h-9" : "w-10 h-10"
            )}>
              <Sparkles className={cn(isIconsOnly ? "w-4 h-4" : "w-5 h-5", "text-primary-foreground")} />
            </div>
            {!isIconsOnly && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-sidebar" />
            )}
          </div>
          {!isIconsOnly && (
            <div>
              <span className="font-bold text-lg text-sidebar-foreground tracking-tight">PSControl</span>
              <p className="text-[10px] text-sidebar-foreground/50 -mt-0.5">Gerenciamento Pro</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className={cn(
          "space-y-6",
          isIconsOnly ? "px-2" : isCompact ? "px-2" : "px-3"
        )}>
          {filteredGroups.map((group) => (
            <div key={group.title}>
              {/* Group title - hidden in icons-only mode */}
              {!isIconsOnly && (
                <div className="flex items-center gap-2 px-3 mb-2">
                  <div className="h-px flex-1 bg-gradient-to-r from-sidebar-border/80 to-transparent" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/40">
                    {group.title}
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-l from-sidebar-border/80 to-transparent" />
                </div>
              )}
              
              {/* Items grid for compact/icons-only, list for default */}
              <div className={cn(
                isCompact || isIconsOnly
                  ? "grid gap-2"
                  : "space-y-1",
                isCompact && "grid-cols-2",
                isIconsOnly && "grid-cols-1 gap-1"
              )}>
                {group.items.map((item) => {
                  const isActive = location.pathname === item.href;
                  
                  // Icons-only style
                  if (isIconsOnly) {
                    return (
                      <TooltipProvider key={item.href}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              to={item.href}
                              onClick={onNavigate}
                              className={cn(
                                'flex items-center justify-center w-full h-10 rounded-lg transition-all duration-200',
                                isActive
                                  ? 'bg-primary/20 text-primary'
                                  : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                              )}
                            >
                              <item.icon className="w-5 h-5" />
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p>{item.title}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  }
                  
                  // Compact style - big icons with text below
                  if (isCompact) {
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        onClick={onNavigate}
                        className={cn(
                          'group flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all duration-200',
                          isActive
                            ? 'bg-gradient-to-b from-primary/20 to-primary/5 text-primary shadow-sm'
                            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                        )}
                      >
                        <div className={cn(
                          'w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200',
                          isActive 
                            ? 'bg-primary/20' 
                            : 'bg-sidebar-accent/30 group-hover:bg-sidebar-accent'
                        )}>
                          <item.icon className={cn(
                            'w-6 h-6 transition-transform duration-200 group-hover:scale-110',
                            isActive && 'text-primary'
                          )} />
                        </div>
                        <span className="text-[11px] font-medium text-center leading-tight">{item.title}</span>
                      </Link>
                    );
                  }
                  
                  // Default style
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={onNavigate}
                      className={cn(
                        'group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 relative overflow-hidden',
                        isActive
                          ? 'bg-gradient-to-r from-primary/20 to-primary/5 text-primary shadow-sm'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                      )}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                      )}
                      <div className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300',
                        isActive 
                          ? 'bg-primary/20' 
                          : 'bg-sidebar-accent/30 group-hover:bg-sidebar-accent'
                      )}>
                        <item.icon className={cn(
                          'w-4.5 h-4.5 transition-transform duration-300 group-hover:scale-110',
                          isActive && 'text-primary'
                        )} />
                      </div>
                      <span className="text-sm font-medium flex-1">{item.title}</span>
                      <ChevronRight className={cn(
                        'w-4 h-4 opacity-0 -translate-x-2 transition-all duration-300',
                        'group-hover:opacity-50 group-hover:translate-x-0',
                        isActive && 'opacity-70 translate-x-0'
                      )} />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className={cn(
        "border-t border-sidebar-border/50 bg-sidebar-accent/20",
        isIconsOnly ? "p-2 space-y-2" : "p-4 space-y-3"
      )}>
        {/* Privacy Toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={togglePrivacyMode}
                className={cn(
                  'w-full flex items-center rounded-xl transition-all duration-300',
                  isIconsOnly 
                    ? 'justify-center p-2' 
                    : 'gap-3 px-3 py-2.5',
                  isPrivacyMode 
                    ? 'bg-warning/15 text-warning border border-warning/30' 
                    : 'bg-sidebar-accent/50 text-sidebar-foreground/70 hover:bg-sidebar-accent'
                )}
              >
                <div className={cn(
                  'rounded-lg flex items-center justify-center',
                  isIconsOnly ? 'w-8 h-8' : 'w-9 h-9',
                  isPrivacyMode ? 'bg-warning/20' : 'bg-sidebar-accent'
                )}>
                  {isPrivacyMode ? (
                    <EyeOff className={cn(isIconsOnly ? 'w-4 h-4' : 'w-4.5 h-4.5')} />
                  ) : (
                    <Eye className={cn(isIconsOnly ? 'w-4 h-4' : 'w-4.5 h-4.5')} />
                  )}
                </div>
                {!isIconsOnly && (
                  <span className="text-sm font-medium">
                    {isPrivacyMode ? 'Modo Privado' : 'Ocultar Dados'}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{isPrivacyMode ? 'Desativar modo privacidade' : 'Ocultar dados sensíveis'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* User Info Card */}
        {isIconsOnly ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={signOut}
                  className="w-full flex items-center justify-center p-2 rounded-xl bg-sidebar-accent/40 border border-sidebar-border/30 hover:bg-destructive/10 hover:border-destructive/30 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">
                          {avatarInitial}
                    </span>
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                    <p>Sair ({shortName})</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-sidebar-accent/40 border border-sidebar-border/30">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">
                    {avatarInitial}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                    {identityLabel || shortName}
              </p>
              <p className={cn(
                'text-xs font-medium',
                isAdmin ? 'text-primary' : 'text-success'
              )}>
                    {roleLabel}
              </p>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={signOut}
                    className="h-8 w-8 text-sidebar-foreground/50 hover:text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Sair</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
        
        {/* Version */}
        <div className={cn(
          "text-center text-[10px] text-sidebar-foreground/30 pt-2",
          isIconsOnly && "text-[8px]"
        )}>
          v2.0
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const isMobile = useIsMobile();
  const { menuStyle } = useMenuStyle();

  const isIconsOnly = menuStyle === 'icons-only';
  const sidebarWidth = isIconsOnly ? 'w-16' : 'w-60';

  if (isMobile) {
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

    // Mobile navigation drawer is centralized in AppLayout.
    // Sidebar on mobile only renders the top header (no local Sheet state),
    // preventing duplicated state and extra mount/unmount work on route changes.
    return (
      <>
        {/* Mobile Header with safe area */}
        <header 
          className="fixed left-0 right-0 z-50 h-14 bg-gradient-to-r from-sidebar via-sidebar to-sidebar/95 border-b border-sidebar-border/50 backdrop-blur-lg flex items-center justify-between px-4"
          style={{ top: 'env(safe-area-inset-top)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-sidebar-foreground tracking-tight">PSControl</span>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              className="h-10 w-10 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 rounded-xl touch-target"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleShare}
              className="h-10 w-10 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 rounded-xl touch-target"
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </header>
        {/* Spacer for fixed header + safe area */}
        <div style={{ height: 'calc(3.5rem + env(safe-area-inset-top))' }} />
      </>
    );
  }

  // Desktop
  return (
    <aside className={cn(
      "fixed left-0 top-0 z-40 h-screen bg-sidebar border-r border-sidebar-border/50 shadow-xl shadow-sidebar/10 transition-all duration-300",
      sidebarWidth
    )}>
      <SidebarContent />
    </aside>
  );
}

export function useSidebarSheet() {
  const [open, setOpen] = useState(false);
  return { open, setOpen };
}

export function getSidebarWidth(menuStyle: 'default' | 'compact' | 'icons-only') {
  return menuStyle === 'icons-only' ? '4rem' : '15rem';
}
