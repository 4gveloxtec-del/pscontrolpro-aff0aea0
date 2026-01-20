import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarIcon, DollarSign, Users, X } from 'lucide-react';
import { format, startOfToday, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Client {
  id: string;
  name: string;
  expiration_date: string;
  plan_price: number | null;
  premium_price: number | null;
  is_archived: boolean | null;
}

interface ExpirationDaySummaryProps {
  clients: Client[];
  isPrivacyMode?: boolean;
  selectedDate?: string | null;
  onDateClick?: (date: string | null) => void;
}

interface DaySummary {
  date: Date;
  dateString: string;
  dayLabel: string;
  clients: Client[];
  totalRevenue: number;
}

export function ExpirationDaySummary({ 
  clients, 
  isPrivacyMode = false,
  selectedDate = null,
  onDateClick 
}: ExpirationDaySummaryProps) {
  const today = startOfToday();

  const daySummaries = useMemo(() => {
    // Filter only active (non-archived) clients
    const activeClients = clients.filter(c => !c.is_archived);
    
    // Group clients by days until expiration (0 to 5 days)
    const summaries: DaySummary[] = [];
    
    for (let i = 0; i <= 5; i++) {
      const targetDate = addDays(today, i);
      const dateString = format(targetDate, 'yyyy-MM-dd');
      const clientsForDay = activeClients.filter(client => {
        // Use string comparison for consistency with the filter in Clients.tsx
        const clientExpDateString = client.expiration_date.split('T')[0];
        return clientExpDateString === dateString;
      });
      
      const totalRevenue = clientsForDay.reduce((sum, client) => {
        const planPrice = client.plan_price || 0;
        const premiumPrice = client.premium_price || 0;
        return sum + planPrice + premiumPrice;
      }, 0);

      let dayLabel = '';
      if (i === 0) {
        dayLabel = 'Hoje';
      } else if (i === 1) {
        dayLabel = 'Amanhã';
      } else {
        dayLabel = format(targetDate, "EEEE", { locale: ptBR });
        // Capitalize first letter
        dayLabel = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);
      }

      summaries.push({
        date: targetDate,
        dateString,
        dayLabel,
        clients: clientsForDay,
        totalRevenue,
      });
    }
    
    return summaries;
  }, [clients, today]);

  // Only show if there are clients expiring in the next 5 days
  const hasExpiringClients = daySummaries.some(s => s.clients.length > 0);
  
  if (!hasExpiringClients) {
    return null;
  }

  const totalClients = daySummaries.reduce((sum, s) => sum + s.clients.length, 0);
  const totalRevenue = daySummaries.reduce((sum, s) => sum + s.totalRevenue, 0);

  const handleDateClick = (dateString: string, hasClients: boolean) => {
    if (!onDateClick || !hasClients) return;
    
    // Toggle: if clicking the same date, clear the filter
    if (selectedDate === dateString) {
      onDateClick(null);
    } else {
      onDateClick(dateString);
    }
  };

  return (
    <Card className="border-warning/30 bg-gradient-to-r from-warning/5 via-transparent to-warning/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-warning" />
            <h3 className="font-semibold text-sm">Vencimentos Próximos</h3>
            {selectedDate && (
              <Badge 
                variant="outline" 
                className="gap-1 text-xs cursor-pointer hover:bg-destructive/10 transition-colors"
                onClick={() => onDateClick?.(null)}
              >
                Filtrado
                <X className="h-3 w-3" />
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {totalClients} cliente{totalClients !== 1 ? 's' : ''}
            </span>
            {!isPrivacyMode && (
              <span className="flex items-center gap-1 text-success font-medium">
                <DollarSign className="h-3 w-3" />
                R$ {totalRevenue.toFixed(2)}
              </span>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {daySummaries.map((summary, index) => {
            const isSelected = selectedDate === summary.dateString;
            const hasClients = summary.clients.length > 0;
            
            return (
              <div
                key={index}
                onClick={() => handleDateClick(summary.dateString, hasClients)}
                className={`
                  p-2.5 rounded-lg border transition-all
                  ${hasClients 
                    ? 'cursor-pointer hover:scale-[1.02]' 
                    : 'cursor-default'
                  }
                  ${isSelected
                    ? 'bg-primary/10 border-primary ring-2 ring-primary/30 shadow-md'
                    : hasClients 
                      ? 'bg-card border-border hover:border-warning/50 hover:shadow-sm' 
                      : 'bg-muted/30 border-transparent opacity-50'
                  }
                `}
              >
                <div className="text-center">
                  <p className={`text-xs font-medium mb-0.5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
                    {summary.dayLabel}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mb-1">
                    {format(summary.date, "dd/MM")}
                  </p>
                  <div className="flex items-center justify-center gap-1.5">
                    <Badge 
                      variant={hasClients ? "default" : "secondary"}
                      className={`
                        text-xs px-1.5 min-w-[24px] justify-center transition-all
                        ${isSelected ? 'ring-2 ring-primary/50 scale-110' : ''}
                        ${index === 0 && hasClients && !isSelected ? 'bg-destructive hover:bg-destructive' : ''}
                        ${index === 1 && hasClients && !isSelected ? 'bg-warning hover:bg-warning text-warning-foreground' : ''}
                        ${hasClients ? 'cursor-pointer' : ''}
                      `}
                    >
                      {summary.clients.length}
                    </Badge>
                  </div>
                  {!isPrivacyMode && summary.totalRevenue > 0 && (
                    <p className={`text-[10px] font-medium mt-1 ${isSelected ? 'text-primary' : 'text-success'}`}>
                      R$ {summary.totalRevenue.toFixed(0)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Clear filter button when active */}
        {selectedDate && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDateClick?.(null)}
              className="w-full gap-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
              Limpar Filtro de Data
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
