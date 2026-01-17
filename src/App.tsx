import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { ThemeProvider } from "@/hooks/useTheme";
import { PrivacyModeProvider } from "@/hooks/usePrivacyMode";
import { MenuStyleProvider } from "@/hooks/useMenuStyle";
import { AppLayout } from "@/components/layout/AppLayout";
import { ExpirationNotificationProvider } from "@/components/ExpirationNotificationProvider";
import { SystemAccessRequired, AdminOnly, SellerOnly } from "@/components/ProtectedRoute";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import AccessDenied from "./pages/AccessDenied";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Servers from "./pages/Servers";
import Panels from "./pages/Panels";
import Plans from "./pages/Plans";
import Bills from "./pages/Bills";
import Coupons from "./pages/Coupons";
import Referrals from "./pages/Referrals";
import Templates from "./pages/Templates";
import Sellers from "./pages/Sellers";
import Reports from "./pages/Reports";
import Backup from "./pages/Backup";
import Settings from "./pages/Settings";
import ExternalApps from "./pages/ExternalApps";
import ServerIcons from "./pages/ServerIcons";
import PanelResellers from "./pages/PanelResellers";
import AdminServerTemplates from "./pages/AdminServerTemplates";

import MessageHistory from "./pages/MessageHistory";
import Tutorials from "./pages/Tutorials";
import ForcePasswordUpdate from "./pages/ForcePasswordUpdate";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Wrapper to check if user needs password update and redirect if no access
function PasswordUpdateGuard({ children }: { children: React.ReactNode }) {
  const { user, needsPasswordUpdate, loading, hasSystemAccess } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    // Se usuário logado sem acesso ao sistema, redireciona para access-denied
    if (!loading && user && !hasSystemAccess) {
      navigate('/access-denied', { replace: true });
    }
  }, [loading, user, hasSystemAccess, navigate]);
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }
  
  // Aguarda o redirecionamento acontecer via useEffect
  if (user && !hasSystemAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Redirecionando...</p>
        </div>
      </div>
    );
  }
  
  if (user && needsPasswordUpdate) {
    return <ForcePasswordUpdate />;
  }
  
  return <>{children}</>;
}

const AppRoutes = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/auth" replace />} />
        <Route path="/landing" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/access-denied" element={<AccessDenied />} />
        <Route path="/force-password-update" element={<ForcePasswordUpdate />} />
        {/* Redirect old shared-panels route to servers */}
        <Route path="/shared-panels" element={<Navigate to="/servers" replace />} />
        
        {/* Protected routes - require system access (admin or seller) */}
        <Route element={
          <PasswordUpdateGuard>
            <AppLayout />
          </PasswordUpdateGuard>
        }>
          {/* Dashboard - accessible to both admin and seller */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/tutorials" element={<Tutorials />} />
          <Route path="/templates" element={<Templates />} />
          
          {/* Seller-only routes (revendedor) */}
          <Route path="/clients" element={<Clients />} />
          <Route path="/servers" element={<Servers />} />
          <Route path="/panel-resellers" element={<PanelResellers />} />
          <Route path="/panels" element={<Panels />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/coupons" element={<Coupons />} />
          <Route path="/referrals" element={<Referrals />} />
          <Route path="/message-history" element={<MessageHistory />} />
          <Route path="/external-apps" element={<ExternalApps />} />
          
          {/* Admin-only routes */}
          <Route path="/sellers" element={
            <AdminOnly><Sellers /></AdminOnly>
          } />
          <Route path="/reports" element={
            <AdminOnly><Reports /></AdminOnly>
          } />
          <Route path="/backup" element={
            <AdminOnly><Backup /></AdminOnly>
          } />
          <Route path="/server-icons" element={
            <AdminOnly><ServerIcons /></AdminOnly>
          } />
          <Route path="/server-templates" element={
            <AdminOnly><AdminServerTemplates /></AdminOnly>
          } />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <PrivacyModeProvider>
          <MenuStyleProvider>
            <ExpirationNotificationProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <AppRoutes />
              </TooltipProvider>
            </ExpirationNotificationProvider>
          </MenuStyleProvider>
        </PrivacyModeProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
