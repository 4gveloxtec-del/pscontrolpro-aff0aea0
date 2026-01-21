import { useQuery } from '@tanstack/react-query';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppWindow, Calendar, MessageCircle, AlertTriangle, Clock, Bell } from 'lucide-react';
import { differenceInDays, format, startOfToday, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ExternalAppExpiration {
  id: string;
  client_id: string;
  external_app_id: string;
  expiration_date: string;
  devices: { name: string; mac: string; device_key: string }[] | null;
  email: string | null;
  client: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
  external_app: {
    id: string;
    name: string;
    price: number | null;
  } | null;
}

export function ExternalAppsExpirationReport() {
  const { user } = useAuth();

  const { data: expiringApps, isLoading } = useQuery({
    queryKey: ['external-apps-expiration-report', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const today = startOfToday();
      const in30Days = addDays(today, 30);

      const { data, error } = await supabase
        .from('client_external_apps')
        .select(`
          id,
          client_id,
          external_app_id,
          expiration_date,
          devices,
          email,
          client:clients!client_external_apps_client_id_fkey(id, name, phone),
          external_app:external_apps!client_external_apps_external_app_id_fkey(id, name, price)
        `)
        .eq('seller_id', user.id)
        .not('expiration_date', 'is', null)
        .lte('expiration_date', in30Days.toISOString().split('T')[0])
        .gte('expiration_date', today.toISOString().split('T')[0])
        .order('expiration_date', { ascending: true });

      if (error) throw error;
      const list = ((data || []) as unknown as ExternalAppExpiration[]);

      // Etapa 4 (UI): evitar duplicidade visual (mesmo client + app + vencimento)
      const seen = new Set<string>();
      const deduped: ExternalAppExpiration[] = [];
      for (const item of list) {
        const key = `${item.client_id}:${item.external_app_id}:${item.expiration_date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
      }

      return deduped;
    },
    enabled: !!user?.id,
  });

  const today = startOfToday();

  const filterByDays = (apps: ExternalAppExpiration[], maxDays: number) => {
    return apps.filter(app => {
      const days = differenceInDays(new Date(app.expiration_date), today);
      return days >= 0 && days <= maxDays;
    });
  };

  const apps3Days = filterByDays(expiringApps || [], 3);
  const apps7Days = filterByDays(expiringApps || [], 7);
  const apps15Days = filterByDays(expiringApps || [], 15);
  const apps30Days = expiringApps || [];

  const getDaysLabel = (expirationDate: string) => {
    const days = differenceInDays(new Date(expirationDate), today);
    if (days === 0) return 'HOJE';
    if (days === 1) return 'Amanhã';
    return `${days} dias`;
  };

  const getDaysBadgeVariant = (expirationDate: string): "default" | "destructive" | "outline" | "secondary" => {
    const days = differenceInDays(new Date(expirationDate), today);
    if (days <= 1) return 'destructive';
    if (days <= 3) return 'destructive';
    if (days <= 7) return 'secondary';
    return 'outline';
  };

  const openWhatsApp = (phone: string | null, clientName: string, appName: string, expirationDate: string) => {
    if (!phone) return;
    const formattedDate = format(new Date(expirationDate), "dd/MM/yyyy");
    const message = `Olá ${clientName}! Seu app *${appName}* vence em ${formattedDate}. Entre em contato para renovar!`;
    const cleanPhone = phone.replace(/\D/g, '');
    window.open(`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const renderAppsList = (apps: ExternalAppExpiration[]) => {
    if (apps.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>Nenhum app vencendo neste período</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {apps.map((app) => {
          const deviceName = app.devices?.[0]?.name || app.email || 'Sem identificação';
          
          return (
            <Card key={app.id} className="border-l-4 border-l-primary">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <AppWindow className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-medium truncate">{app.external_app?.name}</span>
                      <Badge variant={getDaysBadgeVariant(app.expiration_date)} className="shrink-0">
                        {getDaysLabel(app.expiration_date)}
                      </Badge>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-1">
                      Cliente: <span className="font-medium text-foreground">{app.client?.name}</span>
                    </p>
                    
                    <p className="text-xs text-muted-foreground">
                      {deviceName} • Vence: {format(new Date(app.expiration_date), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                    
                    {app.external_app?.price && (
                      <p className="text-xs text-success mt-1">
                        Valor: R$ {app.external_app.price.toFixed(2)}
                      </p>
                    )}
                  </div>
                  
                  {app.client?.phone && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openWhatsApp(
                        app.client?.phone || null,
                        app.client?.name || '',
                        app.external_app?.name || '',
                        app.expiration_date
                      )}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Vencimentos de Apps Externos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="3days" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="3days" className="relative text-xs px-2">
              <AlertTriangle className="h-3 w-3 mr-1" />
              3d
              {apps3Days.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">
                  {apps3Days.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="7days" className="relative text-xs px-2">
              <Clock className="h-3 w-3 mr-1" />
              7d
              {apps7Days.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  {apps7Days.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="15days" className="relative text-xs px-2">
              <Calendar className="h-3 w-3 mr-1" />
              15d
              {apps15Days.length > 0 && (
                <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">
                  {apps15Days.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="30days" className="relative text-xs px-2">
              <Bell className="h-3 w-3 mr-1" />
              30d
              {apps30Days.length > 0 && (
                <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">
                  {apps30Days.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="3days" className="mt-0">
            {renderAppsList(apps3Days)}
          </TabsContent>
          
          <TabsContent value="7days" className="mt-0">
            {renderAppsList(apps7Days)}
          </TabsContent>
          
          <TabsContent value="15days" className="mt-0">
            {renderAppsList(apps15Days)}
          </TabsContent>
          
          <TabsContent value="30days" className="mt-0">
            {renderAppsList(apps30Days)}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
