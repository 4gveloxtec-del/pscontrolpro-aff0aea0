import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Upload, 
  GripVertical, 
  Loader2,
  Image as ImageIcon,
  Save
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface Platform {
  id: string;
  name: string;
  display_name: string;
  icon_url: string | null;
  color: string;
  bg_color: string;
  sort_order: number;
  is_active: boolean;
}

interface AdminLandingPlatformsProps {
  onBack: () => void;
}

export function AdminLandingPlatforms({ onBack }: AdminLandingPlatformsProps) {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newPlatform, setNewPlatform] = useState({
    name: '',
    display_name: '',
    color: '#6366f1',
    bg_color: 'rgba(99, 102, 241, 0.1)',
  });
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  // Fetch platforms
  const { data: platforms, isLoading } = useQuery({
    queryKey: ['landing_platforms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('landing_platforms')
        .select('*')
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      return data as Platform[];
    },
  });

  // Update platform
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Platform> }) => {
      const { error } = await supabase
        .from('landing_platforms')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landing_platforms'] });
      toast.success('Plataforma atualizada!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar: ' + error.message);
    },
  });

  // Add platform
  const addMutation = useMutation({
    mutationFn: async (platform: typeof newPlatform) => {
      const maxOrder = platforms?.reduce((max, p) => Math.max(max, p.sort_order), 0) || 0;
      
      const { error } = await supabase
        .from('landing_platforms')
        .insert({
          ...platform,
          sort_order: maxOrder + 1,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landing_platforms'] });
      toast.success('Plataforma adicionada!');
      setIsAddDialogOpen(false);
      setNewPlatform({ name: '', display_name: '', color: '#6366f1', bg_color: 'rgba(99, 102, 241, 0.1)' });
    },
    onError: (error) => {
      toast.error('Erro ao adicionar: ' + error.message);
    },
  });

  // Delete platform
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('landing_platforms')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landing_platforms'] });
      toast.success('Plataforma removida!');
    },
    onError: (error) => {
      toast.error('Erro ao remover: ' + error.message);
    },
  });

  // Handle image upload
  const handleImageUpload = async (platformId: string, file: File) => {
    if (!file) return;
    
    setUploadingId(platformId);
    
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${platformId}.${fileExt}`;
      
      // Delete old file if exists
      await supabase.storage
        .from('landing-images')
        .remove([fileName]);
      
      // Upload new file
      const { error: uploadError } = await supabase.storage
        .from('landing-images')
        .upload(fileName, file, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('landing-images')
        .getPublicUrl(fileName);
      
      // Update platform with new URL
      await updateMutation.mutateAsync({ 
        id: platformId, 
        updates: { icon_url: publicUrl } 
      });
      
      toast.success('Imagem enviada com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao enviar imagem: ' + error.message);
    } finally {
      setUploadingId(null);
    }
  };

  // Remove image
  const handleRemoveImage = async (platform: Platform) => {
    try {
      if (platform.icon_url) {
        const fileName = platform.icon_url.split('/').pop();
        if (fileName) {
          await supabase.storage
            .from('landing-images')
            .remove([fileName]);
        }
      }
      
      await updateMutation.mutateAsync({ 
        id: platform.id, 
        updates: { icon_url: null } 
      });
      
      toast.success('Imagem removida!');
    } catch (error: any) {
      toast.error('Erro ao remover imagem: ' + error.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">Plataformas da Landing Page</h2>
            <p className="text-sm text-muted-foreground">
              Gerencie as plataformas exibidas na página inicial
            </p>
          </div>
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Plataforma</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Nome (identificador)</Label>
                <Input
                  value={newPlatform.name}
                  onChange={(e) => setNewPlatform({ ...newPlatform, name: e.target.value })}
                  placeholder="netflix"
                />
              </div>
              <div>
                <Label>Nome de Exibição</Label>
                <Input
                  value={newPlatform.display_name}
                  onChange={(e) => setNewPlatform({ ...newPlatform, display_name: e.target.value })}
                  placeholder="Netflix"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cor do Texto</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={newPlatform.color}
                      onChange={(e) => setNewPlatform({ ...newPlatform, color: e.target.value })}
                      className="w-12 h-10 p-1"
                    />
                    <Input
                      value={newPlatform.color}
                      onChange={(e) => setNewPlatform({ ...newPlatform, color: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Cor de Fundo</Label>
                  <Input
                    value={newPlatform.bg_color}
                    onChange={(e) => setNewPlatform({ ...newPlatform, bg_color: e.target.value })}
                    placeholder="rgba(229, 9, 20, 0.1)"
                  />
                </div>
              </div>
              <Button 
                onClick={() => addMutation.mutate(newPlatform)}
                disabled={!newPlatform.name || !newPlatform.display_name || addMutation.isPending}
                className="w-full"
              >
                {addMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Adicionar Plataforma
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Platforms Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {platforms?.map((platform) => (
          <Card key={platform.id} className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                  {platform.display_name}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={platform.is_active}
                    onCheckedChange={(checked) => 
                      updateMutation.mutate({ id: platform.id, updates: { is_active: checked } })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm('Remover esta plataforma?')) {
                        deleteMutation.mutate(platform.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Image Preview */}
              <div className="relative aspect-square w-24 mx-auto rounded-xl overflow-hidden border-2 border-dashed border-muted-foreground/30">
                {platform.icon_url ? (
                  <img
                    src={platform.icon_url}
                    alt={platform.display_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div 
                    className="w-full h-full flex items-center justify-center text-2xl font-bold"
                    style={{ backgroundColor: platform.bg_color, color: platform.color }}
                  >
                    {platform.display_name.substring(0, 2).toUpperCase()}
                  </div>
                )}
                
                {uploadingId === platform.id && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                )}
              </div>

              {/* Upload Button */}
              <div className="flex gap-2">
                <label className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(platform.id, file);
                    }}
                  />
                  <Button
                    variant="outline"
                    className="w-full cursor-pointer"
                    asChild
                  >
                    <span>
                      <Upload className="h-4 w-4 mr-2" />
                      {platform.icon_url ? 'Trocar' : 'Enviar'} Imagem
                    </span>
                  </Button>
                </label>
                
                {platform.icon_url && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleRemoveImage(platform)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Edit Fields */}
              <div className="space-y-2 pt-2 border-t">
                <div>
                  <Label className="text-xs">Nome de Exibição</Label>
                  <Input
                    value={platform.display_name}
                    onChange={(e) => 
                      updateMutation.mutate({ 
                        id: platform.id, 
                        updates: { display_name: e.target.value } 
                      })
                    }
                    className="h-8 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Cor</Label>
                    <Input
                      type="color"
                      value={platform.color}
                      onChange={(e) => 
                        updateMutation.mutate({ 
                          id: platform.id, 
                          updates: { color: e.target.value } 
                        })
                      }
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Ordem</Label>
                    <Input
                      type="number"
                      value={platform.sort_order}
                      onChange={(e) => 
                        updateMutation.mutate({ 
                          id: platform.id, 
                          updates: { sort_order: parseInt(e.target.value) } 
                        })
                      }
                      className="h-8"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {platforms?.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhuma plataforma cadastrada</p>
          <p className="text-sm">Clique em "Adicionar" para criar a primeira</p>
        </div>
      )}
    </div>
  );
}
