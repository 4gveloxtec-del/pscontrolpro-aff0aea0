import { useMenuStyle, MenuStyle } from '@/hooks/useMenuStyle';
import { cn } from '@/lib/utils';
import { LayoutGrid, AlignJustify, Grid3X3 } from 'lucide-react';

interface StyleOption {
  value: MenuStyle;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const styleOptions: StyleOption[] = [
  {
    value: 'default',
    label: 'Padrão',
    description: 'Ícones com texto',
    icon: AlignJustify,
  },
  {
    value: 'compact',
    label: 'Compacto',
    description: 'Ícones grandes',
    icon: LayoutGrid,
  },
  {
    value: 'icons-only',
    label: 'Apenas Ícones',
    description: 'Modo minimalista',
    icon: Grid3X3,
  },
];

export function MenuStyleSelector() {
  const { menuStyle, setMenuStyle } = useMenuStyle();

  return (
    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
      {styleOptions.map((option) => {
        const isActive = menuStyle === option.value;
        const Icon = option.icon;
        
        return (
          <button
            key={option.value}
            onClick={() => setMenuStyle(option.value)}
            className={cn(
              'flex flex-col items-center gap-1 sm:gap-2 p-2 sm:p-3 rounded-xl border-2 transition-all duration-200',
              isActive
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/50 hover:bg-muted/50'
            )}
          >
            <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
            <div className="text-center">
              <p className="text-[10px] sm:text-xs font-medium">{option.label}</p>
              <p className="text-[8px] sm:text-[10px] opacity-70 hidden xs:block">{option.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
