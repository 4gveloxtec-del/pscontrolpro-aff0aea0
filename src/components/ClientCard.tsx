import { memo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Phone, Mail, Calendar as CalendarIcon, CreditCard, 
  Copy, DollarSign, Globe, Server, Eye, EyeOff, 
  MessageCircle, RefreshCw, Edit, Archive, Trash2,
  Lock, Loader2, ExternalLink
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  device: string | null;
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
}

interface DecryptedCredentials {
  login: string;
  password: string;
  login_2?: string;
  password_2?: string;
}

type ClientStatus = 'active' | 'expiring' | 'expired';

interface ClientCardProps {
  client: Client;
  status: ClientStatus;
  isDecrypted: boolean;
  isDecrypting: boolean;
  decryptedCredentials?: DecryptedCredentials;
  isPrivacyMode: boolean;
  isAdmin: boolean;
  isSent: boolean;
  onEdit: (client: Client) => void;
  onMessage: (client: Client) => void;
  onRenew: (client: Client) => void;
  onArchive: (client: Client) => void;
  onDelete: (client: Client) => void;
  onDecrypt: (client: Client) => void;
  onMarkPaid: (client: Client) => void;
  maskData: (data: string, type: 'name' | 'phone' | 'email' | 'credentials') => string;
  statusColors: Record<ClientStatus, string>;
  statusBadges: Record<ClientStatus, string>;
  statusLabels: Record<ClientStatus, string>;
}

export const ClientCard = memo(function ClientCard({
  client,
  status,
  isDecrypted,
  isDecrypting,
  decryptedCredentials,
  isPrivacyMode,
  isAdmin,
  isSent,
  onEdit,
  onMessage,
  onRenew,
  onArchive,
  onDelete,
  onDecrypt,
  onMarkPaid,
  maskData,
  statusColors,
  statusBadges,
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

  return (
    <Card
      className={cn(
        'border-l-4 transition-all duration-200 hover:shadow-lg',
        isReseller && !isAdmin ? 'border-l-purple-500' : statusColors[status],
        !client.is_paid && 'ring-1 ring-destructive/50',
        isRecentlyAdded && 'ring-2 ring-primary/50 bg-primary/5',
        isReseller && !isAdmin && 'bg-purple-500/5'
      )}
    >
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">{maskData(client.name, 'name')}</h3>
              {isRecentlyAdded && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground animate-pulse">
                  NOVO
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              <span className={cn('text-xs px-2 py-0.5 rounded-full', statusBadges[status])}>
                {statusLabels[status]} {daysLeft > 0 && status !== 'expired' && `(${daysLeft}d)`}
              </span>
              {client.category && (
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded-full',
                  isReseller && !isAdmin 
                    ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400' 
                    : 'bg-primary/10 text-primary'
                )}>
                  {categoryName}
                </span>
              )}
              {isSent && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-600 dark:text-green-400">
                  Mensagem enviada
                </span>
              )}
            </div>
          </div>
          {!client.is_paid && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs bg-destructive/10 text-destructive hover:bg-green-500/20 hover:text-green-600 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onMarkPaid(client);
              }}
              title="Clique para marcar como pago"
            >
              <DollarSign className="h-3 w-3 mr-1" />
              Não Pago
            </Button>
          )}
        </div>

        {/* Contact Info */}
        <div className="space-y-2 text-sm">
          {client.phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              <span>{maskData(client.phone, 'phone')}</span>
            </div>
          )}
          {client.email && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span className="truncate">{maskData(client.email, 'email')}</span>
            </div>
          )}
          {client.dns && (
            <div className="flex items-center gap-2 text-muted-foreground group">
              <Globe className="h-3.5 w-3.5 text-blue-500" />
              <span className="truncate text-blue-600 dark:text-blue-400 font-medium">{client.dns}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleCopyDns}
                title="Copiar DNS"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>{format(new Date(client.expiration_date + 'T12:00:00'), "dd/MM/yyyy")}</span>
          </div>

          {/* Plan + Server Badges */}
          {(client.plan_name || client.server_name || client.server_name_2) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {client.plan_name && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground border border-border">
                  <CreditCard className="h-3 w-3" />
                  {client.plan_name}
                  {client.plan_price && !isPrivacyMode && (
                    <span className="text-muted-foreground ml-1">
                      R$ {client.plan_price.toFixed(2)}
                    </span>
                  )}
                </span>
              )}
              {client.server_name && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-accent text-accent-foreground">
                  <Server className="h-3 w-3" />
                  {client.server_name}
                </span>
              )}
              {client.server_name_2 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-accent text-accent-foreground">
                  <Server className="h-3 w-3" />
                  {client.server_name_2}
                </span>
              )}
            </div>
          )}

          {/* Credentials */}
          {hasCredentials && (
            <div className="mt-3 p-2 bg-muted/50 rounded-md space-y-1">
              {isDecrypted && decryptedCredentials ? (
                <>
                  {decryptedCredentials.login && (
                    <div className="flex items-center justify-between group">
                      <span className="text-xs text-muted-foreground">Login:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-mono">{maskData(decryptedCredentials.login, 'credentials')}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                          onClick={(e) => handleCopyCredentials(e, decryptedCredentials.login, 'Login')}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                  {decryptedCredentials.password && (
                    <div className="flex items-center justify-between group">
                      <span className="text-xs text-muted-foreground">Senha:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-mono">{maskData(decryptedCredentials.password, 'credentials')}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                          onClick={(e) => handleCopyCredentials(e, decryptedCredentials.password, 'Senha')}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-6 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDecrypt(client);
                  }}
                  disabled={isDecrypting}
                >
                  {isDecrypting ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Lock className="h-3 w-3 mr-1" />
                  )}
                  {isDecrypting ? 'Descriptografando...' : 'Ver credenciais'}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
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
              className="h-8 w-8 p-0"
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
              className="h-8 w-8 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(client);
              }}
              title="Editar"
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-warning"
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
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
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
