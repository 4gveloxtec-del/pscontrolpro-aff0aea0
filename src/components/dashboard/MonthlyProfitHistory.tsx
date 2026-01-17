import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Trash2, 
  Save,
  ChevronDown,
  ChevronUp,
  History,
  AlertCircle
} from 'lucide-react';

interface MonthlyProfit {
  id: string;
  seller_id: string;
  month: number;
  year: number;
  revenue: number;
  server_costs: number;
  bills_costs: number;
  net_profit: number;
  active_clients: number;
  closed_at: string | null;
  created_at: string;
}

interface MonthlyProfitHistoryProps {
  sellerId: string;
  currentRevenue: number;
  currentServerCosts: number;
  currentBillsCosts?: number;
  currentNetProfit: number;
  currentActiveClients: number;
  isPrivacyMode: boolean;
  maskData: (value: string, type?: string) => string;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function MonthlyProfitHistory({
  sellerId,
  currentRevenue,
  currentServerCosts,
  currentBillsCosts = 0,
  currentNetProfit,
  currentActiveClients,
  isPrivacyMode,
  maskData,
}: MonthlyProfitHistoryProps) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [yearToDelete, setYearToDelete] = useState<number | null>(null);
  
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  // Fetch profit history
  const { data: profitHistory = [], isLoading } = useQuery({
    queryKey: ['monthly-profits', sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_profits')
        .select('*')
        .eq('seller_id', sellerId)
        .order('year', { ascending: false })
        .order('month', { ascending: false });
      
      if (error) throw error;
      return data as MonthlyProfit[];
    },
    enabled: !!sellerId,
  });

  // Get current month's saved data (if any)
  const currentMonthData = profitHistory.find(
    p => p.month === currentMonth && p.year === currentYear
  );

  // Group profits by year
  const profitsByYear = profitHistory.reduce((acc, profit) => {
    if (!acc[profit.year]) {
      acc[profit.year] = [];
    }
    acc[profit.year].push(profit);
    return acc;
  }, {} as Record<number, MonthlyProfit[]>);

  // Get sorted years
  const years = Object.keys(profitsByYear).map(Number).sort((a, b) => b - a);

  // Calculate annual totals
  const getYearTotal = (year: number) => {
    const yearProfits = profitsByYear[year] || [];
    return {
      revenue: yearProfits.reduce((sum, p) => sum + Number(p.revenue), 0),
      serverCosts: yearProfits.reduce((sum, p) => sum + Number(p.server_costs), 0),
      billsCosts: yearProfits.reduce((sum, p) => sum + Number(p.bills_costs), 0),
      netProfit: yearProfits.reduce((sum, p) => sum + Number(p.net_profit), 0),
      monthCount: yearProfits.length,
    };
  };

  // Save current month mutation
  const saveCurrentMonth = useMutation({
    mutationFn: async () => {
      const data = {
        seller_id: sellerId,
        month: currentMonth,
        year: currentYear,
        revenue: currentRevenue,
        server_costs: currentServerCosts,
        bills_costs: currentBillsCosts,
        net_profit: currentNetProfit,
        active_clients: currentActiveClients,
        closed_at: new Date().toISOString(),
      };

      if (currentMonthData) {
        const { error } = await supabase
          .from('monthly_profits')
          .update(data)
          .eq('id', currentMonthData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('monthly_profits')
          .insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-profits', sellerId] });
      toast.success('Lucro do mês salvo com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao salvar lucro do mês');
    },
  });

  // Delete all history mutation
  const deleteAllHistory = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('monthly_profits')
        .delete()
        .eq('seller_id', sellerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-profits', sellerId] });
      toast.success('Todo o histórico foi excluído!');
      setShowDeleteConfirm(false);
      setYearToDelete(null);
    },
    onError: () => {
      toast.error('Erro ao excluir histórico');
    },
  });

  // Delete specific year mutation
  const deleteYearHistory = useMutation({
    mutationFn: async (year: number) => {
      const { error } = await supabase
        .from('monthly_profits')
        .delete()
        .eq('seller_id', sellerId)
        .eq('year', year);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-profits', sellerId] });
      toast.success('Histórico do ano excluído!');
      setShowDeleteConfirm(false);
      setYearToDelete(null);
    },
    onError: () => {
      toast.error('Erro ao excluir histórico');
    },
  });

  const handleDeleteClick = (year: number | null) => {
    setYearToDelete(year);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    if (yearToDelete === null) {
      deleteAllHistory.mutate();
    } else {
      deleteYearHistory.mutate(yearToDelete);
    }
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Histórico de Lucros
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="gap-1"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Recolher
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                Expandir
              </>
            )}
          </Button>
        </div>
        <CardDescription>
          Salve o lucro mensal e acompanhe o histórico anual
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Current Month Info */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
          <div>
            <p className="font-medium">
              {MONTH_NAMES[currentMonth - 1]} {currentYear}
            </p>
            <p className="text-sm text-muted-foreground">
              Lucro atual: {maskData(`R$ ${currentNetProfit.toFixed(2)}`, 'money')}
            </p>
            {currentMonthData && (
              <p className="text-xs text-success mt-1">
                Salvo em: {format(new Date(currentMonthData.closed_at!), "dd/MM 'às' HH:mm", { locale: ptBR })}
              </p>
            )}
          </div>
          <Button
            onClick={() => saveCurrentMonth.mutate()}
            disabled={saveCurrentMonth.isPending}
            className="gap-2"
            size="sm"
          >
            <Save className="h-4 w-4" />
            {currentMonthData ? 'Atualizar' : 'Salvar Mês'}
          </Button>
        </div>

        {/* Expanded History */}
        {isExpanded && (
          <div className="space-y-4">
            {years.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum histórico salvo ainda.</p>
                <p className="text-sm">Salve o lucro do mês atual para começar a construir seu histórico.</p>
              </div>
            ) : (
              years.map(year => {
                const yearTotal = getYearTotal(year);
                const yearProfits = profitsByYear[year] || [];
                const isCurrentYear = year === currentYear;
                
                return (
                  <div key={year} className="space-y-3">
                    {/* Year Header */}
                    <div className={cn(
                      "p-4 rounded-lg border",
                      isCurrentYear 
                        ? "bg-success/10 border-success/20" 
                        : "bg-muted/30 border-border"
                    )}>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-bold text-lg flex items-center gap-2">
                          <Calendar className="h-5 w-5" />
                          {year}
                          {isCurrentYear && (
                            <Badge variant="default" className="text-xs">Atual</Badge>
                          )}
                        </h4>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{yearTotal.monthCount} mês(es)</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteClick(year)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Year Summary */}
                      <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                        <div>
                          <p className="text-muted-foreground text-xs">Receita</p>
                          <p className="font-semibold text-success">
                            {maskData(`R$ ${yearTotal.revenue.toFixed(2)}`, 'money')}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Custos</p>
                          <p className="font-semibold text-destructive">
                            {maskData(`R$ ${(yearTotal.serverCosts + yearTotal.billsCosts).toFixed(2)}`, 'money')}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Lucro Anual</p>
                          <p className={cn(
                            "font-bold text-lg",
                            yearTotal.netProfit >= 0 ? "text-success" : "text-destructive"
                          )}>
                            {maskData(`R$ ${yearTotal.netProfit.toFixed(2)}`, 'money')}
                          </p>
                        </div>
                      </div>
                      
                      {/* Monthly Breakdown */}
                      <div className="grid gap-2">
                        {yearProfits.map(profit => (
                          <div
                            key={profit.id}
                            className={cn(
                              "flex items-center justify-between p-2 rounded-lg border text-sm",
                              Number(profit.net_profit) >= 0 
                                ? "bg-success/5 border-success/20" 
                                : "bg-destructive/5 border-destructive/20"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              {Number(profit.net_profit) >= 0 ? (
                                <TrendingUp className="h-4 w-4 text-success" />
                              ) : (
                                <TrendingDown className="h-4 w-4 text-destructive" />
                              )}
                              <span className="font-medium">{MONTH_NAMES[profit.month - 1]}</span>
                              <span className="text-xs text-muted-foreground">
                                ({profit.active_clients} clientes)
                              </span>
                            </div>
                            <div className="text-right">
                              <span className={cn(
                                "font-bold",
                                Number(profit.net_profit) >= 0 ? "text-success" : "text-destructive"
                              )}>
                                {maskData(`R$ ${Number(profit.net_profit).toFixed(2)}`, 'money')}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Delete All Button */}
            {profitHistory.length > 0 && (
              <div className="pt-4 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() => handleDeleteClick(null)}
                  className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir Todo Histórico
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={yearToDelete === null 
          ? "Excluir todo o histórico?" 
          : `Excluir histórico de ${yearToDelete}?`}
        description={yearToDelete === null
          ? "Esta ação irá excluir permanentemente TODOS os registros de lucro. Esta ação não pode ser desfeita."
          : `Esta ação irá excluir permanentemente todos os registros de lucro de ${yearToDelete}. Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        onConfirm={handleConfirmDelete}
        variant="destructive"
      />
    </Card>
  );
}
