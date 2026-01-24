-- =====================================================
-- MIGRATION: Standardize ON DELETE behavior for server_id foreign keys
-- 
-- Strategy:
-- - clients.server_id → SET NULL (preserve client, just unlink server)
-- - server_apps.server_id → CASCADE (delete apps when server is deleted)
-- - client_server_app_credentials.server_id → CASCADE (delete credentials when server deleted)
-- - reseller_device_apps.server_id → SET NULL (already correct, just verify)
-- - panel_clients.panel_id → CASCADE (delete assignments when server deleted)
--
-- This prevents orphaned references and allows server deletion safely.
-- =====================================================

-- 1. Fix clients.server_id → ON DELETE SET NULL
-- First drop the existing constraint, then recreate with SET NULL
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_server_id_fkey;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_server_id_fkey
  FOREIGN KEY (server_id)
  REFERENCES public.servers(id)
  ON DELETE SET NULL;

-- 2. Fix server_apps.server_id → ON DELETE CASCADE (already has, but verify/recreate)
ALTER TABLE public.server_apps
  DROP CONSTRAINT IF EXISTS server_apps_server_id_fkey;

ALTER TABLE public.server_apps
  ADD CONSTRAINT server_apps_server_id_fkey
  FOREIGN KEY (server_id)
  REFERENCES public.servers(id)
  ON DELETE CASCADE;

-- 3. Fix client_server_app_credentials.server_id → ON DELETE CASCADE (already has, but verify/recreate)
ALTER TABLE public.client_server_app_credentials
  DROP CONSTRAINT IF EXISTS client_server_app_credentials_server_id_fkey;

ALTER TABLE public.client_server_app_credentials
  ADD CONSTRAINT client_server_app_credentials_server_id_fkey
  FOREIGN KEY (server_id)
  REFERENCES public.servers(id)
  ON DELETE CASCADE;

-- 4. Fix panel_clients.panel_id → ON DELETE CASCADE 
-- panel_id references servers.id (the server acting as a panel)
ALTER TABLE public.panel_clients
  DROP CONSTRAINT IF EXISTS panel_clients_panel_id_fkey;

ALTER TABLE public.panel_clients
  ADD CONSTRAINT panel_clients_panel_id_fkey
  FOREIGN KEY (panel_id)
  REFERENCES public.servers(id)
  ON DELETE CASCADE;

-- 5. Verify reseller_device_apps.server_id → ON DELETE SET NULL (should already be correct)
ALTER TABLE public.reseller_device_apps
  DROP CONSTRAINT IF EXISTS reseller_device_apps_server_id_fkey;

ALTER TABLE public.reseller_device_apps
  ADD CONSTRAINT reseller_device_apps_server_id_fkey
  FOREIGN KEY (server_id)
  REFERENCES public.servers(id)
  ON DELETE SET NULL;

-- 6. Fix test_integration_config.server_id → ON DELETE SET NULL (should already be correct, verify)
ALTER TABLE public.test_integration_config
  DROP CONSTRAINT IF EXISTS test_integration_config_server_id_fkey;

ALTER TABLE public.test_integration_config
  ADD CONSTRAINT test_integration_config_server_id_fkey
  FOREIGN KEY (server_id)
  REFERENCES public.servers(id)
  ON DELETE SET NULL;

-- =====================================================
-- Summary of ON DELETE behaviors:
-- =====================================================
-- clients.server_id                    → SET NULL (keep client, remove server link)
-- server_apps.server_id                → CASCADE (delete apps with server)
-- client_server_app_credentials        → CASCADE (delete credentials with server)
-- panel_clients.panel_id               → CASCADE (delete panel assignments with server)
-- reseller_device_apps.server_id       → SET NULL (keep app, remove server link)
-- test_integration_config.server_id    → SET NULL (keep config, remove server link)
-- =====================================================