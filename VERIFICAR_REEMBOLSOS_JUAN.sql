-- Ver cuántos reembolsos tiene Juan
SELECT 
  p.full_name,
  p.email,
  COUNT(r.id) as total_reembolsos
FROM profiles p
LEFT JOIN reimbursements r ON p.id = r.profile_id
WHERE p.full_name = 'Nombre Juan'
GROUP BY p.id, p.full_name, p.email;

-- Ver TODOS los reembolsos con detalles del supervisor
SELECT 
  r.id,
  r.type,
  r.reported_amount,
  r.status,
  r.description,
  r.created_at,
  p.full_name as supervisor_name,
  p.email as supervisor_email,
  p.zone as supervisor_zone,
  p.role as supervisor_role
FROM reimbursements r
LEFT JOIN profiles p ON r.profile_id = p.id
ORDER BY r.created_at DESC;

-- Si Juan NO tiene reembolsos, crear algunos de prueba
INSERT INTO reimbursements (
  profile_id,
  type,
  reported_amount,
  gasto_date,
  description,
  status,
  week,
  month,
  year
)
SELECT 
  p.id,
  'TRANSPORTE',
  25.50,
  CURRENT_DATE,
  'Taxi desde oficina central hasta reunión con cliente en San Isidro, Av. Camino Real 456',
  'PENDING_AUDIT',
  EXTRACT(WEEK FROM CURRENT_DATE)::integer,
  EXTRACT(MONTH FROM CURRENT_DATE)::integer,
  EXTRACT(YEAR FROM CURRENT_DATE)::integer
FROM profiles p
WHERE p.full_name = 'Nombre Juan' AND p.role = 'supervisor'
LIMIT 1;

INSERT INTO reimbursements (
  profile_id,
  type,
  reported_amount,
  gasto_date,
  description,
  status,
  detected_amount,
  ai_result,
  ai_confidence,
  week,
  month,
  year
)
SELECT 
  p.id,
  'TRANSPORTE',
  18.00,
  CURRENT_DATE - INTERVAL '2 days',
  'Transporte público para visita a almacén en Ate, ruta ida y vuelta',
  'APPROVED',
  18.00,
  'COINCIDE',
  0.95,
  EXTRACT(WEEK FROM CURRENT_DATE - INTERVAL '2 days')::integer,
  EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '2 days')::integer,
  EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '2 days')::integer
FROM profiles p
WHERE p.full_name = 'Nombre Juan' AND p.role = 'supervisor'
LIMIT 1;

INSERT INTO reimbursements (
  profile_id,
  type,
  reported_amount,
  gasto_date,
  description,
  status,
  detected_amount,
  ai_result,
  ai_confidence,
  auditor_comment,
  audited_at,
  week,
  month,
  year
)
SELECT 
  p.id,
  'BOLETA',
  45.80,
  CURRENT_DATE - INTERVAL '5 days',
  'Almuerzo de negocios con proveedor en restaurante La Rosa Náutica',
  'REJECTED',
  45.80,
  'NO_COINCIDE',
  0.88,
  'Factura no válida - sin RUC',
  CURRENT_TIMESTAMP,
  EXTRACT(WEEK FROM CURRENT_DATE - INTERVAL '5 days')::integer,
  EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '5 days')::integer,
  EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '5 days')::integer
FROM profiles p
WHERE p.full_name = 'Nombre Juan' AND p.role = 'supervisor'
LIMIT 1;

-- Verificar reembolsos creados
SELECT 
  r.id,
  r.type,
  r.reported_amount,
  r.status,
  r.description,
  r.created_at,
  p.full_name as supervisor_name,
  p.email as supervisor_email
FROM reimbursements r
JOIN profiles p ON r.profile_id = p.id
WHERE p.full_name = 'Nombre Juan'
ORDER BY r.created_at DESC;
