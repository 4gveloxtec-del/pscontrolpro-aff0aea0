import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, CreditCard } from 'lucide-react';
import { AsaasSettings } from '@/components/admin/AsaasSettings';
import { AsaasResellerPayments } from '@/components/admin/AsaasResellerPayments';

export default function AdminAsaas() {
  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in max-w-full overflow-x-hidden">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-green-500 flex-shrink-0" />
          <span className="truncate">ASAAS - Revendedores</span>
        </h1>
        <p className="text-slate-400 mt-1 text-xs sm:text-sm truncate">
          Gerencie cobranças e pagamentos via PIX
        </p>
      </div>

      <Tabs defaultValue="payments" className="w-full">
        <TabsList className="bg-slate-800 border border-slate-700 w-full grid grid-cols-2">
          <TabsTrigger 
            value="payments" 
            className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-xs sm:text-sm"
          >
            <CreditCard className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="truncate">Cobranças</span>
          </TabsTrigger>
          <TabsTrigger 
            value="settings" 
            className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-xs sm:text-sm"
          >
            <Settings className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="truncate">Configurações</span>
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
