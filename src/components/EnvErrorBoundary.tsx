/**
 * Environment Error Boundary
 * 
 * Displays a user-friendly error message when environment variables
 * are missing or misconfigured, instead of a blank/broken page.
 * 
 * This component should wrap the entire application in main.tsx
 * 
 * @component
 * @version 2.0.0
 * @updated 2026-01-24
 */
import { useEffect, useState } from 'react';
import { validateEnv, getEnvSummary, getEnvironmentName, type ValidationResult } from '@/lib/env';
import { AlertTriangle, RefreshCw, ExternalLink, Copy, Check, Terminal } from 'lucide-react';

interface EnvErrorBoundaryProps {
  children: React.ReactNode;
}

export function EnvErrorBoundary({ children }: EnvErrorBoundaryProps) {
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [checked, setChecked] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const result = validateEnv();
    setValidationResult(result);
    setChecked(true);
  }, []);

  const handleCopyConfig = () => {
    const config = `
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_ANON_KEY
VITE_SUPABASE_PROJECT_ID=YOUR_PROJECT_ID
    `.trim();
    navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Still validating
  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Validando configuração...</p>
        </div>
      </div>
    );
  }

  // Environment errors detected
  if (validationResult && !validationResult.valid) {
    const envSummary = getEnvSummary();
    const envName = getEnvironmentName();

    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-xl space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </div>

          {/* Title */}
          <div className="text-center space-y-2">
            <h1 className="text-xl font-bold text-white">
              Erro de Configuração do Ambiente
            </h1>
            <p className="text-gray-400 text-sm">
              O aplicativo não pôde iniciar porque faltam variáveis de ambiente obrigatórias.
            </p>
          </div>

          {/* Error List */}
          <div className="bg-gray-900/50 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium text-red-400 flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Erros Críticos ({validationResult.errors.length}):
            </p>
            {validationResult.errors.map((error, index) => (
              <div 
                key={index}
                className="flex items-start gap-2 text-sm text-red-400 ml-6"
              >
                <span className="text-red-500 mt-0.5">•</span>
                <span>{error}</span>
              </div>
            ))}
          </div>

          {/* Warnings */}
          {validationResult.warnings.length > 0 && (
            <div className="bg-yellow-900/20 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-yellow-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Avisos ({validationResult.warnings.length}):
              </p>
              {validationResult.warnings.map((warning, index) => (
                <div 
                  key={index}
                  className="flex items-start gap-2 text-sm text-yellow-400/80 ml-6"
                >
                  <span className="text-yellow-500 mt-0.5">•</span>
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          {/* Current Status */}
          <div className="bg-gray-900/30 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-300 mb-3">Status Atual:</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(envSummary).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-500">{key}:</span>
                  <span className={value.includes('✓') ? 'text-green-400' : 'text-red-400'}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-4 text-sm text-gray-400">
            <p className="font-medium text-gray-300">Como resolver:</p>
            
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-300">1</span>
                <div>
                  <p className="text-gray-300">Acesse as configurações do seu projeto</p>
                  <p className="text-gray-500 text-xs mt-1">
                    {envName === 'vercel' 
                      ? 'Vercel Dashboard → Project → Settings → Environment Variables'
                      : envName === 'lovable'
                      ? 'Lovable → Settings → Backend → Connection Info'
                      : 'Copie .env.example para .env e preencha os valores'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-300">2</span>
                <div>
                  <p className="text-gray-300">Adicione as variáveis necessárias</p>
                  <button
                    onClick={handleCopyConfig}
                    className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-gray-700 rounded text-xs hover:bg-gray-600 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3 w-3 text-green-400" />
                        <span className="text-green-400">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copiar template</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-300">3</span>
                <p className="text-gray-300">
                  {envName === 'vercel' 
                    ? 'Faça um novo deploy do projeto'
                    : 'Reinicie o servidor de desenvolvimento'}
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar Novamente
            </button>
            
            <a
              href="https://docs.lovable.dev/features/backend/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 text-gray-200 rounded-lg font-medium hover:bg-gray-600 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Ver Documentação
            </a>
          </div>

          {/* Technical Info */}
          <div className="pt-2 border-t border-gray-700">
            <p className="text-xs text-gray-500 text-center">
              Ambiente: <span className="text-gray-400">{import.meta.env.MODE}</span> | 
              Host: <span className="text-gray-400">{typeof window !== 'undefined' ? window.location.hostname : 'unknown'}</span> |
              Detectado: <span className="text-gray-400">{envName}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // All good, render children
  return <>{children}</>;
}
