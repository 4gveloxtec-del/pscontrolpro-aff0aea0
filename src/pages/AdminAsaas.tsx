import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, CreditCard } from 'lucide-react';
import { AsaasSettings } from '@/components/admin/AsaasSettings';
import { AsaasResellerPayments } from '@/components/admin/AsaasResellerPayments';

export default function AdminAsaas() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-green-500" />
          ASAAS - Revendedores
        </h1>
        <p className="text-slate-400 mt-1">
          Gerencie cobranças e pagamentos via PIX para revendedores
        </p>
      </div>

      <Tabs defaultValue="payments" className="w-full">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger 
            value="payments" 
            className="data-[state=active]:bg-slate-700 data-[state=active]:text-white"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Cobranças
          </TabsTrigger>
          <TabsTrigger 
            value="settings" 
            className="data-[state=active]:bg-slate-700 data-[state=active]:text-white"
          >
            <Settings className="h-4 w-4 mr-2" />
            Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="mt-6">
          <AsaasResellerPayments />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <AsaasSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
