import { Badge } from '@/components/ui/badge';
import { Bell, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BillingModeBadgeProps {
  mode: 'manual' | 'automatic' | null | undefined;
  className?: string;
  showLabel?: boolean;
}

export function BillingModeBadge({ mode, className, showLabel = false }: BillingModeBadgeProps) {
  const effectiveMode = mode || 'manual';
  
  if (effectiveMode === 'manual') {
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "text-[10px] gap-1 font-normal bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
          className
        )}
        title="Modo Manual: Você recebe notificações push quando vencer"
      >
        <Bell className="h-3 w-3" />
        {showLabel && 'Manual'}
      </Badge>
    );
  }
  
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "text-[10px] gap-1 font-normal bg-success/10 text-success border-success/20",
        className
      )}
      title="Modo Automático: Lembretes via WhatsApp"
    >
      <Bot className="h-3 w-3" />
      {showLabel && 'Auto'}
    </Badge>
  );
}
