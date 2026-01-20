import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Sparkles, Package, MessageSquare, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface GenerateDefaultDataProps {
  userId: string;
  isAdmin: boolean;
  companyName?: string;
}

// Default plans for SELLERS (sell to end clients)
const SELLER_PLANS = [
  // IPTV Plans
  { name: 'IPTV Mensal 1 Tela', price: 25, duration_days: 30, category: 'IPTV', screens: 1 },
  { name: 'IPTV Mensal 2 Telas', price: 40, duration_days: 30, category: 'IPTV', screens: 2 },
  { name: 'IPTV Mensal 3 Telas', price: 55, duration_days: 30, category: 'IPTV', screens: 3 },
  { name: 'IPTV Trimestral 1 Tela', price: 65, duration_days: 90, category: 'IPTV', screens: 1 },
  { name: 'IPTV Semestral 1 Tela', price: 120, duration_days: 180, category: 'IPTV', screens: 1 },
  { name: 'IPTV Anual 1 Tela', price: 200, duration_days: 365, category: 'IPTV', screens: 1 },
  // P2P Plans
  { name: 'P2P Mensal', price: 20, duration_days: 30, category: 'P2P', screens: 1 },
  { name: 'P2P Trimestral', price: 50, duration_days: 90, category: 'P2P', screens: 1 },
  { name: 'P2P Semestral', price: 90, duration_days: 180, category: 'P2P', screens: 1 },
  // Premium Plans (Netflix, Spotify, etc.)
  { name: 'Netflix Mensal', price: 15, duration_days: 30, category: 'Premium', screens: 1 },
  { name: 'Spotify Mensal', price: 10, duration_days: 30, category: 'Premium', screens: 1 },
  { name: 'HBO Max Mensal', price: 12, duration_days: 30, category: 'Premium', screens: 1 },
  { name: 'Disney+ Mensal', price: 12, duration_days: 30, category: 'Premium', screens: 1 },
];

// Default plans for ADMIN (sell to resellers)
const ADMIN_PLANS = [
  { name: 'Revenda Mensal', price: 50, duration_days: 30, category: 'Revendedor', screens: 1, description: 'Acesso ao sistema por 1 mês' },
  { name: 'Revenda Trimestral', price: 120, duration_days: 90, category: 'Revendedor', screens: 1, description: 'Acesso ao sistema por 3 meses' },
  { name: 'Revenda Semestral', price: 200, duration_days: 180, category: 'Revendedor', screens: 1, description: 'Acesso ao sistema por 6 meses' },
  { name: 'Revenda Anual', price: 350, duration_days: 365, category: 'Revendedor', screens: 1, description: 'Acesso ao sistema por 1 ano' },
  { name: 'Revenda Vitalícia', price: 800, duration_days: 36500, category: 'Revendedor', screens: 1, description: 'Acesso permanente ao sistema' },
];

// Default templates for SELLERS (send to end clients)
const SELLER_TEMPLATES = [
  // Welcome
  {
    name: 'Boas-vindas IPTV',
    type: 'welcome',
    message: `🎉 Olá {nome}!

Seja bem-vindo(a) à nossa família!

📺 *Plano:* {plano}
📆 *Vencimento:* {vencimento}
🔑 *Login:* {login}
🔐 *Senha:* {senha}

{mac}

Qualquer dúvida, estamos à disposição!

*{empresa}*`,
  },
  {
    name: 'Boas-vindas P2P',
    type: 'welcome',
    message: `🎉 Olá {nome}!

Seja bem-vindo(a) à nossa família!

📺 *Plano:* {plano}
📆 *Vencimento:* {vencimento}
🔑 *Login:* {login}
🔐 *Senha:* {senha}

{mac}

Qualquer dúvida, estamos à disposição!

*{empresa}*`,
  },
  {
    name: 'Boas-vindas Premium',
    type: 'welcome',
    message: `🎉 *Olá, {nome}!*

Sua conta Premium está pronta!

🎬 *{conta_premium}*
📧 Email: {email_premium}
🔑 Senha: {senha_premium}
📅 Vencimento: {vencimento}

Bom entretenimento!

_{empresa}_`,
  },
  // Billing / Expiring
  {
    name: 'Cobrança 3 dias',
    type: 'expiring_3days',
    message: `⏰ *Olá, {nome}!*

Seu plano vence em *3 dias* ({vencimento}).

💰 *Valor para renovação:* R$ {valor}

🔑 PIX: {pix}

Renove agora e não fique sem acesso!

_{empresa}_`,
  },
  {
    name: 'Cobrança 1 dia',
    type: 'expiring_1day',
    message: `🔔 *Atenção, {nome}!*

Seu plano vence *AMANHÃ* ({vencimento})!

💰 Renovação: R$ {valor}
🔑 PIX: {pix}

Evite ficar sem acesso, renove agora!

_{empresa}_`,
  },
  {
    name: 'Plano Vencido',
    type: 'expired',
    message: `❌ *Olá, {nome}*

Seu plano venceu em {vencimento}.

Para reativar seu acesso:
💰 Valor: R$ {valor}
🔑 PIX: {pix}

Aguardamos seu retorno!

_{empresa}_`,
  },
  // Renewal
  {
    name: 'Renovação Confirmada',
    type: 'renewal',
    message: `✅ *Renovação Confirmada!*

Olá, {nome}!

Seu plano foi renovado com sucesso!

📺 *Plano:* {plano}
📅 *Novo vencimento:* {vencimento}
🎬 *Servidor:* {servidor}

Obrigado pela confiança!

_{empresa}_`,
  },
  // Credentials
  {
    name: 'Enviar Credenciais',
    type: 'credentials',
    message: `🔐 *Suas Credenciais*

Olá, {nome}!

📺 *Dados de acesso:*
👤 Login: {login}
🔑 Senha: {senha}

📅 Vencimento: {vencimento}
🎬 Servidor: {servidor}

_{empresa}_`,
  },
  // Loyalty
  {
    name: 'Fidelização',
    type: 'loyalty',
    message: `💝 *Cliente Especial!*

Olá, {nome}!

Você está conosco há muito tempo e queremos agradecer!

🎁 Na sua próxima renovação, ganhe *10% de desconto*!

Obrigado pela fidelidade!

_{empresa}_`,
  },
  // Referral
  {
    name: 'Programa de Indicação',
    type: 'referral',
    message: `🤝 *Indique e Ganhe!*

Olá, {nome}!

Indique amigos e ganhe descontos!

📢 Para cada indicação que fechar, você ganha *50% de desconto* na sua próxima mensalidade!

Basta seu indicado informar seu nome na hora de contratar.

_{empresa}_`,
  },
];

// Default templates for ADMIN (send to resellers)
const ADMIN_TEMPLATES = [
  // Welcome for resellers
  {
    name: 'Boas-vindas Revendedor',
    type: 'welcome',
    message: `🎉 *Bem-vindo à equipe, {nome}!*

Seu acesso ao sistema está liberado!

🖥️ *Painel:* {link_painel}
👤 *Usuário:* {usuario}
🔑 *Senha:* {senha}

📅 *Vencimento:* {vencimento}

Qualquer dúvida, estamos à disposição!

_{empresa}_`,
  },
  // Billing for resellers
  {
    name: 'Cobrança Revenda 3 dias',
    type: 'expiring_3days',
    message: `⏰ *Olá, {nome}!*

Sua licença de revenda vence em *3 dias* ({vencimento}).

💰 *Renovação:* R$ {valor}
🔑 *PIX:* {pix}

Renove agora e continue vendendo!

_{empresa}_`,
  },
  {
    name: 'Cobrança Revenda 1 dia',
    type: 'expiring_1day',
    message: `🔔 *Atenção, {nome}!*

Sua licença vence *AMANHÃ* ({vencimento})!

💰 Valor: R$ {valor}
🔑 PIX: {pix}

Não deixe seus clientes sem suporte!

_{empresa}_`,
  },
  {
    name: 'Revenda Vencida',
    type: 'expired',
    message: `❌ *Olá, {nome}*

Sua licença de revenda venceu em {vencimento}.

Para reativar:
💰 Valor: R$ {valor}
🔑 PIX: {pix}

Seus clientes continuam ativos, mas você não consegue gerenciar. Renove agora!

_{empresa}_`,
  },
  // Renewal confirmation
  {
    name: 'Renovação Revenda',
    type: 'renewal',
    message: `✅ *Renovação Confirmada!*

Olá, {nome}!

Sua licença de revenda foi renovada!

🖥️ *Painel:* {link_painel}
📅 *Novo vencimento:* {vencimento}

Boas vendas!

_{empresa}_`,
  },
  // Credentials
  {
    name: 'Credenciais Revenda',
    type: 'credentials',
    message: `🔐 *Seus Dados de Acesso*

Olá, {nome}!

🖥️ *Painel:* {link_painel}
👤 *Usuário:* {usuario}
🔑 *Senha:* {senha}

📅 Vencimento: {vencimento}

_{empresa}_`,
  },
];

export function GenerateDefaultData({ userId, isAdmin, companyName = 'Minha Empresa' }: GenerateDefaultDataProps) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [generatePlans, setGeneratePlans] = useState(true);
  const [generateTemplates, setGenerateTemplates] = useState(true);

  // Fetch profile data to get pix_key and company_name
  const { data: profileData } = useQuery({
    queryKey: ['profile-for-templates', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('company_name, pix_key, full_name')
        .eq('id', userId)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!userId,
  });

  const effectiveCompanyName = profileData?.company_name || companyName || profileData?.full_name || 'Minha Empresa';
  const effectivePixKey = profileData?.pix_key || '';

  const mutation = useMutation({
    mutationFn: async () => {
      const results = { plans: 0, templates: 0 };

      // Generate Plans
      if (generatePlans) {
        const plansToCreate = isAdmin ? ADMIN_PLANS : SELLER_PLANS;
        
        for (const plan of plansToCreate) {
          const { error } = await supabase
            .from('plans')
            .insert({
              seller_id: userId,
              name: plan.name,
              description: (plan as any).description || null,
              price: plan.price,
              duration_days: plan.duration_days,
              category: plan.category,
              screens: plan.screens,
              is_active: true,
            });
          
          if (!error) results.plans++;
        }
      }

      // Generate Templates
      if (generateTemplates) {
        const templatesToCreate = isAdmin ? ADMIN_TEMPLATES : SELLER_TEMPLATES;
        
        for (const template of templatesToCreate) {
          // Replace {empresa} with actual company name and {pix} with actual pix key
          let message = template.message
            .replace(/{empresa}/g, effectiveCompanyName)
            .replace(/{pix}/g, effectivePixKey || '(configure seu PIX nas configurações)');

          const { error } = await supabase
            .from('whatsapp_templates')
            .insert({
              seller_id: userId,
              name: template.name,
              type: template.type,
              message: message,
              is_default: false,
            });
          
          if (!error) results.templates++;
        }
      }

      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success(`Criados ${results.plans} planos e ${results.templates} templates!`);
      setIsOpen(false);
    },
    onError: (error) => {
      console.error('Error generating data:', error);
      toast.error('Erro ao gerar dados. Alguns itens podem já existir.');
    },
  });

  const plans = isAdmin ? ADMIN_PLANS : SELLER_PLANS;
  const templates = isAdmin ? ADMIN_TEMPLATES : SELLER_TEMPLATES;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Sparkles className="h-4 w-4" />
          Gerar Dados Padrão
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Gerar Planos e Templates
          </DialogTitle>
          <DialogDescription>
            {isAdmin 
              ? 'Criar planos e templates para gerenciar seus revendedores'
              : 'Criar planos e templates para atender seus clientes'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
            <Checkbox
              id="generatePlans"
              checked={generatePlans}
              onCheckedChange={(checked) => setGeneratePlans(!!checked)}
            />
            <div className="space-y-1">
              <Label htmlFor="generatePlans" className="font-medium cursor-pointer flex items-center gap-2">
                <Package className="h-4 w-4" />
                Gerar {plans.length} Planos
              </Label>
              <div className="flex flex-wrap gap-1">
                {[...new Set(plans.map(p => p.category))].map(cat => (
                  <Badge key={cat} variant="secondary" className="text-xs">
                    {cat}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
            <Checkbox
              id="generateTemplates"
              checked={generateTemplates}
              onCheckedChange={(checked) => setGenerateTemplates(!!checked)}
            />
            <div className="space-y-1">
              <Label htmlFor="generateTemplates" className="font-medium cursor-pointer flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Gerar {templates.length} Templates
              </Label>
              <div className="flex flex-wrap gap-1">
                {[...new Set(templates.map(t => t.type))].map(type => (
                  <Badge key={type} variant="outline" className="text-xs">
                    {type}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                <strong>Modo Administrador:</strong> Os planos e templates serão voltados para gerenciar <em>revendedores</em>, não clientes finais.
              </p>
            </div>
          )}

          {!isAdmin && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <p className="text-sm text-blue-600 dark:text-blue-400">
                <strong>Modo Revendedor:</strong> Os planos e templates serão voltados para atender seus <em>clientes finais</em> (IPTV, P2P, Premium).
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={() => mutation.mutate()} 
            disabled={mutation.isPending || (!generatePlans && !generateTemplates)}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Gerar Agora
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
