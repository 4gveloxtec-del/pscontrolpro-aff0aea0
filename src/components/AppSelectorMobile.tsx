import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Monitor, Mail, ChevronDown, X } from 'lucide-react';
import type { ExternalApp } from './ExternalAppsManager';
import { useIsInsideDialog } from '@/contexts/DialogContext';

interface AppSelectorMobileProps {
  value: string;
  onValueChange: (value: string) => void;
  groupedApps: {
    system: ExternalApp[];
    custom: ExternalApp[];
    reseller: ExternalApp[];
  };
  availableApps: ExternalApp[];
}

/**
 * InlineAppSelector - used when inside a Dialog to avoid portal conflicts.
 * Renders inline dropdown instead of a Drawer to prevent removeChild errors.
 */
function InlineAppSelector({ 
  value, 
  onValueChange, 
  groupedApps,
  availableApps
}: AppSelectorMobileProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedApp = availableApps.find(a => a.id === value);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleSelect = (appId: string) => {
    onValueChange(appId);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Button 
        type="button"
        variant="outline" 
        className="h-8 w-full justify-between text-sm font-normal"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <span className="truncate">
          {selectedApp ? selectedApp.name : 'Selecione um app'}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>
      
      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border rounded-lg shadow-lg max-h-[300px] overflow-y-auto">
          <div className="p-2 space-y-3">
            {/* Apps do Revendedor */}
            <div>
              <div className="text-xs font-semibold text-primary py-1 px-1">
                🏪 Apps do Revendedor
              </div>
              {groupedApps.reseller.length === 0 ? (
                <div className="px-2 py-2 text-xs text-muted-foreground italic text-center">
                  Nenhum app cadastrado
                </div>
              ) : (
                <div className="space-y-0.5">
                  {groupedApps.reseller.map((app) => (
                    <Button
                      key={app.id}
                      type="button"
                      variant={value === app.id ? "secondary" : "ghost"}
                      className="w-full justify-start h-8 text-sm"
                      onClick={() => handleSelect(app.id)}
                    >
                      <Monitor className="h-3.5 w-3.5 mr-2 text-primary" />
                      <span className="truncate">{app.name}</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Meus Apps Personalizados */}
            {groupedApps.custom.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-accent-foreground py-1 px-1">
                  ⭐ Meus Apps
                </div>
                <div className="space-y-0.5">
                  {groupedApps.custom.map((app) => (
                    <Button
                      key={app.id}
                      type="button"
                      variant={value === app.id ? "secondary" : "ghost"}
                      className="w-full justify-start h-8 text-sm"
                      onClick={() => handleSelect(app.id)}
                    >
                      {app.auth_type === 'mac_key' ? (
                        <Monitor className="h-3.5 w-3.5 mr-2 text-accent-foreground" />
                      ) : (
                        <Mail className="h-3.5 w-3.5 mr-2 text-accent-foreground" />
                      )}
                      <span className="truncate flex-1 text-left">{app.name}</span>
                      {(app.price || 0) > 0 && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 ml-1">
                          R$ {app.price}
                        </Badge>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Apps do Sistema */}
            <div>
              <div className="text-xs text-muted-foreground py-1 px-1">
                📦 Apps do Sistema ({groupedApps.system.length})
              </div>
              <div className="space-y-0.5">
                {groupedApps.system.map((app) => (
                  <Button
                    key={app.id}
                    type="button"
                    variant={value === app.id ? "secondary" : "ghost"}
                    className="w-full justify-start h-7 text-sm"
                    onClick={() => handleSelect(app.id)}
                  >
                    <Monitor className="h-3 w-3 mr-2 text-muted-foreground" />
                    <span className="truncate">{app.name}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppSelectorMobile({ 
  value, 
  onValueChange, 
  groupedApps,
  availableApps
}: AppSelectorMobileProps) {
  // Detect if we're inside a Dialog to avoid portal conflicts
  const isInsideDialog = useIsInsideDialog();
  
  // When inside a Dialog, use inline selector to prevent removeChild errors
  if (isInsideDialog) {
    return (
      <InlineAppSelector
        value={value}
        onValueChange={onValueChange}
        groupedApps={groupedApps}
        availableApps={availableApps}
      />
    );
  }
  
  // Standard Drawer-based selector for standalone use
  const [open, setOpen] = useState(false);
  const selectedApp = availableApps.find(a => a.id === value);

  const handleSelect = (appId: string) => {
    onValueChange(appId);
    setOpen(false);
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button 
          variant="outline" 
          className="h-8 w-full justify-between text-sm font-normal"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="truncate">
            {selectedApp ? selectedApp.name : 'Selecione um app'}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle>Selecione um App</DrawerTitle>
        </DrawerHeader>
        <ScrollArea className="h-[60vh] px-4 pb-4">
          <div className="space-y-4">
            {/* Apps do Revendedor */}
            <div>
              <div className="text-xs font-semibold text-primary py-2 px-1 sticky top-0 bg-background">
                🏪 Apps do Revendedor
              </div>
              {groupedApps.reseller.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground italic text-center">
                  Nenhum app cadastrado
                </div>
              ) : (
                <div className="space-y-1">
                  {groupedApps.reseller.map((app) => (
                    <Button
                      key={app.id}
                      variant={value === app.id ? "secondary" : "ghost"}
                      className="w-full justify-start h-10 text-sm"
                      onClick={() => handleSelect(app.id)}
                    >
                      <Monitor className="h-4 w-4 mr-2 text-primary" />
                      <span className="truncate">{app.name}</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Meus Apps Personalizados */}
            {groupedApps.custom.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-accent-foreground py-2 px-1 sticky top-0 bg-background">
                  ⭐ Meus Apps
                </div>
                <div className="space-y-1">
                  {groupedApps.custom.map((app) => (
                    <Button
                      key={app.id}
                      variant={value === app.id ? "secondary" : "ghost"}
                      className="w-full justify-start h-10 text-sm"
                      onClick={() => handleSelect(app.id)}
                    >
                      {app.auth_type === 'mac_key' ? (
                        <Monitor className="h-4 w-4 mr-2 text-accent-foreground" />
                      ) : (
                        <Mail className="h-4 w-4 mr-2 text-accent-foreground" />
                      )}
                      <span className="truncate flex-1 text-left">{app.name}</span>
                      {(app.price || 0) > 0 && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 ml-1">
                          R$ {app.price}
                        </Badge>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Apps do Sistema */}
            <div>
              <div className="text-xs text-muted-foreground py-2 px-1 sticky top-0 bg-background">
                📦 Apps do Sistema ({groupedApps.system.length})
              </div>
              <div className="space-y-0.5">
                {groupedApps.system.map((app) => (
                  <Button
                    key={app.id}
                    variant={value === app.id ? "secondary" : "ghost"}
                    className="w-full justify-start h-9 text-sm"
                    onClick={() => handleSelect(app.id)}
                  >
                    <Monitor className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    <span className="truncate">{app.name}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
