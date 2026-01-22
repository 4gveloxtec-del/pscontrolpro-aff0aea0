import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useEffect, Suspense, lazy, memo } from "react";
import { ThemeProvider } from "@/hooks/useTheme";
import { PrivacyModeProvider } from "@/hooks/usePrivacyMode";
import { MenuStyleProvider } from "@/hooks/useMenuStyle";
import { AdminManifestProvider } from "@/hooks/useAdminManifest";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { ExpirationNotificationProvider } from "@/components/ExpirationNotificationProvider";
import { SystemAccessRequired, AdminOnly, SellerOnly } from "@/components/ProtectedRoute";
import { AdminProtectedRoute } from "@/components/AdminProtectedRoute";
import { OnlineRequired } from "@/components/OnlineRequired";
import { useClearOfflineData } from "@/hooks/useClearOfflineData";

// Lazy load pages for better performance
const Landing = lazy(() => import("./pages/Landing"));
const Auth = lazy(() => import("./pages/Auth"));
const AdminAuth = lazy(() => import("./pages/AdminAuth"));
const AdminAccessDenied = lazy(() => import("./pages/AdminAccessDenied"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AccessDenied = lazy(() => import("./pages/AccessDenied"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Clients = lazy(() => import("./pages/Clients"));
const Servers = lazy(() => import("./pages/Servers"));
const Panels = lazy(() => import("./pages/Panels"));
const Plans = lazy(() => import("./pages/Plans"));
const Bills = lazy(() => import("./pages/Bills"));
const Coupons = lazy(() => import("./pages/Coupons"));
const Referrals = lazy(() => import("./pages/Referrals"));
const Templates = lazy(() => import("./pages/Templates"));
const Sellers = lazy(() => import("./pages/Sellers"));
const Reports = lazy(() => import("./pages/Reports"));
const Backup = lazy(() => import("./pages/Backup"));
const Settings = lazy(() => import("./pages/Settings"));
const ExternalApps = lazy(() => import("./pages/ExternalApps"));
const MyApps = lazy(() => import("./pages/MyApps"));
const ServerIcons = lazy(() => import("./pages/ServerIcons"));
const PanelResellers = lazy(() => import("./pages/PanelResellers"));
const AdminServerTemplates = lazy(() => import("./pages/AdminServerTemplates"));
const WhatsAppAutomation = lazy(() => import("./pages/WhatsAppAutomation"));
const MessageHistory = lazy(() => import("./pages/MessageHistory"));
const Tutorials = lazy(() => import("./pages/Tutorials"));
const SystemHealth = lazy(() => import("./pages/SystemHealth"));
const ForcePasswordUpdate = lazy(() => import("./pages/ForcePasswordUpdate"));
const TestCommands = lazy(() => import("./pages/TestCommands"));
const ClientLookup = lazy(() => import("./pages/ClientLookup"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ProjectDocumentation = lazy(() => import("./pages/ProjectDocumentation"));

// Loading fallback component - lightweight
const PageLoader = memo(() => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
));
PageLoader.displayName = 'PageLoader';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000, // 1 minute (increased for less refetching)
      gcTime: 600000, // 10 minutes
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Prevent refetch on component mount
      retry: 1,
    },
  },
});

// Componente para detectar ?panel=admin e redirecionar corretamente
function RootRedirect() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const panelParam = searchParams.get('panel');
  
  // Se veio do PWA ADM (?panel=admin), redireciona para /admin
  if (panelParam === 'admin') {
    return <Navigate to="/admin" replace />;
  }
  
  // Caso contrário, vai para auth (comportamento padrão do revendedor)
  return <Navigate to="/auth" replace />;
}

// Wrapper to check if user needs password update and redirect if no access
function PasswordUpdateGuard({ children }: { children: React.ReactNode }) {
  const { user, needsPasswordUpdate, loading, hasSystemAccess, authState } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    // ONLY redirect if auth is fully verified and user doesn't have access
    // Never redirect during loading state
    if (authState === 'authenticated' && user && !hasSystemAccess) {
      navigate('/access-denied', { replace: true });
    }
  }, [authState, user, hasSystemAccess, navigate]);
  
  // CRITICAL: Show loading while auth is being verified
  // This prevents premature redirects on page reload
  if (loading || authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }
  
  // If unauthenticated, redirect to auth
  // IMPORTANT: Don't force redirect if auth is marked authenticated but user
  // object hasn't been restored yet (network slow / session restore pending).
  // This prevents "white screen"/redirect loops.
  if (authState === 'unauthenticated') {
    return <Navigate to="/auth" replace />;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Reconectando...</p>
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
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AdminManifestProvider>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Rota raiz: detecta ?panel=admin para PWA ADM, senão vai para auth */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="/landing" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/access-denied" element={<AccessDenied />} />
        <Route path="/force-password-update" element={<ForcePasswordUpdate />} />
        <Route path="/project-docs" element={<ProjectDocumentation />} />
        {/* Redirect old shared-panels route to servers */}
        <Route path="/shared-panels" element={<Navigate to="/servers" replace />} />
        
        {/* ============ ADMIN PWA ROUTES ============ */}
        {/* Login do Admin */}
        <Route path="/admin" element={<AdminAuth />} />
        <Route path="/admin/access-denied" element={<AdminAccessDenied />} />
        
        {/* Rotas protegidas do Admin */}
        <Route element={
          <AdminProtectedRoute>
            <AdminLayout />
          </AdminProtectedRoute>
        }>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/sellers" element={<Sellers />} />
          <Route path="/admin/reports" element={<Reports />} />
          <Route path="/admin/backup" element={<Backup />} />
          <Route path="/admin/server-icons" element={<ServerIcons />} />
          <Route path="/admin/server-templates" element={<AdminServerTemplates />} />
          <Route path="/admin/tutorials" element={<Tutorials />} />
          <Route path="/admin/system-health" element={<SystemHealth />} />
          <Route path="/admin/settings" element={<Settings />} />
        </Route>
        {/* ============ FIM ADMIN PWA ROUTES ============ */}
        
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
          <Route path="/whatsapp-automation" element={<WhatsAppAutomation />} />
          
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
          <Route path="/my-apps" element={<MyApps />} />
          <Route path="/test-commands" element={<TestCommands />} />
          <Route path="/consulta-avancada" element={<SellerOnly><ClientLookup /></SellerOnly>} />
          
          {/* Admin-only routes (legacy - mantidos para compatibilidade) */}
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
      </Suspense>
      </AdminManifestProvider>
    </BrowserRouter>
  );
};

// App initialization hook for clearing offline data
function AppInitializer({ children }: { children: React.ReactNode }) {
  useClearOfflineData();
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <div className="mobile-frame-outer">
        <div className="mobile-frame-inner">
          <OnlineRequired>
            <AppInitializer>
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
            </AppInitializer>
          </OnlineRequired>
        </div>
      </div>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
