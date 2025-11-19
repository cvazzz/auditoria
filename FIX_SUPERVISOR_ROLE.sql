-- Script para corregir el rol de usuario de 'auditor' a 'supervisor'
-- Ejecutar en Supabase SQL Editor

-- 1. Verificar el rol actual del usuario
SELECT id, email, role, full_name, zone
FROM profiles
WHERE email = 'test@hotmail.com';

-- 2. Actualizar el rol a 'supervisor'
UPDATE profiles
SET role = 'supervisor'
WHERE email = 'test@hotmail.com';

-- 3. Verificar que el cambio se aplicó correctamente
SELECT id, email, role, full_name, zone
FROM profiles
WHERE email = 'test@hotmail.com';

-- 4. (OPCIONAL) Si necesitas crear usuarios de prueba con diferentes roles:
/*
-- Para crear un auditor de prueba:
INSERT INTO profiles (id, email, role, full_name, dni, phone, zone)
VALUES (
  'uuid-generado-por-auth',
  'auditor@test.com',
  'auditor',
  'Auditor Test',
  '87654321',
  '987654321',
  'Lima Centro'
);

-- Para crear un admin de prueba:
INSERT INTO profiles (id, email, role, full_name, dni, phone, zone)
VALUES (
  'uuid-generado-por-auth',
  'admin@test.com',
  'admin',
  'Admin Test',
  '11111111',
  '999999999',
  'Lima Norte'
);
*/
