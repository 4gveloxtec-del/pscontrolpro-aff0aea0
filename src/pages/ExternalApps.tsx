import { useState } from 'react';
import { ExternalAppsManager } from '@/components/ExternalAppsManager';
import { ExternalAppsExpirationReport } from '@/components/ExternalAppsExpirationReport';
import { AppWindow } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Calendar } from 'lucide-react';

export default function ExternalApps() {
  const [activeTab, setActiveTab] = useState('apps');

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in max-w-full overflow-x-hidden">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <AppWindow className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold truncate">Apps Pagos</h1>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">
            Cadastre apps para vincular aos clientes
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="apps" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Gerenciar Apps
          </TabsTrigger>
          <TabsTrigger value="expirations" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Vencimentos
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="apps" className="mt-4">
          <ExternalAppsManager />
        </TabsContent>
        
        <TabsContent value="expirations" className="mt-4">
          <ExternalAppsExpirationReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
