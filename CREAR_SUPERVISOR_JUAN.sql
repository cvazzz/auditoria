-- ========================================
-- CREAR SUPERVISOR "JUAN" PARA PRUEBAS
-- ========================================

-- NOTA: Este script asume que ya tienes un usuario registrado.
-- Si no tienes usuarios, regístrate primero en la app (Sign Up).

-- ========================================
-- OPCIÓN 1: Actualizar perfil existente
-- ========================================
-- Si ya tienes un usuario creado pero no aparece como supervisor:

-- Ver usuarios actuales
SELECT id, email, created_at FROM auth.users;

-- Actualizar el primer usuario para que sea supervisor llamado "Juan"
-- REEMPLAZA 'tu-user-id-aqui' con el ID real de auth.users
UPDATE profiles 
SET 
  full_name = 'Juan Pérez',
  role = 'supervisor',
  zone = 'Lima Centro',
  phone = '+51 999 888 777'
WHERE id = (SELECT id FROM auth.users ORDER BY created_at DESC LIMIT 1);

-- ========================================
-- OPCIÓN 2: Insertar manualmente (solo si tienes el UUID)
-- ========================================
-- Si conoces el UUID del usuario de auth.users:

/*
INSERT INTO profiles (id, full_name, email, zone, role, phone)
VALUES (
  'UUID-DEL-USUARIO-DE-AUTH-USERS', -- Reemplazar con UUID real
  'Juan Pérez',
  'juan@auditoria.com',
  'Lima Centro',
  'supervisor',
  '+51 999 888 777'
)
ON CONFLICT (id) 
DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  zone = EXCLUDED.zone,
  phone = EXCLUDED.phone;
*/

-- ========================================
-- CREAR AUDITOR (si no tienes uno)
-- ========================================

-- Crear auditor con el segundo usuario
UPDATE profiles 
SET 
  full_name = 'María González',
  role = 'auditor',
  zone = 'Lima',
  phone = '+51 987 654 321'
WHERE id = (SELECT id FROM auth.users ORDER BY created_at DESC LIMIT 1 OFFSET 1);

-- ========================================
-- VERIFICAR RESULTADOS
-- ========================================

SELECT 
  id,
  full_name,
  email,
  role,
  zone,
  phone
FROM profiles
ORDER BY role, full_name;

-- ========================================
-- CREAR REEMBOLSOS DE PRUEBA PARA JUAN
-- ========================================

-- Insertar 3 reembolsos de prueba para el supervisor Juan
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
WHERE p.full_name = 'Juan Pérez' AND p.role = 'supervisor'
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
WHERE p.full_name = 'Juan Pérez' AND p.role = 'supervisor'
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
  'BOLETA',
  45.80,
  CURRENT_DATE - INTERVAL '5 days',
  'Almuerzo de negocios con proveedor en restaurante La Rosa Náutica',
  'REJECTED',
  45.80,
  'NO_COINCIDE',
  0.88,
  EXTRACT(WEEK FROM CURRENT_DATE - INTERVAL '5 days')::integer,
  EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '5 days')::integer,
  EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '5 days')::integer
FROM profiles p
WHERE p.full_name = 'Juan Pérez' AND p.role = 'supervisor'
LIMIT 1;

-- Verificar reembolsos creados
SELECT 
  r.id,
  r.type,
  r.reported_amount,
  r.status,
  r.description,
  r.created_at,
  p.full_name as supervisor_name
FROM reimbursements r
JOIN profiles p ON r.profile_id = p.id
WHERE p.full_name = 'Juan Pérez'
ORDER BY r.created_at DESC;
