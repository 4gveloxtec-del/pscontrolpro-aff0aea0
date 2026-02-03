import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Plus, X, Server, Lock, Calendar, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ServerSearchSelect } from '@/components/ServerSearchSelect';

interface ServerData {
  server_id: string;
  server_name: string;
  login: string;
  password: string;
  expiration_date?: string | null; // Data de expiração individual
}

interface AdditionalServersSectionProps {
  servers: { id: string; name: string }[];
  additionalServers: ServerData[];
  onChange: (servers: ServerData[]) => void;
  // Legacy server 2 support for migration
  legacyServer2?: {
    server_id_2: string;
    server_name_2: string;
    login_2: string;
    password_2: string;
  };
  onLegacyServer2Change?: (data: { server_id_2: string; server_name_2: string; login_2: string; password_2: string }) => void;
}

export function AdditionalServersSection({
  servers,
  additionalServers,
  onChange,
  legacyServer2,
  onLegacyServer2Change,
}: AdditionalServersSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-expand if there are additional servers or legacy server 2
  useEffect(() => {
    if (additionalServers.length > 0 || legacyServer2?.server_id_2) {
      setIsExpanded(true);
    }
  }, [additionalServers.length, legacyServer2?.server_id_2]);

  const handleAddServer = () => {
    onChange([...additionalServers, { server_id: '', server_name: '', login: '', password: '', expiration_date: null }]);
  };

  const handleRemoveServer = (index: number) => {
    const updated = additionalServers.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleServerChange = (index: number, serverId: string, serverName: string) => {
    const updated = [...additionalServers];
    updated[index] = {
      ...updated[index],
      server_id: serverId,
      server_name: serverName,
    };
    onChange(updated);
  };

  const handleFieldChange = (index: number, field: 'login' | 'password' | 'expiration_date', value: string | null) => {
    const updated = [...additionalServers];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  // Handle legacy server 2 changes
  const handleLegacyServer2Change = (serverId: string, serverName: string) => {
    if (!onLegacyServer2Change) return;
    
    if (!serverId) {
      onLegacyServer2Change({ server_id_2: '', server_name_2: '', login_2: '', password_2: '' });
      return;
    }
    
    onLegacyServer2Change({
      ...legacyServer2!,
      server_id_2: serverId,
      server_name_2: serverName,
    });
  };

  const handleLegacyFieldChange = (field: 'login_2' | 'password_2', value: string) => {
    if (!onLegacyServer2Change || !legacyServer2) return;
    onLegacyServer2Change({ ...legacyServer2, [field]: value });
  };

  const removeLegacyServer2 = () => {
    if (!onLegacyServer2Change) return;
    onLegacyServer2Change({ server_id_2: '', server_name_2: '', login_2: '', password_2: '' });
  };

  const hasAnyServer = additionalServers.length > 0 || legacyServer2?.server_id_2;
  const totalServers = additionalServers.length + (legacyServer2?.server_id_2 ? 1 : 0);

  if (!isExpanded) {
    return (
      <div className="md:col-span-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsExpanded(true)}
          className="w-full border-dashed border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground"
        >
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Servidores Extras
        </Button>
      </div>
    );
  }

  return (
    <div className="md:col-span-2 space-y-3 p-4 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Server className="h-4 w-4 text-primary" />
          </div>
          <Label className="text-sm font-medium">
            Servidores Extras
            {totalServers > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({totalServers} configurado{totalServers > 1 ? 's' : ''})
              </span>
            )}
          </Label>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleAddServer}
            className="h-7 px-2 text-primary"
          >
            <Plus className="h-4 w-4 mr-1" />
            Adicionar
          </Button>
          {!hasAnyServer && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(false)}
              className="h-7 px-2 text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Legacy Server 2 - for backwards compatibility */}
        {legacyServer2 && onLegacyServer2Change && (
          <div className="space-y-3 p-3 rounded-lg border border-border/50 bg-secondary/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Servidor 2</span>
              {legacyServer2.server_id_2 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={removeLegacyServer2}
                  className="h-6 px-1.5 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Servidor</Label>
                <ServerSearchSelect
                  servers={servers}
                  value={legacyServer2.server_id_2}
                  onValueChange={handleLegacyServer2Change}
                  placeholder="Buscar servidor..."
                />
              </div>
              
              {legacyServer2.server_id_2 && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      Login
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    </Label>
                    <Input
                      className="h-9"
                      value={legacyServer2.login_2}
                      onChange={(e) => handleLegacyFieldChange('login_2', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      Senha
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    </Label>
                    <Input
                      className="h-9"
                      value={legacyServer2.password_2}
                      onChange={(e) => handleLegacyFieldChange('password_2', e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Dynamic Additional Servers */}
        {additionalServers.map((server, index) => (
          <div key={index} className="space-y-3 p-3 rounded-lg border border-border/50 bg-secondary/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Servidor {legacyServer2 ? index + 3 : index + 2}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveServer(index)}
                className="h-6 px-1.5 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Servidor</Label>
                <ServerSearchSelect
                  servers={servers}
                  value={server.server_id}
                  onValueChange={(serverId, serverName) => handleServerChange(index, serverId, serverName)}
                  placeholder="Buscar servidor..."
                />
              </div>
              
              {server.server_id && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      Login
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    </Label>
                    <Input
                      className="h-9"
                      value={server.login}
                      onChange={(e) => handleFieldChange(index, 'login', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      Senha
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    </Label>
                    <Input
                      className="h-9"
                      value={server.password}
                      onChange={(e) => handleFieldChange(index, 'password', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      Vencimento
                      <CalendarDays className="h-3 w-3 text-muted-foreground" />
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "h-9 w-full justify-start text-left font-normal",
                            !server.expiration_date && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {server.expiration_date 
                            ? format(new Date(server.expiration_date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })
                            : 'Usar data principal'
                          }
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <div className="p-2 border-b">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => handleFieldChange(index, 'expiration_date', null)}
                          >
                            Usar data principal do cliente
                          </Button>
                        </div>
                        <CalendarPicker
                          mode="single"
                          selected={server.expiration_date ? new Date(server.expiration_date + 'T12:00:00') : undefined}
                          onSelect={(date) => {
                            if (date) {
                              const dateStr = format(date, 'yyyy-MM-dd');
                              handleFieldChange(index, 'expiration_date', dateStr);
                            }
                          }}
                          initialFocus
                          locale={ptBR}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Empty state */}
        {!hasAnyServer && (
          <p className="text-xs text-center text-muted-foreground py-2">
            Clique em "Adicionar" para configurar servidores extras
          </p>
        )}
      </div>
    </div>
  );
}