import { useState, useMemo } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBruteForce } from '@/hooks/useBruteForce';
import { validatePasswordStrength } from '@/hooks/usePasswordValidation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Eye, EyeOff, Users, AlertTriangle, Phone, Check, X, Info } from 'lucide-react';

function Auth() {
  const { user, loading, signIn, signUp, authState } = useAuth();
  const { checkLoginAttempt, recordLoginAttempt } = useBruteForce();

  // Fetch dynamic trial days from settings
  const { data: trialDays } = useQuery({
    queryKey: ['seller_trial_days'],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'seller_trial_days')
        .maybeSingle();
      return data?.value || '5';
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(10);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerWhatsapp, setRegisterWhatsapp] = useState('');

  // Password strength validation
  const passwordValidation = useMemo(() => {
    return validatePasswordStrength(registerPassword);
  }, [registerPassword]);

  const passwordRequirements = useMemo(() => [
    { label: 'Mínimo 8 caracteres', met: registerPassword.length >= 8 },
    { label: 'Letra maiúscula', met: /[A-Z]/.test(registerPassword) },
    { label: 'Letra minúscula', met: /[a-z]/.test(registerPassword) },
    { label: 'Número', met: /[0-9]/.test(registerPassword) },
    { label: 'Símbolo especial', met: /[^a-zA-Z0-9]/.test(registerPassword) },
  ], [registerPassword]);

  // CRITICAL: Show loading while auth is being verified
  // This prevents showing auth page briefly before redirect
  if (loading || authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Verificando sessão...</p>
        </div>
      </div>
    );
  }

  // Only redirect if authenticated (session confirmed)
  if (authState === 'authenticated' && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const normalizeEmail = (value: string) => value.trim().toLowerCase();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const email = normalizeEmail(loginEmail);

    // Check if user is blocked
    const { isBlocked: blocked, remainingAttempts: remaining } = await checkLoginAttempt(email);

    if (blocked) {
      setIsBlocked(true);
      toast.error('Conta bloqueada temporariamente. Tente novamente em 15 minutos.');
      setIsLoading(false);
      return;
    }

    setRemainingAttempts(remaining);

    const { error } = await signIn(email, loginPassword);

    if (error) {
      // Record failed attempt
      await recordLoginAttempt(email, false);

      const newRemaining = remaining - 1;
      setRemainingAttempts(newRemaining);

      if (newRemaining <= 0) {
        setIsBlocked(true);
        toast.error('Conta bloqueada após muitas tentativas. Aguarde 15 minutos.');
      } else if (newRemaining <= 3) {
        toast.error(`Email ou senha incorretos (ou email não cadastrado). ${newRemaining} tentativas restantes.`);
      } else if (error.message.includes('Invalid login credentials')) {
        toast.error('Email ou senha incorretos (ou email não cadastrado)');
      } else {
        toast.error(error.message);
      }
    } else {
      // Record successful attempt (clears failed attempts)
      await recordLoginAttempt(email, true);
      toast.success('Login realizado com sucesso!');
    }

    setIsLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const email = normalizeEmail(registerEmail);

    // Validate password strength
    if (!passwordValidation.isValid) {
      toast.error('A senha não atende aos requisitos mínimos de segurança');
      setIsLoading(false);
      return;
    }

    // Validate WhatsApp format
    if (registerWhatsapp.length < 10 || registerWhatsapp.length > 15) {
      toast.error('WhatsApp deve ter entre 10 e 15 dígitos');
      setIsLoading(false);
      return;
    }

    const { error, needsEmailConfirmation } = await signUp(email, registerPassword, registerName, registerWhatsapp);

    if (error) {
      const msg = error.message || '';

      if (msg.includes('already registered')) {
        toast.error('Este email já está cadastrado');
      } else if (msg.includes('over_email_send_rate_limit')) {
        toast.error('Aguarde um pouco e tente novamente. Limite de envio de email atingido.');
      } else {
        toast.error(error.message);
      }
    } else {
      if (needsEmailConfirmation) {
        toast.success('Conta criada! Agora confirme o email (caixa de entrada ou spam) para conseguir entrar.');
      } else {
        toast.success('Conta criada com sucesso! Você já pode fazer login.');
      }
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {/* Background gradient effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 pointer-events-none" />
      
      <div className="w-full max-w-md relative z-10 animate-fade-in">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">PSControl</h1>
          <p className="text-muted-foreground mt-2">Sistema de gestão para revendedores</p>
          <Link 
            to="/landing" 
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
          >
            <Info className="h-4 w-4" />
            Saiba mais sobre o sistema
          </Link>
        </div>

        {isBlocked && (
          <div className="mb-4 p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Conta bloqueada temporariamente</p>
              <p className="text-xs text-muted-foreground mt-1">
                Muitas tentativas de login falharam. Aguarde 15 minutos para tentar novamente.
              </p>
            </div>
          </div>
        )}

        <Card className="border-border/50 shadow-xl">
          <Tabs defaultValue="login" className="w-full">
            <div className="p-6 pb-2">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="register">Cadastrar</TabsTrigger>
              </TabsList>
            </div>

            <CardContent className="pt-4">
              <TabsContent value="login" className="mt-0">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      disabled={isLoading || isBlocked}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Senha</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                        disabled={isLoading || isBlocked}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {remainingAttempts <= 5 && remainingAttempts > 0 && (
                    <p className="text-xs text-warning">
                      {remainingAttempts} tentativas restantes antes do bloqueio
                    </p>
                  )}

                  <Button type="submit" className="w-full" disabled={isLoading || isBlocked}>
                    {isLoading ? 'Entrando...' : 'Entrar'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register" className="mt-0">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-name">Nome completo</Label>
                    <Input
                      id="register-name"
                      type="text"
                      placeholder="Seu nome"
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      required
                      disabled={isLoading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-whatsapp">WhatsApp</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-whatsapp"
                        type="tel"
                        placeholder="5511999999999"
                        className="pl-10"
                        value={registerWhatsapp}
                        onChange={(e) => setRegisterWhatsapp(e.target.value.replace(/\D/g, ''))}
                        required
                        disabled={isLoading}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Apenas números com código do país (ex: 5511999999999)</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      required
                      disabled={isLoading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-password">Senha</Label>
                    <div className="relative">
                      <Input
                        id="register-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Senha segura"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        required
                        disabled={isLoading}
                        className={registerPassword && !passwordValidation.isValid ? 'border-destructive' : ''}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    
                    {/* Password strength indicator */}
                    {registerPassword && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={(passwordValidation.score / 5) * 100} 
                            className="h-2 flex-1"
                          />
                          <span className={`text-xs font-medium ${
                            passwordValidation.score <= 2 ? 'text-destructive' :
                            passwordValidation.score <= 3 ? 'text-warning' :
                            'text-green-500'
                          }`}>
                            {passwordValidation.score <= 2 ? 'Fraca' :
                             passwordValidation.score <= 3 ? 'Média' :
                             passwordValidation.score <= 4 ? 'Boa' : 'Forte'}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-1">
                          {passwordRequirements.map((req, i) => (
                            <div key={i} className="flex items-center gap-1 text-xs">
                              {req.met ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <X className="h-3 w-3 text-muted-foreground" />
                              )}
                              <span className={req.met ? 'text-green-500' : 'text-muted-foreground'}>
                                {req.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Criando conta...' : 'Criar conta'}
                  </Button>

                  <div className="flex items-center justify-center gap-2 text-sm font-medium text-green-500 bg-green-500/10 p-3 rounded-lg">
                    <span>🎁 Cadastre-se e ganhe {trialDays || '5'} dias grátis</span>
                  </div>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}

export default Auth;