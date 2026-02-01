import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Home, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 max-w-full overflow-x-hidden">
      <div className="text-center max-w-sm mx-auto">
        <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-4 sm:mb-6">
          <AlertTriangle className="w-8 h-8 sm:w-10 sm:h-10 text-destructive" />
        </div>
        <h1 className="mb-2 text-5xl sm:text-6xl font-bold text-foreground">404</h1>
        <p className="mb-6 text-base sm:text-lg text-muted-foreground">
          Página não encontrada
        </p>
        <Button asChild className="gap-2">
          <a href="/">
            <Home className="h-4 w-4" />
            Voltar ao Início
          </a>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
