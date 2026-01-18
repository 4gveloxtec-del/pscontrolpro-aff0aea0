import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Search, AlertTriangle, CheckCircle, XCircle, Clock, Filter, Trash2, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface ChatbotLog {
  id: string;
  component_name: string;
  event_type: string;
  severity: string;
  message: string;
  details: unknown;
  created_at: string;
  was_auto_repaired: boolean | null;
}

interface SendLog {
  id: string;
  seller_id: string;
  contact_phone: string;
  instance_name: string;
  message_type: string;
  success: boolean | null;
  error_message: string | null;
  api_status_code: number | null;
  created_at: string | null;
}

export default function ChatbotLogs() {
  const { isAdmin } = useAuth();
  const [healthLogs, setHealthLogs] = useState<ChatbotLog[]>([]);
  const [sendLogs, setSendLogs] = useState<SendLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"health" | "sends">("health");
  const [webhookStatus, setWebhookStatus] = useState<"checking" | "online" | "offline">("checking");

  // Check webhook status
  const checkWebhookStatus = async () => {
    setWebhookStatus("checking");
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chatbot-webhook?ping=true`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      
      if (response.ok) {
        setWebhookStatus("online");
        toast.success("Webhook está online!");
      } else {
        setWebhookStatus("offline");
        toast.error("Webhook offline ou com erro");
      }
    } catch (error) {
      setWebhookStatus("offline");
      toast.error("Não foi possível conectar ao webhook");
    }
  };

  // Fetch health logs
  const fetchHealthLogs = async () => {
    try {
      let query = supabase
        .from("system_health_logs")
        .select("*")
        .eq("component_name", "chatbot-webhook")
        .order("created_at", { ascending: false })
        .limit(100);

      if (filter !== "all") {
        query = query.eq("severity", filter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setHealthLogs(data || []);
    } catch (error) {
      console.error("Error fetching health logs:", error);
    }
  };

  // Fetch send logs
  const fetchSendLogs = async () => {
    try {
      const { data, error } = await supabase
        .from("chatbot_send_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setSendLogs(data || []);
    } catch (error) {
      console.error("Error fetching send logs:", error);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    await Promise.all([fetchHealthLogs(), fetchSendLogs()]);
    setIsLoading(false);
  };

  useEffect(() => {
    if (isAdmin) {
      fetchData();
      checkWebhookStatus();
    }
  }, [isAdmin, filter]);

  // Clear old logs
  const clearOldLogs = async () => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      await supabase
        .from("system_health_logs")
        .delete()
        .eq("component_name", "chatbot-webhook")
        .lt("created_at", thirtyDaysAgo.toISOString());

      toast.success("Logs antigos removidos");
      fetchData();
    } catch (error) {
      toast.error("Erro ao limpar logs");
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "error":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Erro</Badge>;
      case "warning":
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><AlertTriangle className="w-3 h-3 mr-1" />Aviso</Badge>;
      case "info":
        return <Badge variant="outline"><CheckCircle className="w-3 h-3 mr-1" />Info</Badge>;
      default:
        return <Badge>{severity}</Badge>;
    }
  };

  const getWebhookStatusBadge = () => {
    switch (webhookStatus) {
      case "checking":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1 animate-spin" />Verificando...</Badge>;
      case "online":
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Online</Badge>;
      case "offline":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Offline</Badge>;
    }
  };

  const filteredHealthLogs = healthLogs.filter(log => 
    search === "" || 
    log.message.toLowerCase().includes(search.toLowerCase()) ||
    log.event_type.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSendLogs = sendLogs.filter(log => 
    search === "" || 
    log.contact_phone.includes(search) ||
    log.instance_name.toLowerCase().includes(search.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-yellow-500 mb-4" />
            <h2 className="text-xl font-semibold">Acesso Restrito</h2>
            <p className="text-muted-foreground">Apenas administradores podem acessar os logs do chatbot.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Logs do Chatbot</h1>
          <p className="text-muted-foreground">Monitore eventos, erros e envios do chatbot</p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
            <Activity className="w-4 h-4" />
            <span className="text-sm">Webhook:</span>
            {getWebhookStatusBadge()}
          </div>
          <Button variant="outline" size="sm" onClick={checkWebhookStatus}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">
              {sendLogs.filter(l => l.success).length}
            </div>
            <div className="text-sm text-muted-foreground">Envios com sucesso</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">
              {sendLogs.filter(l => !l.success).length}
            </div>
            <div className="text-sm text-muted-foreground">Envios com falha</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-yellow-600">
              {healthLogs.filter(l => l.severity === "warning").length}
            </div>
            <div className="text-sm text-muted-foreground">Avisos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">
              {healthLogs.filter(l => l.severity === "error").length}
            </div>
            <div className="text-sm text-muted-foreground">Erros</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex gap-2">
              <Button 
                variant={activeTab === "health" ? "default" : "outline"} 
                onClick={() => setActiveTab("health")}
              >
                Eventos do Sistema
              </Button>
              <Button 
                variant={activeTab === "sends" ? "default" : "outline"} 
                onClick={() => setActiveTab("sends")}
              >
                Envios de Mensagem
              </Button>
            </div>
            
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar nos logs..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {activeTab === "health" && (
                <Select value={filter} onValueChange={setFilter}>
                  <SelectTrigger className="w-[150px]">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Filtrar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="error">Erros</SelectItem>
                    <SelectItem value="warning">Avisos</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                  </SelectContent>
                </Select>
              )}
              
              <Button variant="outline" onClick={fetchData} disabled={isLoading}>
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              
              <Button variant="outline" onClick={clearOldLogs} className="text-red-600">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {activeTab === "health" ? "Eventos do Sistema" : "Histórico de Envios"}
          </CardTitle>
          <CardDescription>
            {activeTab === "health" 
              ? "Eventos, erros e avisos do chatbot" 
              : "Mensagens enviadas pelo chatbot"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando logs...</div>
          ) : activeTab === "health" ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Severidade</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHealthLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Nenhum log encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredHealthLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.event_type}</Badge>
                        </TableCell>
                        <TableCell>{getSeverityBadge(log.severity)}</TableCell>
                        <TableCell className="max-w-[300px] truncate">{log.message}</TableCell>
                        <TableCell className="max-w-[200px]">
                          {log.details && (
                            <code className="text-xs bg-muted p-1 rounded block truncate">
                              {JSON.stringify(log.details).substring(0, 50)}...
                            </code>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Instância</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Erro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSendLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Nenhum envio encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSendLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          {log.created_at && format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                        </TableCell>
                        <TableCell>{log.instance_name}</TableCell>
                        <TableCell>{log.contact_phone}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.message_type}</Badge>
                        </TableCell>
                        <TableCell>
                          {log.success ? (
                            <Badge className="bg-green-500">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Sucesso
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <XCircle className="w-3 h-3 mr-1" />
                              Falha
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-red-600">
                          {log.error_message}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
