import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Users, CreditCard } from 'lucide-react';
import { SharedCreditPicker, SharedCreditSelection } from '@/components/SharedCreditPicker';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';

interface SharedCreditsSectionProps {
  sellerId: string;
  category: string;
  serverId?: string;
  planDurationDays?: number;
  selectedCredit: SharedCreditSelection | null;
  onSelect: (selection: SharedCreditSelection | null) => void;
  hasAvailableCredits?: boolean;
}

const STORAGE_KEY = 'shared-credits-enabled';

export function SharedCreditsSection({
  sellerId,
  category,
  serverId,
  planDurationDays,
  selectedCredit,
  onSelect,
}: SharedCreditsSectionProps) {
  // Load initial state from localStorage with try-catch for Safari Private Mode
  const [isEnabled, setIsEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'true';
    } catch {
      return false;
    }
  });

  // Save preference to localStorage with error handling
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isEnabled));
    } catch (error) {
      console.warn('Unable to save preference to localStorage:', error);
    }
  }, [isEnabled]);

  // Clear selection when disabled
  const handleToggle = (checked: boolean) => {
    setIsEnabled(checked);
    if (!checked) {
      onSelect(null);
    }
  };

  // Only show for valid categories
  const isValidCategory = category === 'IPTV' || category === 'P2P' || category === 'SSH' || category === 'Revendedor';
  
  if (!isValidCategory || !serverId) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Toggle Header */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border hover:border-primary/30 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <Label htmlFor="shared-credits-toggle" className="cursor-pointer font-medium text-sm">
              Créditos Compartilhados
            </Label>
            <p className="text-xs text-muted-foreground">
              Aproveite vagas existentes com desconto
            </p>
          </div>
        </div>
        <Switch
          id="shared-credits-toggle"
          checked={isEnabled}
          onCheckedChange={handleToggle}
        />
      </div>

      {/* Content - Only visible when enabled */}
      <Collapsible open={isEnabled}>
        <CollapsibleContent className="animate-accordion-down pt-1">
          <div className="rounded-lg border border-border bg-card/50 p-3">
            <SharedCreditPicker
              sellerId={sellerId}
              category={category}
              serverId={serverId}
              planDurationDays={planDurationDays}
              selectedCredit={selectedCredit}
              onSelect={onSelect}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
