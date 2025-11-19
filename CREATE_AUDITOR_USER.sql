-- Script para crear usuario auditor en Supabase

-- 1. Primero crea el usuario en Authentication (hazlo desde Supabase Dashboard)
-- Dashboard → Authentication → Users → Invite User
-- Email: auditor@test.com
-- Password: auditor123 (o la que prefieras)

-- 2. Luego ejecuta este SQL para darle rol de auditor:

-- OPCIÓN A: Si ya tienes el UUID del usuario (después de crearlo en Auth)
-- Reemplaza 'USER_UUID_AQUI' con el UUID real del usuario
UPDATE profiles 
SET 
  role = 'auditor',
  full_name = 'Auditor Test',
  zone = 'Central'
WHERE id = 'USER_UUID_AQUI';

-- OPCIÓN B: Si conoces el email del usuario
-- (Necesitas el UUID primero, lo puedes ver en Authentication → Users)

-- 3. Verificar que el usuario tiene rol de auditor:
SELECT id, email, role, full_name, zone 
FROM profiles 
WHERE role = 'auditor';

-- NOTA: Si la tabla profiles no se creó automáticamente al registrar el usuario,
-- necesitas insertar manualmente:

-- Primero obtén el UUID del usuario desde Authentication → Users
-- Luego ejecuta:
INSERT INTO profiles (id, email, role, full_name, zone, created_at)
VALUES (
  'USER_UUID_AQUI',  -- UUID del usuario de auth.users
  'auditor@test.com',
  'auditor',
  'Auditor Test',
  'Central',
  NOW()
);

-- 4. ALTERNATIVA RÁPIDA: Crear usuario completo desde SQL
-- (Solo si tienes permisos de admin en Supabase)

-- Primero verifica si tienes la función de crear usuarios:
-- Si no, usa el Dashboard de Supabase para crear el usuario en Authentication

-- Luego crea su perfil:
INSERT INTO profiles (id, email, role, full_name, zone, created_at)
SELECT 
  id,
  'auditor@test.com',
  'auditor',
  'Auditor Test',
  'Central',
  NOW()
FROM auth.users
WHERE email = 'auditor@test.com';
