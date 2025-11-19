-- ========================================
-- VERIFICAR Y CORREGIR RLS (Row Level Security)
-- ========================================

-- 1. Ver las políticas actuales de profiles
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles';

-- 2. DESHABILITAR RLS temporalmente para testing (CUIDADO: solo para desarrollo)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 3. O crear política que permita SELECT a todos los usuarios autenticados
DROP POLICY IF EXISTS "Usuarios pueden ver perfiles" ON profiles;

CREATE POLICY "Usuarios pueden ver perfiles"
ON profiles
FOR SELECT
TO authenticated
USING (true);

-- 4. Política para que usuarios puedan ver su propio perfil
DROP POLICY IF EXISTS "Usuarios pueden ver su perfil" ON profiles;

CREATE POLICY "Usuarios pueden ver su perfil"
ON profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- 5. Política para que usuarios puedan actualizar su propio perfil
DROP POLICY IF EXISTS "Usuarios pueden actualizar su perfil" ON profiles;

CREATE POLICY "Usuarios pueden actualizar su perfil"
ON profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- 6. HABILITAR RLS de nuevo (después de crear las políticas)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 7. Verificar políticas después de crearlas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles';
