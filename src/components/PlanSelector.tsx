import { useState, useMemo, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Crown } from 'lucide-react';
import { sortPlansForDisplay } from '@/lib/planStandardization';

export interface Plan {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  category?: string | null;
  screens?: number | null;
}

interface PlanSelectorProps {
  plans: Plan[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  showFilters?: boolean;
  compact?: boolean;
  defaultCategory?: string | null; // Pre-select category filter based on client's category
}

type DurationFilter = 'all' | '30' | '90' | '180' | '365';
type CategoryFilter = 'all' | 'IPTV' | 'P2P' | 'SSH' | 'Premium' | string;
type ScreensFilter = 'all' | '1' | '2' | '3';

const getDurationLabel = (days: number) => {
  if (days === 30) return 'Mensal';
  if (days === 90) return 'Trimestral';
  if (days === 180) return 'Semestral';
  if (days === 365) return 'Anual';
  return `${days}d`;
};

const getDurationColor = (days: number) => {
  if (days === 30) return 'text-blue-500';
  if (days === 90) return 'text-emerald-500';
  if (days === 180) return 'text-amber-500';
  if (days === 365) return 'text-purple-500';
  return 'text-muted-foreground';
};

const getDurationBg = (days: number) => {
  if (days === 30) return 'bg-blue-500/10';
  if (days === 90) return 'bg-emerald-500/10';
  if (days === 180) return 'bg-amber-500/10';
  if (days === 365) return 'bg-purple-500/10';
  return 'bg-muted/50';
};

export function PlanSelector({ 
  plans, 
  value, 
  onValueChange, 
  placeholder = "Selecione um plano",
  className,
  showFilters = true,
  compact = false,
  defaultCategory = null
}: PlanSelectorProps) {
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [screensFilter, setScreensFilter] = useState<ScreensFilter>('all');

  // Update category filter when defaultCategory changes
  useEffect(() => {
    if (defaultCategory && ['IPTV', 'P2P', 'SSH', 'Premium'].includes(defaultCategory)) {
      setCategoryFilter(defaultCategory as CategoryFilter);
    } else {
      setCategoryFilter('all');
    }
  }, [defaultCategory]);

  // Get all unique categories
  const allCategories = useMemo(() => {
    const defaultCats = ['IPTV', 'P2P', 'SSH', 'Premium'];
    const planCats = plans.map(p => p.category).filter(Boolean) as string[];
    return [...new Set([...defaultCats, ...planCats])];
  }, [plans]);

  // Group and sort plans
  const sortedPlans = useMemo(() => {
    return sortPlansForDisplay([...plans].filter((p) => p && p.name));
  }, [plans]);

  const filteredPlans = useMemo(() => {
    return sortedPlans.filter(plan => {
      const matchesDuration = durationFilter === 'all' || plan.duration_days === Number(durationFilter);
      const matchesCategory = categoryFilter === 'all' || plan.category === categoryFilter;
      const matchesScreens = screensFilter === 'all' || (plan.screens || 1) === Number(screensFilter);
      return matchesDuration && matchesCategory && matchesScreens;
    });
  }, [sortedPlans, durationFilter, categoryFilter, screensFilter]);

  // Check if we have screens info
  const hasScreens = plans.some(p => p.screens && p.screens > 1);

  return (
    <div className={cn("space-y-2", className)}>
      {showFilters && (
        <div className="space-y-2">
          {/* Duration Filter */}
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setDurationFilter('all')}
              className={cn(
                "px-2 py-1 text-xs rounded-md transition-colors",
                durationFilter === 'all' 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setDurationFilter('30')}
              className={cn(
                "px-2 py-1 text-xs rounded-md transition-colors",
                durationFilter === '30' 
                  ? "bg-blue-500 text-white" 
                  : "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
              )}
            >
              Mensal
            </button>
            <button
              type="button"
              onClick={() => setDurationFilter('90')}
              className={cn(
                "px-2 py-1 text-xs rounded-md transition-colors",
                durationFilter === '90' 
                  ? "bg-emerald-500 text-white" 
                  : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
              )}
            >
              Trimestral
            </button>
            <button
              type="button"
              onClick={() => setDurationFilter('180')}
              className={cn(
                "px-2 py-1 text-xs rounded-md transition-colors",
                durationFilter === '180' 
                  ? "bg-amber-500 text-white" 
                  : "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
              )}
            >
              Semestral
            </button>
            <button
              type="button"
              onClick={() => setDurationFilter('365')}
              className={cn(
                "px-2 py-1 text-xs rounded-md transition-colors",
                durationFilter === '365' 
                  ? "bg-purple-500 text-white" 
                  : "bg-purple-500/10 text-purple-500 hover:bg-purple-500/20"
              )}
            >
              Anual
            </button>
          </div>

          {/* Category and Screens Filters */}
          <div className="flex flex-wrap gap-2">
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}>
              <SelectTrigger className="h-7 w-auto min-w-[90px] text-xs">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {allCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    <span className="flex items-center gap-1">
                      {cat === 'Premium' && <Crown className="h-3 w-3 text-amber-500" />}
                      {cat}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasScreens && (
              <Select value={screensFilter} onValueChange={(v) => setScreensFilter(v as ScreensFilter)}>
                <SelectTrigger className="h-7 w-auto min-w-[80px] text-xs">
                  <SelectValue placeholder="Telas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="1">1 Tela</SelectItem>
                  <SelectItem value="2">2 Telas</SelectItem>
                  <SelectItem value="3">3 Telas</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      )}

      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={compact ? "h-9" : ""}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {filteredPlans.length === 0 ? (
            <div className="p-2 text-sm text-muted-foreground text-center">
              Nenhum plano encontrado
            </div>
          ) : (
            filteredPlans.map((plan) => (
              <SelectItem 
                key={plan.id} 
                value={plan.id}
                className={cn("flex items-center", getDurationBg(plan.duration_days))}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className={cn(
                    "inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-medium min-w-[50px]",
                    getDurationBg(plan.duration_days),
                    getDurationColor(plan.duration_days)
                  )}>
                    {getDurationLabel(plan.duration_days)}
                  </span>
                  <span className="truncate flex-1">{plan.name}</span>
                  <span className="text-muted-foreground text-xs">
                    R$ {plan.price.toFixed(2)}
                  </span>
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
