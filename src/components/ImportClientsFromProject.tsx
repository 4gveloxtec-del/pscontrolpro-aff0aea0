import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  Upload, 
  FileJson, 
  FileSpreadsheet, 
  AlertCircle, 
  Loader2, 
  Check,
  Users,
  HelpCircle
} from 'lucide-react';
import { format, addDays, parseISO, isValid } from 'date-fns';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { fetchExistingClientIdsByPhone, normalizeClientPhone } from '@/lib/idempotency';

interface ParsedClient {
  name: string;
  phone: string | null;
  login: string | null;
  password: string | null;
  email: string | null;
  category: string;
  expiration_date: string | null;
  plan_name: string | null;
  plan_price: number | null;
  notes: string | null;
  device: string | null;
  is_paid: boolean;
  valid: boolean;
  error?: string;
}

interface Seller {
  id: string;
  email: string;
  full_name: string | null;
}

const VALID_CATEGORIES = ['IPTV', 'P2P', 'Contas Premium', 'SSH'];

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

export function ImportClientsFromProject() {
  const { user, isAdmin } = useAuth();
  const { encrypt } = useCrypto();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [defaultCategory, setDefaultCategory] = useState('IPTV');
  const [parsedClients, setParsedClients] = useState<ParsedClient[]>([]);
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [importType, setImportType] = useState<'json' | 'csv'>('json');
  
  // Advanced options
  const [useOriginalCategory, setUseOriginalCategory] = useState(true);
  const [useOriginalExpiration, setUseOriginalExpiration] = useState(true);
  const [defaultDurationDays, setDefaultDurationDays] = useState(30);
  const [markAllAsPaid, setMarkAllAsPaid] = useState(true);

  // Fetch sellers for admin to assign clients
  const { data: sellers = [] } = useQuery({
    queryKey: ['sellers-for-import'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .order('full_name');
      if (error) throw error;
      return data as Seller[];
    },
    enabled: isAdmin && isOpen,
  });

  if (!isAdmin) return null;

  const normalizeCategory = (cat: string): string => {
    const normalized = cat?.trim().toLowerCase() || '';
    
    // Check direct match first
    const directMatch = VALID_CATEGORIES.find(
      c => c.toLowerCase() === normalized
    );
    if (directMatch) return directMatch;
    
    // Check mappings
    const mappedCategory = CATEGORY_MAPPINGS[normalized];
    if (mappedCategory) return mappedCategory;
    
    // Partial match
    if (normalized.includes('iptv')) return 'IPTV';
    if (normalized.includes('p2p')) return 'P2P';
    if (normalized.includes('premium')) return 'Contas Premium';
    if (normalized.includes('ssh')) return 'SSH';
    
    return useOriginalCategory ? '' : defaultCategory;
  };

  const parseDate = (dateStr: string | null): string | null => {
    if (!dateStr) return null;
    
    // Try ISO format first
    const isoDate = parseISO(dateStr);
    if (isValid(isoDate)) {
      return format(isoDate, 'yyyy-MM-dd');
    }

    // Try Brazilian format DD/MM/YYYY
    const brParts = dateStr.split('/');
    if (brParts.length === 3) {
      const [day, month, year] = brParts;
      const brDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (isValid(brDate)) {
        return format(brDate, 'yyyy-MM-dd');
      }
    }

    return null;
  };

  const parseJSON = (text: string): ParsedClient[] => {
    try {
      const data = JSON.parse(text);
      
      // Handle array of clients
      const clients = Array.isArray(data) ? data : data.clients || data.data?.clients || [data];
      
      return clients.map((client: Record<string, unknown>, index: number) => {
        const name = String(client.name || client.nome || '').trim();
        
        if (!name || name.length < 2) {
          return {
            name: name || '(sem nome)',
            phone: null,
            login: null,
            password: null,
            email: null,
            category: defaultCategory,
            expiration_date: null,
            plan_name: null,
            plan_price: null,
            notes: null,
            device: null,
            is_paid: true,
            valid: false,
            error: `Cliente ${index + 1}: Nome inválido ou muito curto`
          };
        }

        const phone = String(client.phone || client.telefone || client.whatsapp || '').replace(/\D/g, '') || null;
        const login = String(client.login || client.usuario || '').trim() || null;
        const password = String(client.password || client.senha || '').trim() || null;
        const email = String(client.email || client.premium_email || '').trim() || null;
        
        // Use original category or fall back to default
        const categoryInput = String(client.category || client.categoria || '').trim();
        const parsedCategory = normalizeCategory(categoryInput);
        const category = parsedCategory || defaultCategory;
        
        // Use original expiration or calculate new one
        const expirationStr = String(client.expiration_date || client.expiracao || client.vencimento || '').trim();
        const parsedExpiration = useOriginalExpiration ? parseDate(expirationStr) : null;
        const expiration_date = parsedExpiration || format(addDays(new Date(), defaultDurationDays), 'yyyy-MM-dd');
        
        const plan_name = String(client.plan_name || client.plano || '').trim() || null;
        const plan_price = client.plan_price ? Number(client.plan_price) : (client.valor ? Number(client.valor) : null);
        const notes = String(client.notes || client.observacoes || client.obs || '').trim() || null;
        const device = String(client.device || client.dispositivo || '').trim() || null;
        const is_paid = markAllAsPaid ? true : (client.is_paid !== undefined ? Boolean(client.is_paid) : true);

        return {
          name: name.slice(0, 100),
          phone: phone?.slice(0, 20) || null,
          login: login?.slice(0, 100) || null,
          password: password?.slice(0, 100) || null,
          email: email?.slice(0, 255) || null,
          category,
          expiration_date,
          plan_name: plan_name?.slice(0, 100) || null,
          plan_price,
          notes: notes?.slice(0, 500) || null,
          device: device?.slice(0, 100) || null,
          is_paid,
          valid: true
        };
      });
    } catch (error) {
      return [{
        name: '',
        phone: null,
        login: null,
        password: null,
        email: null,
        category: defaultCategory,
        expiration_date: null,
        plan_name: null,
        plan_price: null,
        notes: null,
        device: null,
        is_paid: true,
        valid: false,
        error: `Erro ao processar JSON: ${(error as Error).message}`
      }];
    }
  };

  const parseCSV = (text: string): ParsedClient[] => {
    try {
      const normalizedText = text.replace(/\r\n?/g, '\n').trim();
      const lines = normalizedText.split('\n').filter((line) => line.trim());

      if (lines.length === 0) {
        return [{
          name: '',
          phone: null,
          login: null,
          password: null,
          email: null,
          category: defaultCategory,
          expiration_date: null,
          plan_name: null,
          plan_price: null,
          notes: null,
          device: null,
          is_paid: true,
          valid: false,
          error: 'Arquivo CSV vazio',
        }];
      }

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
        row
          .split(delimiter)
          .map((p) => (p || '').trim().replace(/^["']|["']$/g, ''));

      const normalizeHeader = (h: string) =>
        (h || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '_')
          .replace(/-+/g, '_');

      const headerLower = lines[0].toLowerCase();
      const hasHeader = [
        'nome',
        'name',
        'telefone',
        'phone',
        'login',
        'senha',
        'password',
        'categoria',
        'category',
        'venc',
        'expir',
        'seller_id',
        'id',
      ].some((k) => headerLower.includes(k));

      const headers = hasHeader ? splitRow(lines[0]).map(normalizeHeader) : null;

      const findHeaderIndex = (aliases: string[]) => {
        if (!headers) return null;
        const aliasSet = new Set(aliases);
        const idx = headers.findIndex((h) => aliasSet.has(h));
        return idx >= 0 ? idx : null;
      };

      const headerIdx = hasHeader
        ? {
            name: findHeaderIndex(['name', 'nome']),
            phone: findHeaderIndex(['phone', 'telefone', 'whatsapp', 'celular']),
            login: findHeaderIndex(['login', 'usuario', 'user', 'username']),
            password: findHeaderIndex(['password', 'senha', 'pass']),
            email: findHeaderIndex(['email', 'premium_email']),
            category: findHeaderIndex(['category', 'categoria']),
            expiration: findHeaderIndex(['expiration_date', 'expiration', 'vencimento', 'expiracao', 'expires_at']),
            plan_name: findHeaderIndex(['plan_name', 'plano']),
            plan_price: findHeaderIndex(['plan_price', 'valor', 'price']),
            notes: findHeaderIndex(['notes', 'observacoes', 'obs']),
            device: findHeaderIndex(['device', 'dispositivo']),
            is_paid: findHeaderIndex(['is_paid', 'pago', 'paid']),
          }
        : null;

      const dataLines = hasHeader ? lines.slice(1) : lines;

      if (dataLines.length === 0) {
        return [{
          name: '',
          phone: null,
          login: null,
          password: null,
          email: null,
          category: defaultCategory,
          expiration_date: null,
          plan_name: null,
          plan_price: null,
          notes: null,
          device: null,
          is_paid: true,
          valid: false,
          error: 'Nenhum dado encontrado após o cabeçalho',
        }];
      }

      const isUuid = (value: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((value || '').trim());

      const hasLetters = (value: string) => /[A-Za-zÀ-ÿ]/.test(value || '');

      const digitsOnly = (value: string) => (value || '').replace(/\D/g, '');

      const parseBool = (value: string) => {
        const v = (value || '').trim().toLowerCase();
        return ['1', 'true', 'sim', 'yes', 'y'].includes(v);
      };

      const numericFromString = (value: string) => {
        if (!value) return null;
        const cleaned = String(value).replace(/[^0-9.,-]/g, '').replace(',', '.');
        const n = Number(cleaned);
        return Number.isFinite(n) ? n : null;
      };

      const pickPhone = (parts: string[]) => {
        const candidate = parts
          .map(digitsOnly)
          .find((d) => d.length >= 8 && d.length <= 15);
        return candidate || '';
      };

      const pickEmail = (parts: string[]) => parts.find((p) => (p || '').includes('@')) || '';

      const pickExpirationRaw = (parts: string[]) => {
        for (const p of parts) {
          if (parseDate(p)) return p;
        }
        return '';
      };

      const pickCategoryRaw = (parts: string[]) => {
        for (const p of parts) {
          if (normalizeCategory(p)) return p;
        }
        return '';
      };

      const pickNameCandidate = (parts: string[]) => {
        // Prefer the LAST texty value (exports usually put name later)
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = (parts[i] || '').trim();
          if (p.length >= 2 && hasLetters(p) && !isUuid(p)) return p;
        }
        return '';
      };

      return dataLines.map((line, index) => {
        try {
          const cols = splitRow(line);

          const rowNumber = index + (hasHeader ? 2 : 1);

          // Header-based mapping (reliable for exports)
          if (hasHeader && headerIdx) {
            const get = (idx: number | null) => (idx === null ? '' : (cols[idx] ?? ''));

            const name = get(headerIdx.name);
            if (!name || isUuid(name)) {
              return {
                name: name || '(sem nome)',
                phone: null,
                login: null,
                password: null,
                email: null,
                category: defaultCategory,
                expiration_date: null,
                plan_name: null,
                plan_price: null,
                notes: null,
                device: null,
                is_paid: true,
                valid: false,
                error: `Linha ${rowNumber}: Não encontrei a coluna "nome" corretamente (seu CSV parece exportado).`,
              };
            }

            const phoneRaw = get(headerIdx.phone);
            const loginRaw = get(headerIdx.login);
            const passwordRaw = get(headerIdx.password);
            const emailRaw = get(headerIdx.email);
            const categoryRaw = get(headerIdx.category);
            const expirationRaw = get(headerIdx.expiration);
            const planNameRaw = get(headerIdx.plan_name);
            const planPriceRaw = get(headerIdx.plan_price);
            const notesRaw = get(headerIdx.notes);
            const deviceRaw = get(headerIdx.device);
            const isPaidRaw = get(headerIdx.is_paid);

            const parsedCategory = normalizeCategory(categoryRaw);
            const category = parsedCategory || defaultCategory;

            const parsedExpiration = useOriginalExpiration ? parseDate(expirationRaw) : null;
            const expiration_date = parsedExpiration || format(addDays(new Date(), defaultDurationDays), 'yyyy-MM-dd');

            const is_paid = markAllAsPaid ? true : (headerIdx.is_paid !== null ? parseBool(isPaidRaw) : true);

            return {
              name: name.slice(0, 100),
              phone: digitsOnly(phoneRaw) ? digitsOnly(phoneRaw).slice(0, 20) : null,
              login: loginRaw ? loginRaw.slice(0, 100) : null,
              password: passwordRaw ? passwordRaw.slice(0, 100) : null,
              email: emailRaw ? emailRaw.slice(0, 255) : null,
              category,
              expiration_date,
              plan_name: planNameRaw ? planNameRaw.slice(0, 100) : null,
              plan_price: numericFromString(planPriceRaw),
              notes: notesRaw ? notesRaw.slice(0, 500) : null,
              device: deviceRaw ? deviceRaw.slice(0, 100) : null,
              is_paid,
              valid: true,
            };
          }

          // Fallback mapping (template-style)
          let name = (cols[0] || '').trim();
          let phone = (cols[1] || '').trim();
          let login = (cols[2] || '').trim();
          let password = (cols[3] || '').trim();
          let categoryInput = (cols[4] || '').trim();
          let expirationStr = (cols[5] || '').trim();
          let plan_name = (cols[6] || '').trim();
          let plan_price = (cols[7] || '').trim();
          let email = (cols[8] || '').trim();
          let notes = (cols[9] || '').trim();

          // Heuristic for exported CSV without header (often starts with UUID columns)
          if (name && isUuid(name)) {
            const nameCandidate = pickNameCandidate(cols);
            const phoneCandidate = pickPhone(cols);
            const emailCandidate = pickEmail(cols);
            const expirationCandidate = pickExpirationRaw(cols);
            const categoryCandidate = pickCategoryRaw(cols);

            name = nameCandidate || '';
            phone = phoneCandidate || '';
            email = emailCandidate || '';
            expirationStr = expirationCandidate || '';
            categoryInput = categoryCandidate || '';
            login = '';
            password = '';
            plan_name = '';
            plan_price = '';
            notes = '';
          }

          if (!name || name.length < 2 || isUuid(name)) {
            return {
              name: name || '(sem nome)',
              phone: null,
              login: null,
              password: null,
              email: null,
              category: defaultCategory,
              expiration_date: null,
              plan_name: null,
              plan_price: null,
              notes: null,
              device: null,
              is_paid: true,
              valid: false,
              error: `Linha ${rowNumber}: Nome inválido (seu CSV pode ser exportado; prefira o CSV com cabeçalho).`,
            };
          }

          const parsedCategory = normalizeCategory(categoryInput);
          const category = parsedCategory || defaultCategory;

          const parsedExpiration = useOriginalExpiration ? parseDate(expirationStr) : null;
          const expiration_date = parsedExpiration || format(addDays(new Date(), defaultDurationDays), 'yyyy-MM-dd');

          const phoneDigits = digitsOnly(phone);

          return {
            name: name.slice(0, 100),
            phone: phoneDigits ? phoneDigits.slice(0, 20) : null,
            login: login ? login.slice(0, 100) : null,
            password: password ? password.slice(0, 100) : null,
            email: email ? email.slice(0, 255) : null,
            category,
            expiration_date,
            plan_name: plan_name ? plan_name.slice(0, 100) : null,
            plan_price: numericFromString(plan_price),
            notes: notes ? notes.slice(0, 500) : null,
            device: null,
            is_paid: markAllAsPaid,
            valid: true,
          };
        } catch {
          const rowNumber = index + (hasHeader ? 2 : 1);
          return {
            name: '(erro)',
            phone: null,
            login: null,
            password: null,
            email: null,
            category: defaultCategory,
            expiration_date: null,
            plan_name: null,
            plan_price: null,
            notes: null,
            device: null,
            is_paid: true,
            valid: false,
            error: `Linha ${rowNumber}: Erro ao processar`,
          };
        }
      });
    } catch (error) {
      return [{
        name: '',
        phone: null,
        login: null,
        password: null,
        email: null,
        category: defaultCategory,
        expiration_date: null,
        plan_name: null,
        plan_price: null,
        notes: null,
        device: null,
        is_paid: true,
        valid: false,
        error: `Erro ao processar CSV: ${(error as Error).message}`,
      }];
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          setInputText(content || '');
          
          // Auto-detect format
          if (file.name.endsWith('.json')) {
            setImportType('json');
          } else if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
            setImportType('csv');
          }
          toast.success(`Arquivo "${file.name}" carregado!`);
        } catch (loadError) {
          console.error('Error loading file:', loadError);
          toast.error('Erro ao ler o arquivo');
        }
      };
      reader.onerror = () => {
        toast.error('Erro ao ler o arquivo');
      };
      reader.readAsText(file);
    } catch (error) {
      console.error('Error selecting file:', error);
      toast.error('Erro ao selecionar arquivo');
    } finally {
      // Reset input for re-selection
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handlePreview = () => {
    if (!inputText.trim()) {
      toast.error('Cole ou carregue os dados dos clientes');
      return;
    }
    if (!selectedSellerId) {
      toast.error('Selecione um vendedor para atribuir os clientes');
      return;
    }

    const parsed = importType === 'json' ? parseJSON(inputText) : parseCSV(inputText);
    setParsedClients(parsed);
    setStep('preview');
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const validClients = parsedClients.filter(c => c.valid);
      if (validClients.length === 0) {
        throw new Error('Nenhum cliente válido para importar');
      }

      const looksLikeCiphertext = (value: string) =>
        /^[A-Za-z0-9+/=]+$/.test(value) && value.length >= 32;

      // Prepare clients with encrypted credentials
      const preparedClients = await Promise.all(
        validClients.map(async (client) => {
          // If it's already ciphertext (exported from this same system), do NOT encrypt again.
          const encryptedLogin = client.login
            ? (looksLikeCiphertext(client.login) ? client.login : await encrypt(client.login))
            : null;
          const encryptedPassword = client.password
            ? (looksLikeCiphertext(client.password) ? client.password : await encrypt(client.password))
            : null;

          return {
            seller_id: selectedSellerId,
            name: client.name,
            phone: normalizeClientPhone(client.phone),
            login: encryptedLogin,
            password: encryptedPassword,
            email: client.email,
            category: client.category,
            expiration_date: client.expiration_date || format(addDays(new Date(), 30), 'yyyy-MM-dd'),
            plan_name: client.plan_name,
            plan_price: client.plan_price,
            notes: client.notes,
            device: client.device,
            is_paid: client.is_paid,
          };
        })
      );

      // Etapa 5 (DB guard): prevent NEW duplicates on (seller_id + phone)
      const existingByPhone = await fetchExistingClientIdsByPhone(
        supabase,
        selectedSellerId,
        preparedClients.map((c) => c.phone)
      );

      const toInsert = preparedClients.filter((c) => !c.phone || !existingByPhone.has(c.phone));
      const toUpdate = preparedClients
        .filter((c) => c.phone && existingByPhone.has(c.phone))
        .map((c) => ({ ...c, id: existingByPhone.get(c.phone!)! }));

      if (toInsert.length > 0) {
        const { error } = await supabase.from('clients').insert(toInsert);
        if (error) throw error;
      }

      for (const row of toUpdate) {
        const { id, seller_id, ...updateData } = row as any;
        const { error } = await supabase
          .from('clients')
          .update(updateData)
          .eq('id', id)
          .eq('seller_id', selectedSellerId);
        if (error) throw error;
      }

      return validClients.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(`${count} cliente(s) importado(s) com sucesso!`);
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleClose = () => {
    setIsOpen(false);
    setInputText('');
    setSelectedSellerId('');
    setDefaultCategory('IPTV');
    setParsedClients([]);
    setStep('input');
    setImportType('json');
    setUseOriginalCategory(true);
    setUseOriginalExpiration(true);
    setDefaultDurationDays(30);
    setMarkAllAsPaid(true);
  };

  const validCount = parsedClients.filter(c => c.valid).length;
  const invalidCount = parsedClients.filter(c => !c.valid).length;

  const categoryStats = parsedClients
    .filter(c => c.valid)
    .reduce((acc, c) => {
      acc[c.category] = (acc[c.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const selectedSeller = sellers.find(s => s.id === selectedSellerId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Importar Clientes de Outro Projeto
        </CardTitle>
        <CardDescription>
          Importe clientes de outro projeto via JSON ou CSV
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Exporte os clientes do outro projeto (JSON/CSV) e importe aqui para um vendedor específico.
        </p>
        
        <Dialog open={isOpen} onOpenChange={(open) => {
          if (!open) handleClose();
          else setIsOpen(true);
        }}>
          <DialogTrigger asChild>
            <Button className="w-full">
              <Upload className="h-4 w-4 mr-2" />
              Importar Clientes
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Importar Clientes de Outro Projeto
              </DialogTitle>
              <DialogDescription>
                {step === 'input' 
                  ? 'Cole o JSON/CSV exportado do outro projeto ou carregue um arquivo' 
                  : `Confirme os ${validCount} cliente(s) a serem importados`}
              </DialogDescription>
            </DialogHeader>

            {step === 'input' ? (
              <div className="space-y-4 flex-1 overflow-y-auto">
                {/* Seller selection */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Vendedor Destino *
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Selecione o vendedor que receberá os clientes importados</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                  <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o vendedor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sellers.map((seller) => (
                        <SelectItem key={seller.id} value={seller.id}>
                          {(seller.full_name || 'Sem nome')} ({seller.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Format tabs */}
                <Tabs value={importType} onValueChange={(v) => setImportType(v as 'json' | 'csv')}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="json" className="gap-2">
                      <FileJson className="h-4 w-4" />
                      JSON
                    </TabsTrigger>
                    <TabsTrigger value="csv" className="gap-2">
                      <FileSpreadsheet className="h-4 w-4" />
                      CSV
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="json" className="space-y-3 mt-3">
                    <Alert>
                      <FileJson className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Aceita JSON exportado do Supabase/Lovable. Campos reconhecidos: name/nome, phone/telefone, login/usuario, password/senha, category/categoria, expiration_date/vencimento, plan_name/plano, plan_price/valor, email, notes/observacoes
                      </AlertDescription>
                    </Alert>
                  </TabsContent>
                  
                  <TabsContent value="csv" className="space-y-3 mt-3">
                    <Alert>
                      <FileSpreadsheet className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Formato: Nome, Telefone, Login, Senha, Categoria, Vencimento, Plano, Valor, Email, Observações (separado por vírgula ou tab)
                      </AlertDescription>
                    </Alert>
                  </TabsContent>
                </Tabs>

                {/* File upload */}
                <div className="space-y-2">
                  <Label>Carregar Arquivo</Label>
                  <input
                    type="file"
                    accept=".json,.csv,.txt"
                    onChange={handleFileSelect}
                    className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer border rounded-md"
                  />
                </div>

                {/* Advanced Options */}
                <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                  <Label className="text-sm font-medium">Opções de Importação</Label>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Use original category */}
                    <div className="flex items-center justify-between gap-2 p-2 rounded bg-background">
                      <div className="space-y-0.5">
                        <Label className="text-xs font-medium">Usar categoria do arquivo</Label>
                        <p className="text-[10px] text-muted-foreground">
                          IPTV, P2P, Premium, SSH serão reconhecidos
                        </p>
                      </div>
                      <Switch 
                        checked={useOriginalCategory} 
                        onCheckedChange={setUseOriginalCategory}
                      />
                    </div>

                    {/* Use original expiration */}
                    <div className="flex items-center justify-between gap-2 p-2 rounded bg-background">
                      <div className="space-y-0.5">
                        <Label className="text-xs font-medium">Usar vencimento do arquivo</Label>
                        <p className="text-[10px] text-muted-foreground">
                          Mantém datas originais se existirem
                        </p>
                      </div>
                      <Switch 
                        checked={useOriginalExpiration} 
                        onCheckedChange={setUseOriginalExpiration}
                      />
                    </div>

                    {/* Mark all as paid */}
                    <div className="flex items-center justify-between gap-2 p-2 rounded bg-background">
                      <div className="space-y-0.5">
                        <Label className="text-xs font-medium">Marcar como pago</Label>
                        <p className="text-[10px] text-muted-foreground">
                          Define status de pagamento
                        </p>
                      </div>
                      <Switch 
                        checked={markAllAsPaid} 
                        onCheckedChange={setMarkAllAsPaid}
                      />
                    </div>

                    {/* Default duration */}
                    <div className="flex items-center justify-between gap-2 p-2 rounded bg-background">
                      <div className="space-y-0.5">
                        <Label className="text-xs font-medium">Duração padrão (dias)</Label>
                        <p className="text-[10px] text-muted-foreground">
                          Quando vencimento não existir
                        </p>
                      </div>
                      <Input
                        type="number"
                        value={defaultDurationDays}
                        onChange={(e) => setDefaultDurationDays(Number(e.target.value) || 30)}
                        className="w-20 h-8 text-sm"
                        min={1}
                        max={365}
                      />
                    </div>
                  </div>

                  {/* Default category */}
                  <div className="space-y-2">
                    <Label className="text-xs">Categoria Padrão (fallback)</Label>
                    <Select value={defaultCategory} onValueChange={setDefaultCategory}>
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VALID_CATEGORIES.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      Usada quando a categoria não for reconhecida
                    </p>
                  </div>
                </div>

                {/* Text area */}
                <div className="space-y-2">
                  <Label>Dados dos Clientes</Label>
                  <Textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={importType === 'json' 
                      ? '[\n  {"name": "João Silva", "phone": "11999998888", "login": "joao123", ...}\n]'
                      : 'Nome,Telefone,Login,Senha,Categoria,Vencimento,Plano,Valor\nJoão Silva,11999998888,joao123,senha123,IPTV,2024-02-15,Mensal,25'}
                    className="min-h-[200px] font-mono text-sm"
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={handleClose}>
                    Cancelar
                  </Button>
                  <Button onClick={handlePreview} disabled={!inputText.trim() || !selectedSellerId}>
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
                  {selectedSeller && (
                    <Badge variant="secondary">
                      Vendedor: {selectedSeller.full_name || selectedSeller.email}
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
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{client.name}</span>
                            {client.valid && client.category && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                                {typeof client.category === 'object' ? (client.category as any)?.name : client.category}
                              </Badge>
                            )}
                          </div>
                          {client.valid ? (
                            <div className="text-xs text-muted-foreground truncate">
                              {client.phone && `📱 ${client.phone}`}
                              {client.login && ` • 👤 ${client.login}`}
                              {client.expiration_date && ` • 📅 ${client.expiration_date}`}
                              {client.plan_name && ` • 📦 ${client.plan_name}`}
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
      </CardContent>
    </Card>
  );
}
