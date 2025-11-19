-- Script para configurar políticas RLS para que el auditor pueda ver todos los reembolsos
-- Ejecuta esto en Supabase Dashboard → SQL Editor

-- 1. Verificar si RLS está habilitado en la tabla reimbursements
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'reimbursements';

-- 2. Ver las políticas actuales
SELECT * FROM pg_policies WHERE tablename = 'reimbursements';

-- 3. Deshabilitar RLS temporalmente para probar (SOLO PARA DESARROLLO)
ALTER TABLE reimbursements DISABLE ROW LEVEL SECURITY;

-- 4. O crear políticas que permitan al auditor ver todo
-- Primero eliminar políticas existentes si las hay
DROP POLICY IF EXISTS "auditor_can_view_all" ON reimbursements;
DROP POLICY IF EXISTS "users_can_view_own" ON reimbursements;

-- Habilitar RLS
ALTER TABLE reimbursements ENABLE ROW LEVEL SECURITY;

-- Política: Los auditores pueden ver todos los reembolsos
CREATE POLICY "auditor_can_view_all" ON reimbursements
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('auditor', 'admin')
  )
);

-- Política: Los usuarios normales solo ven sus propios reembolsos
CREATE POLICY "users_can_view_own" ON reimbursements
FOR SELECT
USING (profile_id = auth.uid());

-- Política: Todos pueden insertar (crear reembolsos)
CREATE POLICY "users_can_insert" ON reimbursements
FOR INSERT
WITH CHECK (profile_id = auth.uid());

-- Política: Los auditores pueden actualizar cualquier reembolso
CREATE POLICY "auditor_can_update_all" ON reimbursements
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('auditor', 'admin')
  )
);

-- 5. Verificar las políticas creadas
SELECT * FROM pg_policies WHERE tablename = 'reimbursements';
