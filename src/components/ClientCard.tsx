import { memo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Phone, Calendar as CalendarIcon, CreditCard, 
  Copy, DollarSign, Globe, Server, 
  MessageCircle, RefreshCw, Edit, Archive, Trash2,
  Lock, Loader2, Tv, AppWindow,
  CheckCircle2, AlertCircle, XCircle, ExternalLink
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AdditionalServer {
  server_id: string;
  server_name: string;
  login?: string;
  password?: string;
}

interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  device: string | null;
  device_model: string | null;
  app_name: string | null;
  dns: string | null;
  expiration_date: string;
  plan_name: string | null;
  plan_price: number | null;
  server_name: string | null;
  server_name_2: string | null;
  login: string | null;
  password: string | null;
  login_2: string | null;
  password_2: string | null;
  category: string | null;
  is_paid: boolean;
  pending_amount: number | null;
  notes: string | null;
  created_at: string | null;
  is_archived: boolean | null;
  additional_servers?: AdditionalServer[] | null;
}

interface DecryptedCredentials {
  login: string;
  password: string;
  login_2?: string;
  password_2?: string;
}

type ClientStatus = 'active' | 'expiring' | 'expired';

interface ServerInfo {
  id: string;
  name: string;
  panel_url?: string | null;
}

interface ClientCardProps {
  client: Client;
  status: ClientStatus;
  isDecrypted: boolean;
  isDecrypting: boolean;
  decryptedCredentials?: DecryptedCredentials;
  isPrivacyMode: boolean;
  isAdmin: boolean;
  isSent: boolean;
  servers?: ServerInfo[];
  onEdit: (client: Client) => void;
  onMessage: (client: Client) => void;
  onRenew: (client: Client) => void;
  onArchive: (client: Client) => void;
  onDelete: (client: Client) => void;
  onDecrypt: (client: Client) => void;
  onMarkPaid: (client: Client) => void;
  maskData: (data: string, type: 'name' | 'phone' | 'email' | 'credentials') => string;
  statusLabels: Record<ClientStatus, string>;
}

const statusIcons: Record<ClientStatus, typeof CheckCircle2> = {
  active: CheckCircle2,
  expiring: AlertCircle,
  expired: XCircle,
};

export const ClientCard = memo(function ClientCard({
  client,
  status,
  isDecrypted,
  isDecrypting,
  decryptedCredentials,
  isPrivacyMode,
  isAdmin,
  isSent,
  servers = [],
  onEdit,
  onMessage,
  onRenew,
  onArchive,
  onDelete,
  onDecrypt,
  onMarkPaid,
  maskData,
  statusLabels,
}: ClientCardProps) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const expirationDate = new Date(client.expiration_date + 'T12:00:00');
  const daysLeft = differenceInDays(expirationDate, today);
  const hasCredentials = client.login || client.password;
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const isRecentlyAdded = client.created_at && new Date(client.created_at) > twoHoursAgo;
  const categoryName = typeof client.category === 'object' ? (client.category as any)?.name : client.category;
  const isReseller = categoryName === 'Revendedor';
  const StatusIcon = statusIcons[status];

  const handleCopyDns = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (client.dns) {
      navigator.clipboard.writeText(client.dns);
      toast.success('DNS copiado!');
    }
  }, [client.dns]);

  const handleCopyCredentials = useCallback((e: React.MouseEvent, text: string, type: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    toast.success(`${type} copiado!`);
  }, []);

  // Find server info by name to get panel_url
  const getServerByName = useCallback((serverName: string): ServerInfo | undefined => {
    return servers.find(s => s.name === serverName);
  }, [servers]);

  // Handle server badge click - opens panel URL if available
  const handleServerClick = useCallback((e: React.MouseEvent, serverName: string) => {
    e.stopPropagation();
    const server = getServerByName(serverName);
    
    if (server?.panel_url) {
      // Open panel URL in new tab
      window.open(server.panel_url, '_blank', 'noopener,noreferrer');
      toast.success(`Abrindo painel: ${serverName}`);
    } else {
      toast.info(`Servidor "${serverName}" não possui link de painel cadastrado`);
    }
  }, [getServerByName]);
  
  // Check if server has panel URL
  const serverHasPanel = useCallback((serverName: string): boolean => {
    return !!getServerByName(serverName)?.panel_url;
  }, [getServerByName]);

  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-all duration-300',
        'hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5',
        'border border-border/50 bg-gradient-to-br from-card to-card/80',
        isRecentlyAdded && 'ring-2 ring-primary/40 shadow-lg shadow-primary/10',
        isReseller && !isAdmin && 'bg-gradient-to-br from-purple-500/5 to-card'
      )}
    >
      {/* Status indicator bar */}
      <div className={cn(
        'absolute top-0 left-0 right-0 h-1',
        status === 'active' && 'bg-gradient-to-r from-green-500 to-emerald-400',
        status === 'expiring' && 'bg-gradient-to-r from-yellow-500 to-orange-400',
        status === 'expired' && 'bg-gradient-to-r from-red-500 to-rose-400'
      )} />

      <CardContent className="p-3 sm:p-4 pt-4 sm:pt-5">
        {/* Header Section */}
        <div className="flex items-start gap-2 sm:gap-3 mb-3 sm:mb-4">
          {/* Avatar */}
          <div className={cn(
            'flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-base sm:text-lg font-bold',
            'bg-gradient-to-br shadow-inner',
            status === 'active' && 'from-green-500/20 to-emerald-500/10 text-green-600 dark:text-green-400',
            status === 'expiring' && 'from-yellow-500/20 to-orange-500/10 text-yellow-600 dark:text-yellow-400',
            status === 'expired' && 'from-red-500/20 to-rose-500/10 text-red-600 dark:text-red-400'
          )}>
            {client.name.charAt(0).toUpperCase()}
          </div>

          {/* Name & Status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base truncate">
                {maskData(client.name, 'name')}
              </h3>
              {isRecentlyAdded && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 animate-pulse">
                  NOVO
                </Badge>
              )}
            </div>
            
            {/* Status & Category badges */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Badge 
                variant="outline" 
                className={cn(
                  'text-[10px] px-2 py-0.5 gap-1 border-0',
                  status === 'active' && 'bg-green-500/15 text-green-600 dark:text-green-400',
                  status === 'expiring' && 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
                  status === 'expired' && 'bg-red-500/15 text-red-600 dark:text-red-400'
                )}
              >
                <StatusIcon className="h-3 w-3" />
                {statusLabels[status]}
                {daysLeft > 0 && status !== 'expired' && ` (${daysLeft}d)`}
              </Badge>
              
              {client.category && (
                <Badge 
                  variant="outline" 
                  className={cn(
                    'text-[10px] px-2 py-0.5 border-0',
                    isReseller && !isAdmin 
                      ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                      : 'bg-primary/10 text-primary'
                  )}
                >
                  {categoryName}
                </Badge>
              )}

              {isSent && (
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-0 bg-green-500/15 text-green-600 dark:text-green-400 gap-1">
                  <MessageCircle className="h-2.5 w-2.5" />
                  Enviado
                </Badge>
              )}
            </div>
          </div>

          {/* Payment Status */}
          {!client.is_paid && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-xs bg-red-500/10 text-red-600 hover:bg-green-500/20 hover:text-green-600 transition-all rounded-lg"
              onClick={(e) => {
                e.stopPropagation();
                onMarkPaid(client);
              }}
              title="Clique para marcar como pago"
            >
              <DollarSign className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 mb-2 sm:mb-3">
          {/* Expiration */}
          <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-muted/30">
            <CalendarIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-[10px] sm:text-xs font-medium truncate">
              {format(new Date(client.expiration_date + 'T12:00:00'), "dd/MM/yyyy")}
            </span>
          </div>

          {/* Phone */}
          {client.phone ? (
            <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-muted/30 group/phone">
              <Phone className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-500 flex-shrink-0" />
              <span className="text-[10px] sm:text-xs truncate flex-1">{maskData(client.phone, 'phone')}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 opacity-0 group-hover/phone:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(client.phone!);
                  toast.success('Telefone copiado!');
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-muted/20">
              <Phone className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground/50 flex-shrink-0" />
              <span className="text-[10px] sm:text-xs text-muted-foreground/50 truncate">Sem telefone</span>
            </div>
          )}
        </div>

        {/* DNS */}
        {client.dns && (
          <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-blue-500/5 border border-blue-500/10 mb-2 sm:mb-3 group/dns">
            <Globe className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-500 flex-shrink-0" />
            <span className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 font-medium truncate flex-1">
              {client.dns}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 opacity-0 group-hover/dns:opacity-100 transition-opacity"
              onClick={handleCopyDns}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Badges Section - Plan, Server, Device, App */}
        <div className="flex flex-wrap gap-1 sm:gap-1.5 mb-2 sm:mb-3">
          {client.plan_name && (
            <Badge variant="secondary" className="text-[10px] gap-1 font-normal">
              <CreditCard className="h-3 w-3" />
              {client.plan_name}
              {client.plan_price && !isPrivacyMode && (
                <span className="text-muted-foreground">
                  R${client.plan_price.toFixed(0)}
                </span>
              )}
            </Badge>
          )}
          
          {client.server_name && (
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] gap-1 font-normal bg-accent/50 transition-colors group/server",
                serverHasPanel(client.server_name) 
                  ? "cursor-pointer hover:bg-primary/20 hover:border-primary/50" 
                  : "cursor-default opacity-70"
              )}
              onClick={(e) => handleServerClick(e, client.server_name!)}
              title={serverHasPanel(client.server_name) ? 'Clique para abrir o painel' : 'Sem link de painel cadastrado'}
            >
              <Server className="h-3 w-3" />
              {client.server_name}
              {serverHasPanel(client.server_name) && (
                <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover/server:opacity-100 transition-opacity" />
              )}
            </Badge>
          )}
          
          {client.server_name_2 && (
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] gap-1 font-normal bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 transition-colors group/server",
                serverHasPanel(client.server_name_2) 
                  ? "cursor-pointer hover:bg-amber-500/20" 
                  : "cursor-default opacity-70"
              )}
              onClick={(e) => handleServerClick(e, client.server_name_2!)}
              title={serverHasPanel(client.server_name_2) ? 'Clique para abrir o painel' : 'Sem link de painel cadastrado'}
            >
              <Server className="h-3 w-3" />
              {client.server_name_2}
              {serverHasPanel(client.server_name_2) && (
                <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover/server:opacity-100 transition-opacity" />
              )}
            </Badge>
          )}

          {/* Additional Servers */}
          {client.additional_servers && Array.isArray(client.additional_servers) && client.additional_servers.length > 0 && (
            client.additional_servers.map((server: AdditionalServer, index: number) => (
              <Badge 
                key={server.server_id || index} 
                variant="outline" 
                className={cn(
                  "text-[10px] gap-1 font-normal bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 transition-colors group/server",
                  serverHasPanel(server.server_name) 
                    ? "cursor-pointer hover:bg-emerald-500/20" 
                    : "cursor-default opacity-70"
                )}
                onClick={(e) => handleServerClick(e, server.server_name)}
                title={serverHasPanel(server.server_name) ? 'Clique para abrir o painel' : 'Sem link de painel cadastrado'}
              >
                <Server className="h-3 w-3" />
                {server.server_name}
                {serverHasPanel(server.server_name) && (
                  <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover/server:opacity-100 transition-opacity" />
                )}
              </Badge>
            ))
          )}

          {client.device_model && (
            <Badge variant="outline" className="text-[10px] gap-1 font-normal bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
              <Tv className="h-3 w-3" />
              {client.device_model}
            </Badge>
          )}

          {client.app_name && (
            <Badge variant="outline" className="text-[10px] gap-1 font-normal bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
              <AppWindow className="h-3 w-3" />
              {client.app_name}
            </Badge>
          )}
        </div>

        {/* Credentials Section - Grouped by Server with Colors */}
        {hasCredentials && (
          <div className="p-2 sm:p-2.5 rounded-lg bg-muted/40 border border-border/50 mb-2 sm:mb-3">
            {isDecrypted && decryptedCredentials ? (
              <div className="space-y-2">
                {/* Server 1 Credentials - Primary Color (Blue/Accent) */}
                {decryptedCredentials.login && (
                  <div className="space-y-1 p-1.5 rounded-md bg-accent/30 border border-accent/50">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Server className="h-3 w-3 text-primary" />
                      <span className="text-[10px] font-medium text-primary">
                        {client.server_name || 'Servidor 1'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between group/cred">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Login</span>
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">
                          {maskData(decryptedCredentials.login, 'credentials')}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 opacity-60 hover:opacity-100 hover:bg-primary/20"
                          onClick={(e) => handleCopyCredentials(e, decryptedCredentials.login, 'Login')}
                          title="Copiar login"
                        >
                          <Copy className="h-3 w-3 text-primary" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Server 2 Credentials - Amber Color */}
                {decryptedCredentials.login_2 && (
                  <div className="space-y-1 p-1.5 rounded-md bg-amber-500/10 border border-amber-500/30">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Server className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                      <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        {client.server_name_2 || 'Servidor 2'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between group/cred">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Login</span>
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs font-mono bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-500/30">
                          {maskData(decryptedCredentials.login_2, 'credentials')}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 opacity-60 hover:opacity-100 hover:bg-amber-500/20"
                          onClick={(e) => handleCopyCredentials(e, decryptedCredentials.login_2!, 'Login Servidor 2')}
                          title="Copiar login"
                        >
                          <Copy className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Additional Servers Credentials - Different Colors for Each */}
                {client.additional_servers && Array.isArray(client.additional_servers) && 
                  client.additional_servers.map((server: AdditionalServer, index: number) => {
                    // Check if this additional server has login credentials
                    if (!server.login) return null;
                    
                    // Array de cores para servidores adicionais (cada um com cor diferente)
                    const serverColors = [
                      { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400', codeBg: 'bg-emerald-500/15', hoverBg: 'hover:bg-emerald-500/20' },
                      { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-600 dark:text-violet-400', codeBg: 'bg-violet-500/15', hoverBg: 'hover:bg-violet-500/20' },
                      { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-600 dark:text-rose-400', codeBg: 'bg-rose-500/15', hoverBg: 'hover:bg-rose-500/20' },
                      { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-600 dark:text-cyan-400', codeBg: 'bg-cyan-500/15', hoverBg: 'hover:bg-cyan-500/20' },
                      { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-600 dark:text-orange-400', codeBg: 'bg-orange-500/15', hoverBg: 'hover:bg-orange-500/20' },
                      { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-600 dark:text-pink-400', codeBg: 'bg-pink-500/15', hoverBg: 'hover:bg-pink-500/20' },
                    ];
                    const colorScheme = serverColors[index % serverColors.length];
                    
                    return (
                      <div key={server.server_id || index} className={`space-y-1 p-1.5 rounded-md ${colorScheme.bg} ${colorScheme.border}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Server className={`h-3 w-3 ${colorScheme.text}`} />
                          <span className={`text-[10px] font-medium ${colorScheme.text}`}>
                            {server.server_name || `Servidor ${index + 3}`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between group/cred">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Login</span>
                          <div className="flex items-center gap-1.5">
                            <code className={`text-xs font-mono ${colorScheme.codeBg} ${colorScheme.text} px-2 py-0.5 rounded ${colorScheme.border}`}>
                              {maskData(server.login, 'credentials')}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-5 w-5 p-0 opacity-60 hover:opacity-100 ${colorScheme.hoverBg}`}
                              onClick={(e) => handleCopyCredentials(e, server.login!, `Login ${server.server_name}`)}
                              title="Copiar login"
                            >
                              <Copy className={`h-3 w-3 ${colorScheme.text}`} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs gap-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                  onDecrypt(client);
                }}
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Lock className="h-3 w-3" />
                )}
                {isDecrypting ? 'Descriptografando...' : 'Ver credenciais'}
              </Button>
            )}
          </div>
        )}

        {/* Actions Bar */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 rounded-lg hover:bg-green-500/10 hover:text-green-600"
              onClick={(e) => {
                e.stopPropagation();
                onMessage(client);
              }}
              title="Enviar mensagem"
            >
              <MessageCircle className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 rounded-lg hover:bg-blue-500/10 hover:text-blue-600"
              onClick={(e) => {
                e.stopPropagation();
                onRenew(client);
              }}
              title="Renovar"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 rounded-lg hover:bg-primary/10 hover:text-primary"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(client);
              }}
              title="Editar"
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 rounded-lg hover:bg-yellow-500/10 hover:text-yellow-600"
              onClick={(e) => {
                e.stopPropagation();
                onArchive(client);
              }}
              title="Arquivar"
            >
              <Archive className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 rounded-lg hover:bg-red-500/10 hover:text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(client);
              }}
              title="Excluir"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

export default ClientCard;
