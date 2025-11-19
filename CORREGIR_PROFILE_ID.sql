-- ========================================
-- CORREGIR PROFILE_ID EN REEMBOLSOS
-- ========================================

-- PASO 1: Ver el problema actual
SELECT 
  r.id,
  r.profile_id,
  r.type,
  r.reported_amount,
  r.status,
  r.created_at,
  p.full_name as nombre_actual
FROM reimbursements r
LEFT JOIN profiles p ON r.profile_id = p.id
ORDER BY r.created_at DESC
LIMIT 10;

-- PASO 2: Ver el ID de Juan
SELECT id, full_name, email, role 
FROM profiles 
WHERE role = 'supervisor';

-- PASO 3: ACTUALIZAR SOLO los reembolsos huérfanos (sin profile_id válido)
-- Esto NO afectará reembolsos futuros, solo corrige los existentes que están mal
UPDATE reimbursements
SET profile_id = (
  SELECT id 
  FROM profiles 
  WHERE full_name = 'Nombre Juan' 
  AND role = 'supervisor'
  LIMIT 1
)
WHERE profile_id IS NULL 
   OR profile_id NOT IN (SELECT id FROM profiles);

-- ⚠️ IMPORTANTE: Este UPDATE solo afecta reembolsos QUE YA EXISTEN y no tienen profile_id válido.
-- Los nuevos reembolsos creados desde la app se asignarán automáticamente al usuario que los cree.

-- PASO 4: Si quieres asignar TODOS los reembolsos a Juan (incluso los que tienen otro profile_id)
-- Descomenta esta línea:
/*
UPDATE reimbursements
SET profile_id = (
  SELECT id 
  FROM profiles 
  WHERE full_name = 'Nombre Juan' 
  AND role = 'supervisor'
  LIMIT 1
);
*/

-- PASO 5: Verificar que se corrigió
SELECT 
  r.id,
  r.type,
  r.reported_amount,
  r.status,
  r.description,
  r.created_at,
  p.full_name as supervisor_name,
  p.email as supervisor_email,
  p.zone as supervisor_zone
FROM reimbursements r
LEFT JOIN profiles p ON r.profile_id = p.id
ORDER BY r.created_at DESC
LIMIT 20;

-- PASO 6: Contar cuántos reembolsos tiene ahora Juan
SELECT 
  p.full_name,
  p.email,
  COUNT(r.id) as total_reembolsos
FROM profiles p
LEFT JOIN reimbursements r ON p.id = r.profile_id
WHERE p.full_name = 'Nombre Juan'
GROUP BY p.id, p.full_name, p.email;
