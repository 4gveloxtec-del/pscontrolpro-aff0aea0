import { useState, useMemo, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Crown, Check, ChevronDown } from 'lucide-react';
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
  defaultCategory?: string | null;
}

type DurationFilter = '30' | '90' | '180' | '365';
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

const getDurationBorder = (days: number) => {
  if (days === 30) return 'border-blue-500/30';
  if (days === 90) return 'border-emerald-500/30';
  if (days === 180) return 'border-amber-500/30';
  if (days === 365) return 'border-purple-500/30';
  return 'border-muted';
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
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('30');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [screensFilter, setScreensFilter] = useState<ScreensFilter>('all');
  const [isListOpen, setIsListOpen] = useState<boolean>(!value); // Lista aberta se não tem plano selecionado

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
      const matchesDuration = plan.duration_days === Number(durationFilter);
      const matchesCategory = categoryFilter === 'all' || plan.category === categoryFilter;
      const matchesScreens = screensFilter === 'all' || (plan.screens || 1) === Number(screensFilter);
      return matchesDuration && matchesCategory && matchesScreens;
    });
  }, [sortedPlans, durationFilter, categoryFilter, screensFilter]);

  // Check if we have screens info
  const hasScreens = plans.some(p => p.screens && p.screens > 1);

  // Find selected plan for display
  const selectedPlan = useMemo(() => {
    return plans.find(p => p.id === value);
  }, [plans, value]);

  // Handle plan selection
  const handleSelectPlan = (planId: string) => {
    onValueChange(planId);
    setIsListOpen(false); // Fecha a lista após selecionar
  };

  // Handle filter click - opens the list
  const handleFilterClick = (filter: DurationFilter) => {
    setDurationFilter(filter);
    setIsListOpen(true); // Abre a lista ao clicar em filtro
  };

  return (
    <div className={cn("space-y-2", className)}>
      {showFilters && (
        <div className="space-y-1.5 sm:space-y-2">
          {/* Duration Filter - horizontal scroll on mobile */}
          <div className="flex gap-0.5 sm:gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            <button
              type="button"
              onClick={() => handleFilterClick('30')}
              className={cn(
                "px-2 py-1 text-[10px] sm:text-xs rounded-md transition-colors whitespace-nowrap flex-shrink-0",
                durationFilter === '30' 
                  ? "bg-blue-500 text-white" 
                  : "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
              )}
            >
              30d
            </button>
            <button
              type="button"
              onClick={() => handleFilterClick('90')}
              className={cn(
                "px-2 py-1 text-[10px] sm:text-xs rounded-md transition-colors whitespace-nowrap flex-shrink-0",
                durationFilter === '90' 
                  ? "bg-emerald-500 text-white" 
                  : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
              )}
            >
              90d
            </button>
            <button
              type="button"
              onClick={() => handleFilterClick('180')}
              className={cn(
                "px-2 py-1 text-[10px] sm:text-xs rounded-md transition-colors whitespace-nowrap flex-shrink-0",
                durationFilter === '180' 
                  ? "bg-amber-500 text-white" 
                  : "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
              )}
            >
              180d
            </button>
            <button
              type="button"
              onClick={() => handleFilterClick('365')}
              className={cn(
                "px-2 py-1 text-[10px] sm:text-xs rounded-md transition-colors whitespace-nowrap flex-shrink-0",
                durationFilter === '365' 
                  ? "bg-purple-500 text-white" 
                  : "bg-purple-500/10 text-purple-500 hover:bg-purple-500/20"
              )}
            >
              365d
            </button>
          </div>

          {/* Category and Screens Filters */}
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}>
              <SelectTrigger className="h-6 sm:h-7 w-auto min-w-[70px] sm:min-w-[90px] text-[10px] sm:text-xs">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
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
                <SelectTrigger className="h-6 sm:h-7 w-auto min-w-[60px] sm:min-w-[80px] text-[10px] sm:text-xs">
                  <SelectValue placeholder="Telas" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
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

      {/* Selected Plan Display (when list is closed and has selection) */}
      {!isListOpen && selectedPlan && (
        <button
          type="button"
          onClick={() => setIsListOpen(true)}
          className={cn(
            "w-full flex items-center justify-between p-2.5 rounded-lg border-2 transition-colors",
            getDurationBg(selectedPlan.duration_days),
            getDurationBorder(selectedPlan.duration_days),
            "hover:opacity-80"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn(
              "inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-medium min-w-[50px] flex-shrink-0",
              getDurationBg(selectedPlan.duration_days),
              getDurationColor(selectedPlan.duration_days)
            )}>
              {getDurationLabel(selectedPlan.duration_days)}
            </span>
            <span className="truncate text-sm font-medium">{selectedPlan.name}</span>
            <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs text-muted-foreground">
              R$ {selectedPlan.price.toFixed(2)}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
      )}

      {/* Plans List (when open or no selection) */}
      {isListOpen && (
        <div className="border rounded-lg overflow-hidden bg-background">
          {filteredPlans.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">
              Nenhum plano encontrado
            </div>
          ) : (
            <div className="max-h-[200px] sm:max-h-[250px] overflow-y-auto">
              {filteredPlans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => handleSelectPlan(plan.id)}
                  className={cn(
                    "w-full flex items-center gap-2 p-2 text-left transition-colors border-b last:border-b-0",
                    getDurationBg(plan.duration_days),
                    value === plan.id 
                      ? "ring-2 ring-inset ring-primary" 
                      : "hover:brightness-95"
                  )}
                >
                  <span className={cn(
                    "inline-flex items-center justify-center px-1 sm:px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-medium min-w-[40px] sm:min-w-[50px] flex-shrink-0",
                    getDurationBg(plan.duration_days),
                    getDurationColor(plan.duration_days)
                  )}>
                    {getDurationLabel(plan.duration_days)}
                  </span>
                  <span className="truncate flex-1 text-xs sm:text-sm">{plan.name}</span>
                  {value === plan.id && (
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  )}
                  <span className="text-muted-foreground text-[10px] sm:text-xs flex-shrink-0">
                    R$ {plan.price.toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Placeholder when no selection and list closed (edge case) */}
      {!isListOpen && !selectedPlan && (
        <button
          type="button"
          onClick={() => setIsListOpen(true)}
          className="w-full flex items-center justify-between p-2.5 rounded-lg border border-input bg-background text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <span className="text-sm">{placeholder}</span>
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
