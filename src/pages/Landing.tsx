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
  Wifi
} from 'lucide-react';

// Platform icons as simple styled components
const PlatformIcon = ({ name, color, bgColor }: { name: string; color: string; bgColor: string }) => (
  <div 
    className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-md transition-transform hover:scale-110"
    style={{ backgroundColor: bgColor, color: color }}
  >
    {name}
  </div>
);

const platforms = [
  { name: 'N', label: 'Netflix', color: '#fff', bgColor: '#E50914' },
  { name: 'S', label: 'Spotify', color: '#fff', bgColor: '#1DB954' },
  { name: 'D+', label: 'Disney+', color: '#fff', bgColor: '#113CCF' },
  { name: 'H', label: 'HBO Max', color: '#fff', bgColor: '#5822B4' },
  { name: 'P+', label: 'Prime', color: '#fff', bgColor: '#00A8E1' },
  { name: 'TV', label: 'IPTV', color: '#fff', bgColor: 'hsl(var(--primary))' },
];

export default function Landing() {
  const navigate = useNavigate();

  // Fetch dynamic app settings from database
  const { data: appSettings } = useQuery({
    queryKey: ['app-settings-landing'],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['app_monthly_price', 'seller_trial_days']);
      return data || [];
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  const appPrice = appSettings?.find(s => s.key === 'app_monthly_price')?.value || '25';
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

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-primary/5 pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative container mx-auto px-4 py-16 sm:py-24">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium text-primary animate-fade-in">
              <Sparkles className="h-4 w-4" />
              Sistema Completo de Gestão
            </div>

            {/* Main Title */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight animate-fade-in">
              <span className="text-foreground">Organize suas vendas.</span>
              <br />
              <span className="text-primary">Nunca mais perca uma renovação.</span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto animate-fade-in">
              O aplicativo definitivo para revendedores de IPTV, P2P, contas Premium e serviços digitais. 
              Gerencie clientes de Netflix, Spotify, Disney+, IPTV, P2P e muito mais em um só lugar.
              <span className="block mt-2 font-medium text-foreground">
                Porque seu negócio merece funcionar no automático.
              </span>
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in">
              <Button 
                size="lg" 
                className="w-full sm:w-auto text-lg px-8 py-6 gap-2"
                onClick={() => navigate('/auth')}
              >
                Começar Agora
                <ArrowRight className="h-5 w-5" />
              </Button>
            </div>

            {/* Pricing Badge */}
            <div className="inline-flex flex-col items-center gap-1 p-4 rounded-2xl bg-card border border-border shadow-lg animate-fade-in">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl sm:text-4xl font-bold text-primary">R$ {appPrice || '25'}</span>
                <span className="text-muted-foreground">/mês</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Teste grátis por {trialDays} dias • Sem cartão
              </p>
            </div>

            {/* Platform Icons */}
            <div className="animate-fade-in pt-4">
              <p className="text-sm text-muted-foreground mb-4">Gerencie todas as plataformas</p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {platforms.map((platform) => (
                  <div key={platform.label} className="flex flex-col items-center gap-1">
                    <PlatformIcon name={platform.name} color={platform.color} bgColor={platform.bgColor} />
                    <span className="text-xs text-muted-foreground">{platform.label}</span>
                  </div>
                ))}
              </div>
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
                'Gerencie IPTV, P2P, SSH, VPN e qualquer serviço de streaming',
                'Controle contas Premium: Netflix, Spotify, Disney+, HBO Max e mais',
                'Crie planos personalizados e controle preços automaticamente',
                'Templates prontos de mensagem para WhatsApp e Telegram',
                'Chave PIX integrada nas mensagens de cobrança',
                'Sistema de indicação com descontos automáticos',
                'Múltiplos servidores e painéis compartilhados',
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
            <Users className="h-16 w-16 text-primary mx-auto" />
            <h2 className="text-3xl sm:text-4xl font-bold">
              Pronto para organizar seu negócio?
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
