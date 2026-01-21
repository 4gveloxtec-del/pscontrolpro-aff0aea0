import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { useAuth } from '@/hooks/useAuth';
import { useCrypto } from '@/hooks/useCrypto';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Upload, Copy, Check, AlertCircle, Loader2, FileSpreadsheet, HelpCircle } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PlanSelector } from '@/components/PlanSelector';
import { fetchExistingClientIdsByPhone, normalizeClientPhone } from '@/lib/idempotency';

interface Plan {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  category?: string | null;
  screens?: number | null;
}

interface BulkImportClientsProps {
  plans: Plan[];
}

interface ParsedClient {
  name: string;
  phone: string;
  login: string;
  password: string;
  category: string;
  server: string;
  price: number | null;
  expiration_date: string | null;
  detected_plan_id: string | null;
  detected_plan_name: string | null;
  detected_duration_days: number | null;
  valid: boolean;
  error?: string;
}

// Map common category variations to standard categories
const CATEGORY_MAPPINGS: Record<string, string> = {
  'iptv': 'IPTV',
  'ip tv': 'IPTV',
  'ip-tv': 'IPTV',
  'p2p': 'P2P',
  'peer to peer': 'P2P',
  'premium': 'Contas Premium',
  'contas premium': 'Contas Premium',
  'conta premium': 'Contas Premium',
  'ssh': 'SSH',
  'vps': 'SSH',
};

const TEMPLATE = `João Silva,11999998888,joao123,senha123,IPTV,WPLAY,25,31/01/2026
Maria Santos,11988887777,maria456,senha456,P2P,SERVER2,30,28/02/2026
Pedro Souza,11977776666,pedro789,senha789,Contas Premium,,40,
Ana Lima,11966665555,ana321,senha321,SSH,SSH-BR,15,15/03/2026`;

const TEMPLATE_HEADER = "Nome,Telefone,Usuário,Senha,Categoria,Servidor,Valor,Validade";

export function BulkImportClients({ plans }: BulkImportClientsProps) {
  const { user } = useAuth();
  const { encrypt } = useCrypto();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [defaultCategory, setDefaultCategory] = useState('IPTV');
  const [copied, setCopied] = useState(false);
  const [parsedClients, setParsedClients] = useState<ParsedClient[]>([]);
  const [step, setStep] = useState<'input' | 'preview'>('input');

  // Normalize category - accepts any category, but maps known variations
  const normalizeCategory = (cat: string): string => {
    const trimmed = (cat || '').trim();
    if (!trimmed) return '';
    
    const normalized = trimmed.toLowerCase();

    // Check for mapped variations
    const mapped = CATEGORY_MAPPINGS[normalized];
    if (mapped) return mapped;

    // Check for partial matches
    if (normalized.includes('iptv')) return 'IPTV';
    if (normalized.includes('p2p')) return 'P2P';
    if (normalized.includes('premium')) return 'Contas Premium';
    if (normalized.includes('ssh')) return 'SSH';

    // Return original category in uppercase for consistency
    return trimmed.toUpperCase();
  };

  // Find the best matching plan based on days until expiration and category
  const findMatchingPlan = (expirationDate: string | null, category: string): { id: string; name: string; duration_days: number; price: number } | null => {
    if (!expirationDate) return null;
    
    const today = new Date();
    const expDate = new Date(expirationDate);
    const daysUntilExpiration = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    // Map days to closest standard duration
    let targetDuration = 30; // default
    if (daysUntilExpiration <= 45) targetDuration = 30;
    else if (daysUntilExpiration <= 120) targetDuration = 90;
    else if (daysUntilExpiration <= 270) targetDuration = 180;
    else targetDuration = 365;
    
    // Find matching plan by category and duration
    const matchingPlans = plans.filter(p => 
      p.category === category && 
      p.duration_days === targetDuration
    );
    
    if (matchingPlans.length > 0) {
      // Prefer active plans, then by screens (1 first)
      const sorted = matchingPlans.sort((a, b) => {
        return (a.screens || 1) - (b.screens || 1);
      });
      const plan = sorted[0];
      return { id: plan.id, name: plan.name, duration_days: plan.duration_days, price: plan.price };
    }
    
    // Fallback: any plan with that duration
    const anyDurationMatch = plans.find(p => p.duration_days === targetDuration);
    if (anyDurationMatch) {
      return { id: anyDurationMatch.id, name: anyDurationMatch.name, duration_days: anyDurationMatch.duration_days, price: anyDurationMatch.price };
    }
    
    return null;
  };

  const parseClients = (text: string): ParsedClient[] => {
    const normalizedText = text.replace(/\r\n?/g, '\n').trim();
    const lines = normalizedText.split('\n').filter(line => line.trim());

    if (lines.length === 0) return [];

    const detectDelimiter = (line: string): string => {
      const semicolonCount = (line.match(/;/g) || []).length;
      const commaCount = (line.match(/,/g) || []).length;
      const tabCount = (line.match(/\t/g) || []).length;

      if (semicolonCount > commaCount && semicolonCount > tabCount) return ';';
      if (tabCount > commaCount) return '\t';
      return ',';
    };

    const delimiter = detectDelimiter(lines[0]);
    
    const splitRow = (row: string) =>
      row.split(delimiter).map(p => (p || '').trim().replace(/^["']|["']$/g, ''));

    const normalizeHeader = (h: string) =>
      (h || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-+/g, '_');

    const firstLine = lines[0].toLowerCase();
    const hasHeader = ['nome', 'name', 'telefone', 'phone', 'login', 'usuario', 'usuário', 'senha', 'password', 'categoria', 'category', 'servidor', 'server', 'valor', 'validade', 'vencimento', 'data_vencimento', 'preço', 'preco', 'plano'].some(k => firstLine.includes(k));
    
    // Parse headers if present to detect exported format
    const headers = hasHeader ? splitRow(lines[0]).map(normalizeHeader) : null;
    
    const findHeaderIndex = (aliases: string[]) => {
      if (!headers) return null;
      const aliasSet = new Set(aliases);
      const idx = headers.findIndex(h => aliasSet.has(h));
      return idx >= 0 ? idx : null;
    };
    
    // Detect exported format with header mapping
    const headerIdx = hasHeader ? {
      name: findHeaderIndex(['nome', 'name']),
      phone: findHeaderIndex(['telefone', 'phone', 'whatsapp', 'celular']),
      email: findHeaderIndex(['email', 'e_mail']),
      telegram: findHeaderIndex(['telegram']),
      category: findHeaderIndex(['categoria', 'category']),
      server: findHeaderIndex(['servidor', 'server']),
      login: findHeaderIndex(['login', 'usuario', 'usuário', 'user', 'username']),
      password: findHeaderIndex(['senha', 'password', 'pass']),
      server2: findHeaderIndex(['servidor_2', 'server_2', 'servidor2']),
      login2: findHeaderIndex(['login_2', 'login2']),
      password2: findHeaderIndex(['senha_2', 'senha2', 'password_2']),
      plan: findHeaderIndex(['plano', 'plan', 'plan_name']),
      price: findHeaderIndex(['preço', 'preco', 'price', 'valor', 'plan_price']),
      expiration: findHeaderIndex(['data_vencimento', 'vencimento', 'validade', 'expiration_date', 'expiration', 'expires_at']),
      device: findHeaderIndex(['dispositivo', 'device']),
      dns: findHeaderIndex(['dns']),
      is_paid: findHeaderIndex(['pago', 'is_paid', 'paid']),
      pending: findHeaderIndex(['valor_pendente', 'pending_amount', 'pendente']),
      notes: findHeaderIndex(['observações', 'observacoes', 'notes', 'obs']),
    } : null;
    
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const isUuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((value || '').trim());

    const hasLetters = (value: string) => /[A-Za-zÀ-ÿ]/.test(value || '');
    const digitsOnly = (value: string) => (value || '').replace(/\D/g, '');

    const pickPhone = (parts: string[]) => {
      const candidate = parts.map(digitsOnly).find(d => d.length >= 8 && d.length <= 15);
      return candidate || '';
    };

    const pickCategoryRaw = (parts: string[]) => {
      for (const p of parts) {
        if (normalizeCategory(p)) return p;
      }
      return '';
    };

    // Parse date in formats: dd/mm/yyyy, yyyy-mm-dd, yyyy/mm/dd
    const parseDate = (dateStr: string): string | null => {
      if (!dateStr) return null;
      const trimmed = dateStr.trim().replace(/^["']|["']$/g, '');
      
      if (!trimmed) return null;
      
      // dd/mm/yyyy format (Brazilian)
      const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (brMatch) {
        const [, day, month, year] = brMatch;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      
      // yyyy-mm-dd format (ISO)
      const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (isoMatch) {
        const [, year, month, day] = isoMatch;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      
      // yyyy/mm/dd format
      const isoSlashMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      if (isoSlashMatch) {
        const [, year, month, day] = isoSlashMatch;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      
      // dd-mm-yyyy format
      const brDashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (brDashMatch) {
        const [, day, month, year] = brDashMatch;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      
      console.warn('parseDate: Unrecognized date format:', trimmed);
      return null;
    };

    // Parse price value
    const parsePrice = (priceStr: string): number | null => {
      if (!priceStr) return null;
      const cleaned = priceStr.replace(/[^\d.,]/g, '').replace(',', '.');
      const value = parseFloat(cleaned);
      return isNaN(value) ? null : value;
    };

    return dataLines.map((line, index) => {
      const parts = splitRow(line);
      const rowNumber = index + (hasHeader ? 2 : 1);
      
      // If we have header mapping (exported format), use it
      if (hasHeader && headerIdx) {
        const get = (idx: number | null) => (idx === null ? '' : (parts[idx] ?? '').trim().replace(/^["']|["']$/g, ''));
        
        const name = get(headerIdx.name);
        const phone = get(headerIdx.phone);
        const login = get(headerIdx.login);
        const password = get(headerIdx.password);
        const categoryInput = get(headerIdx.category);
        const server = get(headerIdx.server);
        const priceInput = get(headerIdx.price);
        const expirationInput = get(headerIdx.expiration);
        
        // Debug logging for expiration parsing
        console.log('Parsing row:', rowNumber, '| expirationIdx:', headerIdx.expiration, '| raw value:', parts[headerIdx.expiration ?? -1], '| expirationInput:', expirationInput);
        
        if (!name || name.length < 2 || isUuid(name)) {
          return { 
            name: name || '', phone: '', login: '', password: '', category: defaultCategory, 
            server: '', price: null, expiration_date: null, 
            detected_plan_id: null, detected_plan_name: null, detected_duration_days: null,
            valid: false, error: `Linha ${rowNumber}: Nome é obrigatório` 
          };
        }
        
        // Use category from input or default
        let category = defaultCategory;
        if (categoryInput) {
          const normalized = normalizeCategory(categoryInput);
          category = normalized || categoryInput.toUpperCase();
        }
        
        const phoneDigits = digitsOnly(phone);
        const parsedPrice = parsePrice(priceInput);
        const parsedExpiration = parseDate(expirationInput);
        
        // Debug log parsed expiration
        console.log('Row', rowNumber, '| expirationInput:', expirationInput, '| parsedExpiration:', parsedExpiration);
        
        // Auto-detect plan based on expiration date and category
        const detectedPlan = findMatchingPlan(parsedExpiration, category);
        
        return {
          name: name.slice(0, 100),
          phone: phoneDigits.slice(0, 20),
          login: login.slice(0, 100),
          password: password.slice(0, 100),
          category,
          server: server.slice(0, 100),
          price: parsedPrice,
          expiration_date: parsedExpiration,
          detected_plan_id: detectedPlan?.id || null,
          detected_plan_name: detectedPlan?.name || null,
          detected_duration_days: detectedPlan?.duration_days || null,
          valid: true
        };
      }

      // Fallback: Standard positional format: Nome,Telefone,Usuário,Senha,Categoria,Servidor,Valor,Validade
      let name = parts[0] || '';
      let phone = parts[1] || '';
      let login = parts[2] || '';
      let password = parts[3] || '';
      let categoryInput = parts[4] || '';
      let server = parts[5] || '';
      let priceInput = parts[6] || '';
      let expirationInput = parts[7] || '';

      // Exported formats often start with UUID columns, with name/phone later
      if (name && isUuid(name)) {
        const nameCandidate = parts.find(p => hasLetters(p) && p.length >= 2) || '';
        const phoneCandidate = pickPhone(parts);
        const categoryCandidate = pickCategoryRaw(parts);

        name = nameCandidate || name;
        phone = phoneCandidate || '';
        login = '';
        password = '';
        categoryInput = categoryCandidate || '';
        server = '';
        priceInput = '';
        expirationInput = '';
      }

      if (!name || name.length < 2) {
        return { 
          name: '', phone: '', login: '', password: '', category: defaultCategory, 
          server: '', price: null, expiration_date: null, 
          detected_plan_id: null, detected_plan_name: null, detected_duration_days: null,
          valid: false, error: `Linha ${rowNumber}: Nome é obrigatório` 
        };
      }

      // Use category from input or default - accepts any category
      let category = defaultCategory;
      if (categoryInput) {
        const normalized = normalizeCategory(categoryInput);
        category = normalized || categoryInput.toUpperCase();
      }

      const phoneDigits = digitsOnly(phone);
      const parsedPrice = parsePrice(priceInput);
      const parsedExpiration = parseDate(expirationInput);
      
      // Auto-detect plan based on expiration date and category
      const detectedPlan = findMatchingPlan(parsedExpiration, category);

      return {
        name: name.slice(0, 100),
        phone: phoneDigits.slice(0, 20),
        login: login.slice(0, 100),
        password: password.slice(0, 100),
        category,
        server: server.slice(0, 100),
        price: parsedPrice,
        expiration_date: parsedExpiration,
        detected_plan_id: detectedPlan?.id || null,
        detected_plan_name: detectedPlan?.name || null,
        detected_duration_days: detectedPlan?.duration_days || null,
        valid: true
      };
    });
  };

  const handlePreview = () => {
    if (!inputText.trim()) {
      toast.error('Cole os dados dos clientes');
      return;
    }

    const parsed = parseClients(inputText);
    setParsedClients(parsed);
    setStep('preview');
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const validClients = parsedClients.filter(c => c.valid);
      if (validClients.length === 0) {
        throw new Error('Nenhum cliente válido para importar');
      }

      // Fallback plan (optional, used when no plan is auto-detected)
      const fallbackPlan = selectedPlanId ? plans.find(p => p.id === selectedPlanId) : null;
      const defaultPlan = fallbackPlan || plans[0]; // Use first plan as ultimate fallback
      
      if (!defaultPlan) throw new Error('Nenhum plano disponível');

      // Get unique server names from import (uppercase, non-empty)
      const uniqueServerNames = [...new Set(
        validClients
          .map(c => c.server?.trim().toUpperCase())
          .filter(Boolean)
      )] as string[];

      // Fetch existing servers for this seller
      const { data: existingServers } = await supabase
        .from('servers')
        .select('id, name')
        .eq('seller_id', user!.id);

      const serverMap = new Map<string, string>();
      (existingServers || []).forEach(s => {
        serverMap.set(s.name.toUpperCase(), s.id);
      });

      // Create servers that don't exist
      const serversToCreate = uniqueServerNames.filter(name => !serverMap.has(name));
      
      if (serversToCreate.length > 0) {
        const { data: newServers, error: serverError } = await supabase
          .from('servers')
          .insert(serversToCreate.map(name => ({
            seller_id: user!.id,
            name: name,
            is_active: true,
          })))
          .select('id, name');

        if (serverError) throw serverError;

        // Add new servers to map
        (newServers || []).forEach(s => {
          serverMap.set(s.name.toUpperCase(), s.id);
        });
      }

      // Prepare clients with encrypted credentials and server_id
      // Use auto-detected plan or fallback
      const preparedClients = await Promise.all(
        validClients.map(async (client) => {
          const encryptedLogin = client.login ? await encrypt(client.login) : null;
          const encryptedPassword = client.password ? await encrypt(client.password) : null;
          
          // Normalize server name and find server ID
          const originalServerName = client.server?.trim() || null;
          const serverNameUpper = originalServerName?.toUpperCase() || null;
          const serverId = serverNameUpper ? serverMap.get(serverNameUpper) || null : null;
          
          // Debug log to verify server mapping
          if (originalServerName && !serverId) {
            console.warn(`Server not found for: "${originalServerName}" (uppercase: "${serverNameUpper}")`);
            console.warn('Available servers:', Array.from(serverMap.entries()));
          }

          // Use detected plan or fallback
          const clientPlanId = client.detected_plan_id || defaultPlan.id;
          const clientPlan = plans.find(p => p.id === clientPlanId) || defaultPlan;
          const defaultExpirationDate = format(addDays(new Date(), clientPlan.duration_days), 'yyyy-MM-dd');

          return {
            seller_id: user!.id,
            name: client.name,
            phone: normalizeClientPhone(client.phone || null),
            login: encryptedLogin,
            password: encryptedPassword,
            plan_id: clientPlan.id,
            plan_name: clientPlan.name,
            plan_price: client.price ?? clientPlan.price,
            expiration_date: client.expiration_date || defaultExpirationDate,
            category: client.category,
            server_id: serverId,
            server_name: originalServerName ? originalServerName.toUpperCase() : null,
            is_paid: true,
          };
        })
      );

      // Etapa 5 (DB guard): prevent NEW duplicates on (seller_id + phone)
      const existingByPhone = await fetchExistingClientIdsByPhone(
        supabase,
        user!.id,
        preparedClients.map((c) => c.phone)
      );

      const toInsert = preparedClients.filter((c) => !c.phone || !existingByPhone.has(c.phone));
      const toUpdate = preparedClients
        .filter((c) => c.phone && existingByPhone.has(c.phone))
        .map((c) => ({ ...c, id: existingByPhone.get(c.phone!)! }));

      // Insert only truly new rows
      if (toInsert.length > 0) {
        const { error } = await supabase.from('clients').insert(toInsert);
        if (error) throw error;
      }

      // Update existing rows (reuse existing client_id)
      // NOTE: We intentionally update by id to avoid inserting parallel entities.
      for (const row of toUpdate) {
        const { id, seller_id, ...updateData } = row as any;
        const { error } = await supabase.from('clients').update(updateData).eq('id', id).eq('seller_id', user!.id);
        if (error) throw error;
      }

      return { clientCount: validClients.length, serverCount: serversToCreate.length };
    },
    onSuccess: ({ clientCount, serverCount }) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      const serverMsg = serverCount > 0 ? ` e ${serverCount} servidor(es) criado(s)` : '';
      toast.success(`${clientCount} cliente(s) importado(s)${serverMsg}!`);
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleCopyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(`${TEMPLATE_HEADER}\n${TEMPLATE}`);
      setCopied(true);
      toast.success('Template copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Erro ao copiar');
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setInputText('');
    setSelectedPlanId('');
    setDefaultCategory('IPTV');
    setParsedClients([]);
    setStep('input');
  };

  const validCount = parsedClients.filter(c => c.valid).length;
  const invalidCount = parsedClients.filter(c => !c.valid).length;

  // Count by category
  const categoryStats = parsedClients
    .filter(c => c.valid)
    .reduce((acc, c) => {
      acc[c.category] = (acc[c.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) handleClose();
      else setIsOpen(true);
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">Importar em Massa</span>
          <span className="sm:hidden">Importar</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Clientes em Massa
          </DialogTitle>
          <DialogDescription>
            {step === 'input' 
              ? 'Cole os dados: Nome, Telefone, Usuário, Senha, Categoria, Servidor, Valor, Validade' 
              : `Confirme os ${validCount} cliente(s) a serem importados`}
          </DialogDescription>
        </DialogHeader>

        {step === 'input' ? (
          <div className="space-y-4 flex-1 overflow-y-auto">
            {/* Template section */}
            <div className="bg-muted/50 rounded-lg p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Template de exemplo</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Copie o template e edite. A categoria é opcional - se não informar, usa a padrão selecionada abaixo.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyTemplate}
                  className="gap-1.5"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </Button>
              </div>
              <pre className="text-xs bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                <span className="text-muted-foreground">{TEMPLATE_HEADER}</span>
                {'\n'}
                {TEMPLATE}
              </pre>
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-muted-foreground">Exemplos de categorias:</span>
                {['IPTV', 'P2P', 'Contas Premium', 'SSH'].map(cat => (
                  <Badge key={cat} variant="outline" className="text-xs py-0">
                    {cat}
                  </Badge>
                ))}
                <span className="text-xs text-muted-foreground ml-1">(aceita qualquer categoria)</span>
              </div>
            </div>

            {/* Config section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Plano Padrão (opcional)</Label>
                <PlanSelector 
                  plans={plans}
                  value={selectedPlanId}
                  onValueChange={setSelectedPlanId}
                  placeholder="Auto-detectar pela validade"
                  showFilters={true}
                />
                <p className="text-xs text-muted-foreground">
                  O plano é detectado automaticamente pela validade. Use apenas como fallback.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Categoria Padrão</Label>
                <Select value={defaultCategory} onValueChange={setDefaultCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['IPTV', 'P2P', 'Contas Premium', 'SSH'].map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Usada apenas quando a categoria não for informada
                </p>
              </div>
            </div>

            {/* Input area */}
            <div className="space-y-2">
              <Label>Dados dos Clientes *</Label>
                <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`Cole aqui os dados dos clientes...\n\nFormato:\nNome,Telefone,Usuário,Senha,Categoria,Servidor,Valor,Validade\n\nExemplo:\nLuan,31999999999,212123456,434356567,IPTV,WPLAY,25,31/01/2026`}
                className="min-h-[160px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Um cliente por linha. O plano é detectado automaticamente pela validade informada.
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button onClick={handlePreview} disabled={!inputText.trim()}>
                Visualizar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Summary */}
            <div className="flex gap-2 flex-wrap">
              <Badge variant="default" className="gap-1">
                <Check className="h-3 w-3" />
                {validCount} válido(s)
              </Badge>
              {invalidCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {invalidCount} com erro
                </Badge>
              )}
            </div>

            {/* Category breakdown */}
            {Object.keys(categoryStats).length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Por categoria:</span>
                {Object.entries(categoryStats).map(([cat, count]) => (
                  <Badge key={cat} variant="outline" className="text-xs">
                    {cat}: {count}
                  </Badge>
                ))}
              </div>
            )}

            {/* Preview list */}
            <ScrollArea className="flex-1 border rounded-lg">
              <div className="p-2 space-y-1">
                {parsedClients.map((client, index) => (
                  <div
                    key={index}
                    className={`flex items-center gap-2 p-2 rounded text-sm ${
                      client.valid 
                        ? 'bg-green-500/10 border border-green-500/20' 
                        : 'bg-destructive/10 border border-destructive/20'
                    }`}
                  >
                    {client.valid ? (
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{client.name || '(sem nome)'}</span>
                        {client.valid && client.category && (
                          <>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                              {typeof client.category === 'object' ? (client.category as any)?.name : client.category}
                            </Badge>
                            {client.detected_plan_name && (
                              <Badge 
                                variant="secondary" 
                                className={`text-[10px] px-1.5 py-0 shrink-0 ${
                                  client.detected_duration_days === 30 ? 'bg-blue-500/20 text-blue-500' :
                                  client.detected_duration_days === 90 ? 'bg-emerald-500/20 text-emerald-500' :
                                  client.detected_duration_days === 180 ? 'bg-amber-500/20 text-amber-500' :
                                  client.detected_duration_days === 365 ? 'bg-purple-500/20 text-purple-500' : ''
                                }`}
                              >
                                {client.detected_duration_days === 30 ? 'Mensal' :
                                 client.detected_duration_days === 90 ? 'Trimestral' :
                                 client.detected_duration_days === 180 ? 'Semestral' :
                                 client.detected_duration_days === 365 ? 'Anual' : 
                                 `${client.detected_duration_days}d`}
                              </Badge>
                            )}
                          </>
                        )}
                      </div>
                      {client.valid ? (
                        <div className="text-xs text-muted-foreground truncate">
                          {client.phone && `📱 ${client.phone}`}
                          {client.login && ` • 👤 ${client.login}`}
                          {client.password && ` • 🔑 ****`}
                          {client.server && ` • 🖥️ ${client.server}`}
                          {client.price && ` • R$ ${client.price.toFixed(2)}`}
                          {client.expiration_date && ` • 📅 ${client.expiration_date}`}
                        </div>
                      ) : (
                        <div className="text-xs text-destructive">{client.error}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {invalidCount > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {invalidCount} cliente(s) com erro serão ignorados na importação.
                </AlertDescription>
              </Alert>
            )}

            {/* Actions */}
            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep('input')}>
                Voltar
              </Button>
              <Button 
                onClick={() => importMutation.mutate()} 
                disabled={validCount === 0 || importMutation.isPending}
                className="gap-2"
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Importar {validCount} Cliente(s)
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
