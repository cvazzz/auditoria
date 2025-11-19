-- ========================================
-- VERIFICAR DATOS ACTUALES
-- ========================================

-- Ver todos los perfiles
SELECT 
  id, 
  full_name, 
  email, 
  role, 
  zone,
  created_at 
FROM profiles 
ORDER BY created_at DESC;

-- Ver todos los reembolsos con nombres de supervisores
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

-- Contar reembolsos por supervisor
SELECT 
  p.full_name,
  p.email,
  p.role,
  COUNT(r.id) as total_reembolsos
FROM profiles p
LEFT JOIN reimbursements r ON p.id = r.profile_id
GROUP BY p.id, p.full_name, p.email, p.role
ORDER BY total_reembolsos DESC;

-- Ver reembolsos sin perfil asociado
SELECT 
  id,
  profile_id,
  type,
  reported_amount,
  status,
  created_at
FROM reimbursements
WHERE profile_id IS NULL
   OR profile_id NOT IN (SELECT id FROM profiles);
