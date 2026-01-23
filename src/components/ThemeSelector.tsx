import { useTheme, themes, ThemeColor } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { Check, Moon, Sun } from 'lucide-react';

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
      {themes.map((t) => (
        <button
          key={t.id}
          onClick={() => setTheme(t.id)}
          className={cn(
            'relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-300 text-left',
            theme === t.id 
              ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20' 
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
          )}
        >
          {/* Color Preview */}
          <div className="relative">
            <div 
              className={cn(
                "w-12 h-12 rounded-xl shadow-lg flex items-center justify-center",
                t.isDark ? "ring-1 ring-white/20" : "ring-1 ring-black/10"
              )}
              style={{ 
                backgroundColor: t.color,
                boxShadow: `0 4px 20px ${t.color}40`
              }}
            >
              {t.isDark ? (
                <Moon className="w-5 h-5 text-white/90" />
              ) : (
                <Sun className="w-5 h-5 text-white" />
              )}
            </div>
            {theme === t.id && (
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center ring-2 ring-background">
                <Check className="w-3 h-3 text-primary-foreground" />
              </div>
            )}
          </div>

          {/* Text Info */}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-foreground">{t.name}</div>
            <div className="text-xs text-muted-foreground truncate">{t.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
