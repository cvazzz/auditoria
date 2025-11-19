-- ========================================
-- DIAGNÓSTICO COMPLETO
-- ========================================

-- 1. Verificar cuántos reembolsos se actualizaron
SELECT COUNT(*) as total_con_profile_id
FROM reimbursements
WHERE profile_id IS NOT NULL;

-- 2. Ver los últimos reembolsos y verificar que tienen profile_id
SELECT 
  r.id,
  r.profile_id,
  r.type,
  r.reported_amount,
  r.status,
  r.created_at,
  p.id as profile_real_id,
  p.full_name as nombre_perfil,
  p.email as email_perfil
FROM reimbursements r
LEFT JOIN profiles p ON r.profile_id = p.id
ORDER BY r.created_at DESC
LIMIT 10;

-- 3. Verificar el ID exacto de Juan
SELECT id, full_name, email, role 
FROM profiles 
WHERE role = 'supervisor';

-- 4. Ver si hay profile_id que no coinciden
SELECT DISTINCT r.profile_id, p.full_name
FROM reimbursements r
LEFT JOIN profiles p ON r.profile_id = p.id
ORDER BY r.profile_id;

-- 5. Forzar UPDATE de TODOS los reembolsos a Juan
-- (Ejecuta esto SOLO si los queries anteriores muestran que el profile_id está mal)
UPDATE reimbursements
SET profile_id = '0893b588-625c-4eb3-ae02-b95fa1c7d743'
WHERE TRUE;

-- 6. Verificar después del UPDATE forzado
SELECT 
  COUNT(*) as total_reembolsos,
  p.full_name,
  p.email
FROM reimbursements r
JOIN profiles p ON r.profile_id = p.id
GROUP BY p.full_name, p.email;
