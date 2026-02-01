import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePasswordValidation, checkPasswordPwned, validatePasswordStrength } from '@/hooks/usePasswordValidation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Eye, EyeOff, Shield, AlertTriangle, Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ForcePasswordUpdate() {
  const { updatePassword, clearPasswordUpdateFlag, signOut, profile } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingPwned, setIsCheckingPwned] = useState(false);
  const [pwnedResult, setPwnedResult] = useState<{ checked: boolean; isPwned: boolean; count: number } | null>(null);

  const passwordValidation = validatePasswordStrength(newPassword);
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;

  const handlePasswordChange = async (password: string) => {
    setNewPassword(password);
    setPwnedResult(null);
    
    // Check HIBP when password is long enough
    if (password.length >= 8) {
      setIsCheckingPwned(true);
      const result = await checkPasswordPwned(password);
      setPwnedResult({ checked: true, ...result });
      setIsCheckingPwned(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!passwordValidation.isValid) {
      toast.error('A senha não atende aos requisitos mínimos');
      return;
    }

    if (!passwordsMatch) {
      toast.error('As senhas não conferem');
      return;
    }

    if (pwnedResult?.isPwned) {
      toast.error('Esta senha foi encontrada em vazamentos de dados. Escolha outra.');
      return;
    }

    setIsLoading(true);

    const { error } = await updatePassword(newPassword);

    if (error) {
      toast.error(error.message);
      setIsLoading(false);
      return;
    }

    await clearPasswordUpdateFlag();
    toast.success('Senha atualizada com sucesso!');
    
    // Small delay before redirecting
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 500);
  };

  const getStrengthColor = (score: number) => {
    if (score <= 2) return 'bg-destructive';
    if (score <= 3) return 'bg-warning';
    return 'bg-success';
  };

  const getStrengthLabel = (score: number) => {
    if (score <= 2) return 'Fraca';
    if (score <= 3) return 'Média';
    if (score <= 4) return 'Forte';
    return 'Muito Forte';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-3 sm:p-4 max-w-full overflow-x-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-warning/5 via-transparent to-warning/10 pointer-events-none" />
      
      <div className="w-full max-w-md relative z-10 animate-fade-in mx-auto">
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-warning/10 mb-3 sm:mb-4">
            <Shield className="w-7 h-7 sm:w-8 sm:h-8 text-warning" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Atualização de Senha</h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">Você precisa criar uma nova senha para continuar</p>
        </div>

        <Card className="border-warning/30 shadow-xl">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-warning text-base sm:text-lg">
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
              <span className="truncate">Senha Temporária Detectada</span>
            </CardTitle>
            <CardDescription className="text-sm">
              Sua conta está usando uma senha temporária. Por segurança, você deve criar uma nova senha.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="text-muted-foreground">Logado como:</p>
                <p className="font-medium">{profile?.email}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password">Nova Senha</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Mínimo 8 caracteres"
                    value={newPassword}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    required
                    disabled={isLoading}
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
                {newPassword.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Força da senha:</span>
                      <span className={cn(
                        passwordValidation.score <= 2 && 'text-destructive',
                        passwordValidation.score === 3 && 'text-warning',
                        passwordValidation.score >= 4 && 'text-success'
                      )}>
                        {getStrengthLabel(passwordValidation.score)}
                      </span>
                    </div>
                    <Progress 
                      value={(passwordValidation.score / 5) * 100} 
                      className={cn('h-2', getStrengthColor(passwordValidation.score))}
                    />
                  </div>
                )}

                {/* Password requirements */}
                {newPassword.length > 0 && passwordValidation.feedback.length > 0 && (
                  <ul className="text-xs space-y-1">
                    {passwordValidation.feedback.map((item, i) => (
                      <li key={i} className="flex items-center gap-1 text-muted-foreground">
                        <X className="h-3 w-3 text-destructive" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}

                {/* HIBP Check */}
                {newPassword.length >= 8 && (
                  <div className="flex items-center gap-2 text-xs">
                    {isCheckingPwned ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        <span className="text-muted-foreground">Verificando segurança...</span>
                      </>
                    ) : pwnedResult?.isPwned ? (
                      <>
                        <AlertTriangle className="h-3 w-3 text-destructive" />
                        <span className="text-destructive">
                          Esta senha apareceu em {pwnedResult.count.toLocaleString()} vazamentos!
                        </span>
                      </>
                    ) : pwnedResult?.checked ? (
                      <>
                        <Check className="h-3 w-3 text-success" />
                        <span className="text-success">Senha não encontrada em vazamentos</span>
                      </>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar Senha</Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Digite novamente"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
                {confirmPassword.length > 0 && (
                  <div className="flex items-center gap-1 text-xs">
                    {passwordsMatch ? (
                      <>
                        <Check className="h-3 w-3 text-success" />
                        <span className="text-success">Senhas conferem</span>
                      </>
                    ) : (
                      <>
                        <X className="h-3 w-3 text-destructive" />
                        <span className="text-destructive">Senhas não conferem</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading || !passwordValidation.isValid || !passwordsMatch || pwnedResult?.isPwned}
              >
                {isLoading ? 'Atualizando...' : 'Atualizar Senha'}
              </Button>

              <Button 
                type="button" 
                variant="ghost" 
                className="w-full text-muted-foreground" 
                onClick={signOut}
              >
                Sair da conta
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
