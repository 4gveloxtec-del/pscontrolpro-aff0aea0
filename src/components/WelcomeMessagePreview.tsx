import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, MessageCircle, Send, Edit3, Eye } from 'lucide-react';
import { format } from 'date-fns';

interface WelcomeMessagePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: {
    name: string;
    phone: string;
    login: string;
    password: string;
    expiration_date: string;
    plan_name: string;
    plan_price: string;
    server_name: string;
    category: string;
    device: string;
    gerencia_app_mac?: string;
    gerencia_app_devices?: { name: string; mac: string }[];
  };
  onConfirm: (message: string | null, sendWelcome: boolean) => void;
  isLoading?: boolean;
}

interface Template {
  id: string;
  name: string;
  message: string;
  type: string;
  is_active?: boolean;
}

export function WelcomeMessagePreview({
  open,
  onOpenChange,
  formData,
  onConfirm,
  isLoading = false,
}: WelcomeMessagePreviewProps) {
  const { user } = useAuth();
  const [sendWelcomeMessage, setSendWelcomeMessage] = useState(true);
  const [editedMessage, setEditedMessage] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Fetch seller profile for company name and pix
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('company_name, full_name, pix_key')
        .eq('id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && open,
  });

  // Fetch welcome templates
  const { data: templatesRaw = [] } = useQuery({
    queryKey: ['welcome-templates', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('seller_id', user!.id)
        .eq('type', 'welcome')
        .order('name');
      if (error) throw error;
      return (data as Template[] | null) || [];
    },
    enabled: !!user?.id && open,
  });
  const templates = templatesRaw.filter(t => t.is_active !== false);

  // Fetch reseller device apps for {apps} and {links} variables
  const { data: deviceAppsRaw = [] } = useQuery({
    queryKey: ['reseller-device-apps-preview', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reseller_device_apps')
        .select('*')
        .eq('seller_id', user!.id)
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && open,
  });
  const deviceApps = deviceAppsRaw as { name: string; download_url?: string; icon?: string; device_types?: string[] }[];

  // Find best matching template
  const bestTemplate = useMemo(() => {
    if (!templates.length) return null;
    const categoryLower = (formData.category || 'iptv').toLowerCase();
    return templates.find(t => t.name.toLowerCase().includes(categoryLower)) || templates[0];
  }, [templates, formData.category]);

  // Auto-select best template on open
  useEffect(() => {
    if (open && bestTemplate && !selectedTemplateId) {
      setSelectedTemplateId(bestTemplate.id);
    }
  }, [open, bestTemplate, selectedTemplateId]);

  // Get selected template
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || bestTemplate;

  // Format expiration date
  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'dd/MM/yyyy');
    } catch {
      return dateStr;
    }
  };

  // Calculate days remaining
  const getDaysRemaining = (dateStr: string) => {
    try {
      const expDate = new Date(dateStr);
      const today = new Date();
      const diff = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return String(diff);
    } catch {
      return '0';
    }
  };

  // Generate apps text based on device
  const getAppsAndLinks = () => {
    if (!formData.device || !deviceApps.length) {
      return { appsText: '', linksText: '' };
    }

    const deviceMapping: Record<string, string[]> = {
      'Smart TV Samsung': ['samsung_tv'],
      'Smart TV LG': ['lg_tv'],
      'TV Box': ['android_tv'],
      'Celular': ['celular_android', 'iphone'],
      'PC': ['android_tv'],
      'Notebook': ['android_tv'],
      'Fire Stick': ['fire_stick', 'android_tv'],
      'Projetor Android': ['android_tv'],
    };

    const targetTypes = new Set(deviceMapping[formData.device] || []);
    
    const compatibleApps = deviceApps.filter(app => 
      (app.device_types as string[] || []).some(t => targetTypes.has(t))
    );

    if (compatibleApps.length === 0) {
      return { appsText: '', linksText: '' };
    }

    const appsText = compatibleApps.map(a => `${a.icon || '📱'} ${a.name}`).join('\n');
    const linksText = compatibleApps
      .filter(a => a.download_url)
      .map(a => `${a.icon || '📱'} ${a.name}: ${a.download_url}`)
      .join('\n');

    return { appsText, linksText };
  };

  // Collect all MACs
  const getAllMacs = () => {
    const macs: string[] = [];
    if (formData.gerencia_app_mac?.trim()) {
      macs.push(formData.gerencia_app_mac.trim());
    }
    if (formData.gerencia_app_devices) {
      formData.gerencia_app_devices.forEach(d => {
        if (d.mac?.trim() && !macs.includes(d.mac.trim())) {
          macs.push(d.mac.trim());
        }
      });
    }
    return macs;
  };

  // Replace variables in message
  const replaceVariables = (text: string) => {
    if (!text) return '';

    const { appsText, linksText } = getAppsAndLinks();
    const allMacs = getAllMacs();
    const macsList = allMacs.length > 0 ? allMacs.map(m => `• ${m}`).join('\n') : '';
    const macSection = allMacs.length > 0 ? `📱 *MAC(s) cadastrado(s):*\n${macsList}` : '';

    return text
      .replace(/\{nome\}/gi, formData.name || '')
      .replace(/\{empresa\}/gi, profile?.company_name || profile?.full_name || '')
      .replace(/\{login\}/gi, formData.login || '')
      .replace(/\{login_plain\}/gi, formData.login || '')
      .replace(/\{senha\}/gi, formData.password || '')
      .replace(/\{senha_plain\}/gi, formData.password || '')
      .replace(/\{vencimento\}/gi, formatDate(formData.expiration_date))
      .replace(/\{dias_restantes\}/gi, getDaysRemaining(formData.expiration_date))
      .replace(/\{valor\}/gi, formData.plan_price || '0')
      .replace(/\{plano\}/gi, formData.plan_name || '')
      .replace(/\{servidor\}/gi, formData.server_name || '')
      .replace(/\{pix\}/gi, profile?.pix_key || '')
      .replace(/\{servico\}/gi, formData.category || 'IPTV')
      .replace(/\{categoria\}/gi, formData.category || 'IPTV')
      .replace(/\{dispositivo\}/gi, formData.device || '')
      .replace(/\{mac\}/gi, macSection)
      .replace(/\{macs\}/gi, macSection)
      .replace(/\{apps\}/gi, appsText)
      .replace(/\{links\}/gi, linksText);
  };

  // Generate preview message
  const previewMessage = useMemo(() => {
    if (!selectedTemplate?.message) return '';
    return replaceVariables(selectedTemplate.message);
  }, [selectedTemplate, formData, profile, deviceApps]);

  // Update edited message when preview changes
  useEffect(() => {
    if (!isEditing) {
      setEditedMessage(previewMessage);
    }
  }, [previewMessage, isEditing]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setIsEditing(false);
      setSendWelcomeMessage(true);
      setSelectedTemplateId('');
    }
  }, [open]);

  const handleConfirm = () => {
    if (sendWelcomeMessage) {
      onConfirm(editedMessage, true);
    } else {
      onConfirm(null, false);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setIsEditing(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Mensagem de Boas-Vindas
          </DialogTitle>
          <DialogDescription>
            Revise e edite a mensagem antes de salvar o cliente
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Toggle send welcome message */}
          <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
            <div className="space-y-0.5">
              <Label className="font-medium">Enviar mensagem de boas-vindas</Label>
              <p className="text-xs text-muted-foreground">
                Enviar automaticamente via WhatsApp após salvar
              </p>
            </div>
            <Switch
              checked={sendWelcomeMessage}
              onCheckedChange={setSendWelcomeMessage}
            />
          </div>

          {sendWelcomeMessage && (
            <>
              {/* Template selector */}
              {templates.length > 1 && (
                <div className="space-y-2">
                  <Label>Template</Label>
                  <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Message preview/edit */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Mensagem</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(!isEditing)}
                  >
                    {isEditing ? (
                      <>
                        <Eye className="h-4 w-4 mr-1" />
                        Visualizar
                      </>
                    ) : (
                      <>
                        <Edit3 className="h-4 w-4 mr-1" />
                        Editar
                      </>
                    )}
                  </Button>
                </div>

                {!templates.length ? (
                  <div className="p-4 text-center text-muted-foreground border rounded-lg bg-muted/30">
                    <p>Nenhum template de boas-vindas encontrado.</p>
                    <p className="text-sm mt-1">Crie um template do tipo "Boas-vindas" na página de Templates.</p>
                  </div>
                ) : isEditing ? (
                  <Textarea
                    value={editedMessage}
                    onChange={(e) => setEditedMessage(e.target.value)}
                    rows={12}
                    className="font-mono text-sm"
                    placeholder="Digite a mensagem..."
                  />
                ) : (
                  <div className="p-4 border rounded-lg bg-muted/30 whitespace-pre-wrap text-sm min-h-[200px] max-h-[400px] overflow-y-auto">
                    {editedMessage || 'Nenhuma mensagem para exibir'}
                  </div>
                )}
              </div>

              {/* Variables hint */}
              <div className="text-xs text-muted-foreground p-2 bg-muted/20 rounded">
                <strong>Variáveis disponíveis:</strong> {'{nome}'}, {'{empresa}'}, {'{login}'}, {'{senha}'}, {'{vencimento}'}, {'{valor}'}, {'{plano}'}, {'{servidor}'}, {'{pix}'}, {'{dispositivo}'}, {'{mac}'}, {'{apps}'}, {'{links}'}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : sendWelcomeMessage ? (
              <>
                <Send className="mr-2 h-4 w-4" />
                Salvar e Enviar
              </>
            ) : (
              'Salvar sem Enviar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
