import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  MessageSquare, 
  Trash2, 
  RefreshCw, 
  Search, 
  Phone, 
  User, 
  ArrowUpRight, 
  ArrowDownLeft,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface BotSession {
  id: string;
  contact_phone: string;
  contact_name: string | null;
  status: string | null;
  flow_id: string | null;
  current_node_id: string | null;
  started_at: string | null;
  last_activity_at: string | null;
  ended_at: string | null;
  trigger_command: string | null;
  variables: Record<string, unknown> | null;
}

interface MessageLog {
  id: string;
  session_id: string | null;
  direction: string;
  message_content: string | null;
  message_type: string | null;
  node_id: string | null;
  processed_at: string | null;
  metadata: Record<string, unknown> | null;
}

export function BotEngineLogs() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchPhone, setSearchPhone] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedSession, setSelectedSession] = useState<BotSession | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearType, setClearType] = useState<'session' | 'all'>('session');
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  // Fetch sessions
  const { data: sessions = [], isLoading: sessionsLoading, refetch: refetchSessions } = useQuery({
    queryKey: ['bot-sessions', user?.id, statusFilter],
    queryFn: async () => {
      if (!user?.id) return [];
      
      let query = supabase
        .from('bot_engine_sessions')
        .select('*')
        .eq('seller_id', user.id)
        .order('last_activity_at', { ascending: false })
        .limit(100);
      
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as BotSession[];
    },
    enabled: !!user?.id,
    refetchInterval: 30000, // Atualiza a cada 30s
  });

  // Fetch message logs for selected session
  const { data: messageLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['bot-message-logs', selectedSession?.id],
    queryFn: async () => {
      if (!selectedSession?.id || !user?.id) return [];
      
      const { data, error } = await supabase
        .from('bot_engine_message_log')
        .select('*')
        .eq('seller_id', user.id)
        .eq('session_id', selectedSession.id)
        .order('processed_at', { ascending: true });
      
      if (error) throw error;
      return (data || []) as MessageLog[];
    },
    enabled: !!selectedSession?.id && !!user?.id,
  });

  // Delete single session mutation
  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      // Delete message logs first
      await supabase
        .from('bot_engine_message_log')
        .delete()
        .eq('session_id', sessionId);
      
      // Delete session
      const { error } = await supabase
        .from('bot_engine_sessions')
        .delete()
        .eq('id', sessionId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Sessão excluída com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['bot-sessions'] });
      setSelectedSession(null);
      setShowClearConfirm(false);
      setSessionToDelete(null);
    },
    onError: (error: Error) => {
      toast.error('Erro ao excluir sessão: ' + error.message);
    },
  });

  // Delete all sessions mutation
  const deleteAllSessionsMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      
      // Delete all message logs for this seller
      await supabase
        .from('bot_engine_message_log')
        .delete()
        .eq('seller_id', user.id);
      
      // Delete all sessions for this seller
      const { error } = await supabase
        .from('bot_engine_sessions')
        .delete()
        .eq('seller_id', user.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Todas as sessões foram excluídas!');
      queryClient.invalidateQueries({ queryKey: ['bot-sessions'] });
      setSelectedSession(null);
      setShowClearConfirm(false);
    },
    onError: (error: Error) => {
      toast.error('Erro ao limpar sessões: ' + error.message);
    },
  });

  // Filter sessions by phone search
  const filteredSessions = sessions.filter(session => {
    if (!searchPhone.trim()) return true;
    const phone = session.contact_phone?.replace(/\D/g, '') || '';
    const search = searchPhone.replace(/\D/g, '');
    return phone.includes(search);
  });

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />Ativo</Badge>;
      case 'completed':
        return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />Concluído</Badge>;
      case 'expired':
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Expirado</Badge>;
      case 'paused':
        return <Badge variant="outline" className="gap-1"><AlertCircle className="h-3 w-3" />Pausado</Badge>;
      case 'error':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Erro</Badge>;
      default:
        return <Badge variant="secondary">{status || 'Desconhecido'}</Badge>;
    }
  };

  const formatPhone = (phone: string | null) => {
    if (!phone) return '-';
    // Mask phone for privacy
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 11) {
      return `${digits.slice(0, 4)}****${digits.slice(-4)}`;
    }
    return phone;
  };

  const handleDeleteSession = (sessionId: string) => {
    setClearType('session');
    setSessionToDelete(sessionId);
    setShowClearConfirm(true);
  };

  const handleClearAll = () => {
    setClearType('all');
    setShowClearConfirm(true);
  };

  const confirmDelete = () => {
    if (clearType === 'session' && sessionToDelete) {
      deleteSessionMutation.mutate(sessionToDelete);
    } else if (clearType === 'all') {
      deleteAllSessionsMutation.mutate();
    }
  };

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden">
      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por telefone..."
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="completed">Concluídos</SelectItem>
              <SelectItem value="expired">Expirados</SelectItem>
              <SelectItem value="error">Com erro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchSessions()}
            disabled={sessionsLoading}
            className="flex-1 sm:flex-none"
          >
            <RefreshCw className={`h-4 w-4 mr-1 sm:mr-2 ${sessionsLoading ? 'animate-spin' : ''}`} />
            <span className="hidden xs:inline">Atualizar</span>
            <span className="xs:hidden">Att</span>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClearAll}
            disabled={sessions.length === 0}
            className="flex-1 sm:flex-none"
          >
            <Trash2 className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline">Limpar Tudo</span>
            <span className="xs:hidden">Limpar</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Sessions List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Sessões ({filteredSessions.length})
            </CardTitle>
            <CardDescription>
              Conversas do chatbot
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              {sessionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {searchPhone ? 'Nenhuma sessão encontrada' : 'Nenhuma sessão registrada'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredSessions.map((session) => (
                    <div
                      key={session.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                        selectedSession?.id === session.id ? 'border-primary bg-primary/5' : ''
                      }`}
                      onClick={() => setSelectedSession(session)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <User className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium truncate">
                              {session.contact_name || formatPhone(session.contact_phone)}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {session.last_activity_at && (
                              <span>
                                {format(new Date(session.last_activity_at), "dd/MM HH:mm", { locale: ptBR })}
                              </span>
                            )}
                            {session.trigger_command && (
                              <span className="ml-2">
                                • Comando: {session.trigger_command}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {getStatusBadge(session.status)}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSession(session.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Message Logs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Mensagens
              {selectedSession && (
                <span className="text-muted-foreground font-normal">
                  - {formatPhone(selectedSession.contact_phone)}
                </span>
              )}
            </CardTitle>
            <CardDescription>
              {selectedSession 
                ? `${messageLogs.length} mensagem(s) na conversa`
                : 'Selecione uma sessão para ver as mensagens'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              {!selectedSession ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Selecione uma sessão para ver as mensagens
                  </p>
                </div>
              ) : logsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : messageLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhuma mensagem registrada
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {messageLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`p-3 rounded-lg ${
                        log.direction === 'inbound'
                          ? 'bg-muted ml-0 mr-8'
                          : 'bg-primary/10 ml-8 mr-0'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {log.direction === 'inbound' ? (
                          <ArrowDownLeft className="h-3.5 w-3.5 text-blue-500" />
                        ) : (
                          <ArrowUpRight className="h-3.5 w-3.5 text-green-500" />
                        )}
                        <span className="text-xs font-medium">
                          {log.direction === 'inbound' ? 'Cliente' : 'Bot'}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {log.processed_at && format(new Date(log.processed_at), "HH:mm:ss", { locale: ptBR })}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {log.message_content || <span className="text-muted-foreground italic">(vazio)</span>}
                      </p>
                      {log.message_type && log.message_type !== 'text' && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          {log.message_type}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Confirm Delete Dialog */}
      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent className="w-[95vw] sm:max-w-md p-3 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-destructive text-base sm:text-lg">
              {clearType === 'all' ? 'Limpar Todas as Sessões' : 'Excluir Sessão'}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {clearType === 'all' 
                ? 'Excluir TODAS as sessões e logs? Ação irreversível.'
                : 'Excluir esta sessão e seus logs?'
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                setShowClearConfirm(false);
                setSessionToDelete(null);
              }}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteSessionMutation.isPending || deleteAllSessionsMutation.isPending}
              className="w-full sm:w-auto"
            >
              {(deleteSessionMutation.isPending || deleteAllSessionsMutation.isPending) ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1 sm:mr-2" />
                  <span className="hidden xs:inline">Excluindo...</span>
                  <span className="xs:hidden">...</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-1 sm:mr-2" />
                  <span className="hidden xs:inline">
                    {clearType === 'all' ? 'Limpar Tudo' : 'Excluir'}
                  </span>
                  <span className="xs:hidden">Excluir</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
