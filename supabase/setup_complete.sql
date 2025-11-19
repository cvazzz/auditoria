-- =====================================================
-- SCRIPT COMPLETO PARA CONFIGURAR SUPABASE
-- Ejecutar en SQL Editor de Supabase
-- =====================================================

-- 1. Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CREAR TABLAS
-- Tabla de perfiles de usuarios
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  dni text,
  phone text,
  email text NOT NULL UNIQUE,
  zone text NOT NULL,
  role text NOT NULL DEFAULT 'supervisor',
  created_at timestamptz DEFAULT now()
);

-- Tabla de reembolsos
CREATE TABLE IF NOT EXISTS reimbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  type text NOT NULL,
  reported_amount numeric(12,2) NOT NULL,
  detected_amount numeric(12,2),
  detected_currency text,
  gasto_date date,
  week integer,
  month integer,
  year integer,
  transport_image_url text,
  cost_screenshot_url text,
  receipt_url text,
  ai_result text,
  ai_confidence numeric(5,4),
  status text NOT NULL DEFAULT 'PENDING_OCR',
  auditor_comment text,
  created_at timestamptz DEFAULT now(),
  audited_at timestamptz
);

-- Tabla de logs de auditoría
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reimbursement_id uuid REFERENCES reimbursements(id) ON DELETE CASCADE,
  actor text,
  action text,
  detail jsonb,
  created_at timestamptz DEFAULT now()
);

-- 3. CREAR ÍNDICES
CREATE INDEX IF NOT EXISTS idx_reimbursements_profile_id ON reimbursements(profile_id);
CREATE INDEX IF NOT EXISTS idx_reimbursements_status ON reimbursements(status);
CREATE INDEX IF NOT EXISTS idx_reimbursements_created_at ON reimbursements(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_reimbursement_id ON audit_logs(reimbursement_id);

-- 4. HABILITAR ROW LEVEL SECURITY
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reimbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 5. ELIMINAR POLÍTICAS EXISTENTES (si las hay)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own reimbursements" ON reimbursements;
DROP POLICY IF EXISTS "Users can insert own reimbursements" ON reimbursements;
DROP POLICY IF EXISTS "Users can update own pending reimbursements" ON reimbursements;
DROP POLICY IF EXISTS "Service can insert audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Service can view audit logs" ON audit_logs;

-- 6. CREAR POLÍTICAS RLS SIMPLES
-- Políticas para profiles
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Políticas para reimbursements
CREATE POLICY "Users can view own reimbursements" ON reimbursements
  FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Users can insert own reimbursements" ON reimbursements
  FOR INSERT
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update own pending reimbursements" ON reimbursements
  FOR UPDATE
  USING (profile_id = auth.uid());

-- Políticas para audit_logs (el service role siempre tiene acceso)
CREATE POLICY "Service can insert audit logs" ON audit_logs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can view audit logs" ON audit_logs
  FOR SELECT
  USING (true);

-- 7. FUNCIÓN PARA CREAR PERFIL AUTOMÁTICAMENTE AL REGISTRARSE
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, zone, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Usuario'),
    new.email,
    COALESCE(new.raw_user_meta_data->>'zone', 'Sin asignar'),
    COALESCE(new.raw_user_meta_data->>'role', 'supervisor')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. CREAR TRIGGER PARA AUTO-CREAR PERFIL
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- SCRIPT COMPLETADO
-- Ahora puedes crear usuarios desde Authentication > Users
-- =====================================================
