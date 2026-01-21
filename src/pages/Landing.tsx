import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { 
  Users, 
  LogIn,
  Calendar, 
  Bell, 
  MessageSquare, 
  TrendingUp, 
  Shield, 
  Smartphone,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Tv,
  Wifi,
  Zap,
  Bot,
  RefreshCw,
  Clock,
  Send,
  BellRing
} from 'lucide-react';

// Platform icon component - now supports dynamic images
const PlatformIcon = ({ name, iconUrl, color, bgColor }: { name: string; iconUrl?: string | null; color: string; bgColor: string }) => (
  <div 
    className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-md transition-transform hover:scale-110 overflow-hidden"
    style={{ backgroundColor: bgColor, color: color }}
  >
    {iconUrl ? (
      <img src={iconUrl} alt={name} className="w-full h-full object-cover" />
    ) : (
      name.substring(0, 2).toUpperCase()
    )}
  </div>
);

// New automation highlights
const automationHighlights = [
  {
    icon: BellRing,
    title: 'Lembretes Automáticos',
    description: 'O sistema avisa quando seus clientes vão vencer. Você não precisa lembrar de nada.'
  },
  {
    icon: Send,
    title: 'Cobrança via WhatsApp',
    description: 'Mensagens de cobrança enviadas automaticamente via WhatsApp API. Sem esforço manual.'
  },
  {
    icon: RefreshCw,
    title: 'Renovação Automática',
    description: 'Clientes renovados automaticamente. Menos trabalho, mais resultados.'
  },
  {
    icon: Bot,
    title: 'Chatbot Integrado',
    description: 'Atendimento automático 24h. Respostas prontas para dúvidas frequentes.'
  },
  {
    icon: Clock,
    title: 'Zero Esquecimentos',
    description: 'Nunca mais perca um cliente por esquecer a data de vencimento.'
  },
  {
    icon: Zap,
    title: 'Tudo no Automático',
    description: 'Configure uma vez e deixe o sistema trabalhar por você.'
  },
];

export default function Landing() {
  const navigate = useNavigate();

  // Fetch dynamic app settings from database - centralized source of truth
  const { data: appSettings } = useQuery({
    queryKey: ['app-settings-landing'],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['manual_plan_price', 'automatic_plan_price', 'seller_trial_days']);
      return data || [];
    },
    staleTime: 1000 * 60 * 2, // Cache for 2 minutes for faster sync
  });

  // Fetch platforms from database
  const { data: platforms } = useQuery({
    queryKey: ['landing_platforms'],
    queryFn: async () => {
      const { data } = await supabase
        .from('landing_platforms')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      return data || [];
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Centralized prices from admin settings
  const manualPlanPrice = appSettings?.find(s => s.key === 'manual_plan_price')?.value || '20';
  const automaticPlanPrice = appSettings?.find(s => s.key === 'automatic_plan_price')?.value || '35';
  const trialDays = appSettings?.find(s => s.key === 'seller_trial_days')?.value || '5';

  const features = [
    {
      icon: Calendar,
      title: 'Controle de Vencimentos',
      description: 'Nunca mais esqueça quando um cliente vence. Alertas automáticos para renovações.'
    },
    {
      icon: MessageSquare,
      title: 'Mensagens Automáticas',
      description: 'Templates prontos para WhatsApp e Telegram. Copie e envie com um clique.'
    },
    {
      icon: TrendingUp,
      title: 'Relatórios Detalhados',
      description: 'Acompanhe seu faturamento, clientes ativos e previsões de receita.'
    },
    {
      icon: Bell,
      title: 'Alertas Inteligentes',
      description: 'Receba notificações de vencimentos em 1, 2 e 3 dias de antecedência.'
    },
    {
      icon: Shield,
      title: 'Dados Seguros',
      description: 'Criptografia de ponta e backup automático de todos os seus dados.'
    },
    {
      icon: Smartphone,
      title: 'App Instalável',
      description: 'Instale como app no seu celular. Funciona offline quando precisar.'
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <span className="font-bold text-lg">Controle de Clientes</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate('/auth')}>
              <LogIn className="h-4 w-4 mr-2" />
              Entrar
            </Button>
            <Button onClick={() => navigate('/auth')}>
              Criar Conta
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section - Updated for Automation */}
      <section className="relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-primary/5 pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative container mx-auto px-4 py-16 sm:py-24">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            {/* NEW Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/30 text-sm font-medium text-green-600 dark:text-green-400 animate-fade-in">
              <Zap className="h-4 w-4" />
              Novo: Automação Completa via WhatsApp
            </div>

            {/* Main Title - Focus on Automation */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight animate-fade-in">
              <span className="text-foreground">Esqueça de lembrar.</span>
              <br />
              <span className="text-primary">O sistema lembra por você.</span>
            </h1>

            {/* Subtitle - Clear Value Proposition */}
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto animate-fade-in">
              Lembretes automáticos de vencimento, cobrança via WhatsApp e renovação de clientes — 
              <span className="font-semibold text-foreground"> tudo no automático</span>.
              <span className="block mt-2 text-foreground/80">
                Menos trabalho manual. Mais tempo para vender. Zero clientes perdidos por esquecimento.
              </span>
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in">
              <Button 
                size="lg" 
                className="w-full sm:w-auto text-lg px-8 py-6 gap-2"
                onClick={() => navigate('/auth')}
              >
                Automatize suas Renovações
                <ArrowRight className="h-5 w-5" />
              </Button>
            </div>

            {/* Quick Stats */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Cobrança automática</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Chatbot 24h</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>WhatsApp API</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* NEW: Automation Highlights Section */}
      <section className="py-12 sm:py-16 bg-gradient-to-b from-background to-card/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary mb-4">
              <Sparkles className="h-3 w-3" />
              Novidades
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">
              Sistema que trabalha enquanto você vende
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Automação completa para você focar no que importa: fechar mais vendas.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {automationHighlights.map((item, index) => (
              <div 
                key={index}
                className="group p-5 rounded-xl bg-card border border-border hover:border-primary/50 hover:shadow-lg transition-all duration-300 animate-slide-up"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Secondary CTA */}
          <div className="text-center mt-10">
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => navigate('/auth')}
              className="gap-2"
            >
              Conhecer as Novidades
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Platform Icons Section */}
      <section className="py-10 border-y border-border bg-card/30">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-4">Gerencie todas as plataformas em um só lugar</p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              {platforms?.map((platform) => (
                <div key={platform.id} className="flex flex-col items-center gap-1">
                  <PlatformIcon 
                    name={platform.display_name} 
                    iconUrl={platform.icon_url}
                    color={platform.color} 
                    bgColor={platform.bg_color} 
                  />
                  <span className="text-xs text-muted-foreground">{platform.display_name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 sm:py-24 bg-card/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Tudo que você precisa em um só lugar
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Ferramentas poderosas para você focar no que importa: vender e crescer seu negócio.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {features.map((feature, index) => (
              <Card 
                key={index}
                className="group hover:shadow-lg hover:border-primary/50 transition-all duration-300 animate-slide-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <CardContent className="p-6 space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Por que escolher nosso sistema?
              </h2>
            </div>

            <div className="space-y-4">
              {[
                'Lembretes automáticos de vencimento — nunca mais esqueça um cliente',
                'Cobrança automática via WhatsApp API — sem envio manual',
                'Chatbot integrado para respostas automáticas 24h',
                'Renovação de clientes sem precisar fazer nada',
                'Gerencie IPTV, P2P, SSH, VPN e qualquer serviço de streaming',
                'Controle contas Premium: Netflix, Spotify, Disney+, HBO Max e mais',
                'Crie planos personalizados e controle preços automaticamente',
                'Chave PIX integrada nas mensagens de cobrança',
                'Sistema de indicação com descontos automáticos',
                'Relatórios completos de faturamento e previsões',
                'App instalável no celular com acesso rápido',
                'Backup completo dos seus dados',
              ].map((benefit, index) => (
                <div 
                  key={index}
                  className="flex items-center gap-3 p-4 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors animate-slide-up"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-foreground">{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-16 sm:py-24 bg-gradient-to-br from-primary/10 via-transparent to-primary/5">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Zap className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold">
              Pronto para automatizar seu negócio?
            </h2>
            <p className="text-lg text-muted-foreground">
              Comece agora com {trialDays} dias grátis. Sem compromisso, sem cartão de crédito.
            </p>
            <Button 
              size="lg" 
              className="text-lg px-8 py-6 gap-2"
              onClick={() => navigate('/auth')}
            >
              Criar Conta Grátis
              <ArrowRight className="h-5 w-5" />
            </Button>
            
            {/* Pricing Badges - Both Plans */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {/* Manual Plan */}
              <div className="inline-flex flex-col items-center gap-1 p-4 rounded-2xl bg-card border border-border shadow-lg">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Plano Manual</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-bold text-foreground">R$ {manualPlanPrice}</span>
                  <span className="text-muted-foreground">/mês</span>
                </div>
              </div>
              
              {/* Automatic Plan - Featured */}
              <div className="inline-flex flex-col items-center gap-1 p-4 rounded-2xl bg-primary/5 border border-primary/30 shadow-lg">
                <span className="text-xs font-medium text-primary uppercase tracking-wide">Plano Automático</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-bold text-primary">R$ {automaticPlanPrice}</span>
                  <span className="text-muted-foreground">/mês</span>
                </div>
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground">
              Teste grátis por {trialDays} dias • Cancele quando quiser
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Controle de Clientes. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
