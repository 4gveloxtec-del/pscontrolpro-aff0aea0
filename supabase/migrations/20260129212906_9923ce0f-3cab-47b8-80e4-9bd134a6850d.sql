-- Tabela para pagamentos ASAAS de revendedores
CREATE TABLE public.asaas_reseller_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asaas_payment_id TEXT,
  asaas_customer_id TEXT,
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  due_date DATE NOT NULL,
  paid_at TIMESTAMP WITH TIME ZONE,
  pix_copy_paste TEXT,
  pix_qr_code TEXT,
  invoice_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.asaas_reseller_payments ENABLE ROW LEVEL SECURITY;

-- Políticas RLS - apenas admins podem gerenciar pagamentos
CREATE POLICY "Admins can view all asaas payments" 
ON public.asaas_reseller_payments 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can create asaas payments" 
ON public.asaas_reseller_payments 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update asaas payments" 
ON public.asaas_reseller_payments 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete asaas payments" 
ON public.asaas_reseller_payments 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Revendedores podem ver seus próprios pagamentos
CREATE POLICY "Resellers can view own payments" 
ON public.asaas_reseller_payments 
FOR SELECT 
USING (reseller_id = auth.uid());

-- Trigger para updated_at
CREATE TRIGGER update_asaas_reseller_payments_updated_at
BEFORE UPDATE ON public.asaas_reseller_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX idx_asaas_payments_reseller ON public.asaas_reseller_payments(reseller_id);
CREATE INDEX idx_asaas_payments_status ON public.asaas_reseller_payments(status);
CREATE INDEX idx_asaas_payments_due_date ON public.asaas_reseller_payments(due_date);

-- Inserir configurações ASAAS na app_settings (se não existirem)
INSERT INTO public.app_settings (key, value, description)
VALUES 
  ('asaas_api_key', '', 'Chave de API do ASAAS para cobranças'),
  ('asaas_environment', 'sandbox', 'Ambiente ASAAS: sandbox ou production'),
  ('asaas_webhook_token', '', 'Token para validar webhooks do ASAAS')
ON CONFLICT (key) DO NOTHING;