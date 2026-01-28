import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Monitor, Mail, ChevronDown } from 'lucide-react';
import type { ExternalApp } from './ExternalAppsManager';

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

export function AppSelectorMobile({ 
  value, 
  onValueChange, 
  groupedApps,
  availableApps
}: AppSelectorMobileProps) {
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
