import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAdminMenuIcons } from '@/hooks/useAdminMenuIcons';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Users,
  Settings,
  FileText,
  Database,
  Image,
  MessageSquare,
  GraduationCap,
  HeartPulse,
  CreditCard,
  Save,
  X,
  ExternalLink,
  Loader2,
  CheckCircle,
  ImageOff
} from 'lucide-react';

// Lista de menus disponíveis no Admin Panel
const ADMIN_MENUS = [
  { key: 'dashboard', label: 'Dashboard', defaultIcon: LayoutDashboard },
  { key: 'sellers', label: 'Vendedores', defaultIcon: Users },
  { key: 'asaas', label: 'ASAAS Cobranças', defaultIcon: CreditCard },
  { key: 'chatbot', label: 'Chatbot', defaultIcon: MessageSquare },
  { key: 'system-health', label: 'Autocura', defaultIcon: HeartPulse },
  { key: 'reports', label: 'Relatórios', defaultIcon: FileText },
  { key: 'backup', label: 'Backup', defaultIcon: Database },
  { key: 'server-icons', label: 'Ícones Servidores', defaultIcon: Image },
  { key: 'server-templates', label: 'Templates Servidor', defaultIcon: MessageSquare },
  { key: 'tutorials', label: 'Tutoriais', defaultIcon: GraduationCap },
  { key: 'settings', label: 'Configurações', defaultIcon: Settings },
  { key: 'menu-icons', label: 'Ícones do Menu', defaultIcon: Image },
];

export default function AdminMenuIcons() {
  const { menuIcons, iconMap, isLoading, saveIcon, removeIcon, isSaving, isRemoving } = useAdminMenuIcons();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [iconUrl, setIconUrl] = useState('');
  const [previewError, setPreviewError] = useState<Record<string, boolean>>({});

  const handleEdit = (menuKey: string) => {
    setEditingKey(menuKey);
    setIconUrl(iconMap[menuKey] || '');
  };

  const handleSave = () => {
    if (!editingKey) return;
    
    if (!iconUrl.trim()) {
      toast.error('Insira a URL do ícone');
      return;
    }

    // Validação básica de URL
    try {
      new URL(iconUrl);
    } catch {
      toast.error('URL inválida');
      return;
    }

    saveIcon({ menuKey: editingKey, iconUrl: iconUrl.trim() });
    setEditingKey(null);
    setIconUrl('');
  };

  const handleRemove = (menuKey: string) => {
    removeIcon(menuKey);
  };

  const handleCancel = () => {
    setEditingKey(null);
    setIconUrl('');
  };

  const handlePreviewError = (menuKey: string) => {
    setPreviewError(prev => ({ ...prev, [menuKey]: true }));
  };

  const handlePreviewLoad = (menuKey: string) => {
    setPreviewError(prev => ({ ...prev, [menuKey]: false }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Ícones do Menu</h1>
        <p className="text-slate-400 mt-1">
          Personalize os ícones do menu do painel administrativo usando URLs de imagens.
        </p>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Menus Disponíveis</CardTitle>
          <CardDescription>
            Clique em "Editar" para adicionar um ícone customizado via URL. 
            Formatos suportados: PNG, SVG, JPG, GIF, WebP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {ADMIN_MENUS.map((menu) => {
              const hasCustomIcon = !!iconMap[menu.key];
              const customUrl = iconMap[menu.key];
              const isEditing = editingKey === menu.key;
              const DefaultIcon = menu.defaultIcon;

              return (
                <div
                  key={menu.key}
                  className="flex items-center gap-4 p-4 rounded-lg bg-slate-700/50 border border-slate-600"
                >
                  {/* Ícone atual */}
                  <div className="w-12 h-12 rounded-lg bg-slate-600 flex items-center justify-center overflow-hidden shrink-0">
                    {hasCustomIcon && customUrl && !previewError[menu.key] ? (
                      <img 
                        src={customUrl} 
                        alt={menu.label}
                        className="w-8 h-8 object-contain"
                        onError={() => handlePreviewError(menu.key)}
                        onLoad={() => handlePreviewLoad(menu.key)}
                      />
                    ) : (
                      <DefaultIcon className="h-6 w-6 text-slate-300" />
                    )}
                  </div>

                  {/* Info do menu */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{menu.label}</span>
                      {hasCustomIcon ? (
                        <Badge variant="secondary" className="bg-green-600/20 text-green-400 text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Customizado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-400 text-xs">
                          Padrão
                        </Badge>
                      )}
                    </div>
                    {hasCustomIcon && customUrl && (
                      <p className="text-xs text-slate-400 truncate mt-1">
                        {customUrl}
                      </p>
                    )}
                  </div>

                  {/* Ações */}
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1 max-w-md">
                      <Input
                        placeholder="https://exemplo.com/icone.png"
                        value={iconUrl}
                        onChange={(e) => setIconUrl(e.target.value)}
                        className="bg-slate-600 border-slate-500 text-white"
                      />
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="shrink-0"
                      >
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancel}
                        className="shrink-0 text-slate-400"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {hasCustomIcon && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemove(menu.key)}
                          disabled={isRemoving}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <ImageOff className="h-4 w-4 mr-1" />
                          Remover
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(menu.key)}
                        className="border-slate-500 text-slate-300 hover:bg-slate-600"
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        {hasCustomIcon ? 'Alterar' : 'Adicionar'}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Dicas */}
      <Card className="bg-blue-900/20 border-blue-700/50">
        <CardHeader>
          <CardTitle className="text-blue-300 text-lg">💡 Dicas</CardTitle>
        </CardHeader>
        <CardContent className="text-slate-300 space-y-2 text-sm">
          <p>• Use ícones com fundo transparente (PNG ou SVG) para melhor aparência.</p>
          <p>• Tamanho recomendado: 32x32 pixels ou maior.</p>
          <p>• Você pode usar serviços como Imgur, GitHub, ou seu próprio servidor para hospedar as imagens.</p>
          <p>• Para remover um ícone customizado, clique em "Remover" e o ícone padrão será restaurado.</p>
        </CardContent>
      </Card>
    </div>
  );
}
