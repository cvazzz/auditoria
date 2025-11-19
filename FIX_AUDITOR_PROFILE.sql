-- Script para crear el perfil del auditor
-- Ejecuta esto en Supabase Dashboard → SQL Editor

-- Paso 1: Ver todos los usuarios en auth.users para obtener el UUID del auditor
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'auditor@test.com';

-- Paso 2: Crear el perfil del auditor (ajusta el UUID según el resultado del paso 1)
-- IMPORTANTE: Reemplaza 'UUID_DEL_AUDITOR_AQUI' con el UUID real que obtuviste arriba

INSERT INTO profiles (id, email, role, full_name, zone, created_at)
SELECT 
  id,
  'auditor@test.com',
  'auditor',
  'Auditor Principal',
  'Lima Centro',
  NOW()
FROM auth.users
WHERE email = 'auditor@test.com'
ON CONFLICT (id) DO UPDATE
SET 
  role = 'auditor',
  full_name = 'Auditor Principal',
  zone = 'Lima Centro';

-- Paso 3: Verificar que se creó correctamente
SELECT * FROM profiles WHERE email = 'auditor@test.com';

-- Deberías ver:
-- id: (el UUID del usuario)
-- email: auditor@test.com
-- role: auditor
-- full_name: Auditor Principal
-- zone: Lima Centro
