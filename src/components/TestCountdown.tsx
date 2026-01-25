import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TestCountdownProps {
  expirationDatetime: string;
  className?: string;
}

/**
 * Real-time countdown component for short-duration test clients
 * Shows hours:minutes:seconds remaining until expiration
 */
export function TestCountdown({ expirationDatetime, className }: TestCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
    totalSeconds: number;
  }>({ hours: 0, minutes: 0, seconds: 0, isExpired: false, totalSeconds: 0 });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const expiration = new Date(expirationDatetime).getTime();
      const difference = expiration - now;

      if (difference <= 0) {
        return { hours: 0, minutes: 0, seconds: 0, isExpired: true, totalSeconds: 0 };
      }

      const totalSeconds = Math.floor(difference / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      return { hours, minutes, seconds, isExpired: false, totalSeconds };
    };

    // Initial calculation
    setTimeLeft(calculateTimeLeft());

    // Update every second
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(interval);
  }, [expirationDatetime]);

  // Format number with leading zero
  const pad = (n: number) => n.toString().padStart(2, '0');

  if (timeLeft.isExpired) {
    return (
      <Badge 
        variant="destructive" 
        className={cn('gap-1 font-mono animate-pulse', className)}
      >
        <Timer className="h-3 w-3" />
        EXPIRADO
      </Badge>
    );
  }

  // Determine urgency level for styling
  const isUrgent = timeLeft.totalSeconds < 1800; // Less than 30 minutes
  const isCritical = timeLeft.totalSeconds < 600; // Less than 10 minutes

  return (
    <Badge 
      variant="outline"
      className={cn(
        'gap-1.5 font-mono text-xs tabular-nums transition-colors',
        isCritical && 'bg-destructive/20 text-destructive border-destructive/50 animate-pulse',
        !isCritical && isUrgent && 'bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/50',
        !isUrgent && 'bg-primary/10 text-primary border-primary/30',
        className
      )}
    >
      <Clock className="h-3 w-3" />
      {pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}
    </Badge>
  );
}
