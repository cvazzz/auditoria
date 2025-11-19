# 👤 Crear Usuario Auditor - Guía Paso a Paso

## 🚀 Opción 1: Crear desde Supabase Dashboard (RECOMENDADO)

### **Paso 1: Crear Usuario en Authentication**
1. Ve a tu proyecto en https://supabase.com
2. Click en **"Authentication"** en el menú lateral
3. Click en **"Users"**
4. Click en **"Add user"** o **"Invite"**
5. Completa:
   - **Email:** `auditor@test.com`
   - **Password:** `auditor123` (o cualquier contraseña)
6. Click en **"Create user"** o **"Send invitation"**

### **Paso 2: Copiar el UUID del Usuario**
1. En la lista de usuarios, busca `auditor@test.com`
2. Copia el **UUID** (algo como: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

### **Paso 3: Crear Perfil con Rol de Auditor**
1. Ve a **"SQL Editor"**
2. Click en **"New Query"**
3. Pega este código (reemplaza `UUID_AQUI` con el UUID que copiaste):

```sql
-- Crear perfil de auditor
INSERT INTO profiles (id, email, role, full_name, zone, created_at)
VALUES (
  'UUID_AQUI',           -- ⬅️ REEMPLAZAR con el UUID del usuario
  'auditor@test.com',
  'auditor',
  'Auditor Test',
  'Lima Centro',
  NOW()
)
ON CONFLICT (id) 
DO UPDATE SET 
  role = 'auditor',
  full_name = 'Auditor Test',
  zone = 'Lima Centro';
```

4. Click en **"Run"** (Ctrl+Enter)
5. Deberías ver: **"Success. 1 rows affected"**

---

## 🔍 Opción 2: SQL Directo (si ya tienes el usuario)

Si ya creaste el usuario pero no tiene el rol correcto:

```sql
-- Actualizar rol de usuario existente
UPDATE profiles 
SET 
  role = 'auditor',
  full_name = 'Auditor Test',
  zone = 'Lima Centro'
WHERE email = 'auditor@test.com';
```

---

## ✅ Verificar que Funciona

### **1. Verificar en Base de Datos:**
```sql
SELECT 
  id, 
  email, 
  role, 
  full_name, 
  zone,
  created_at
FROM profiles 
WHERE role = 'auditor';
```

Deberías ver:
```
id                                   | email              | role    | full_name    | zone
a1b2c3d4-e5f6-7890-abcd-ef1234567890 | auditor@test.com  | auditor | Auditor Test | Lima Centro
```

### **2. Probar Login:**
1. Ve a: http://localhost:3001/login
2. Ingresa:
   - Email: `auditor@test.com`
   - Password: `auditor123` (o la que usaste)
3. Click en **"Iniciar Sesión"**
4. Deberías ser redirigido a: http://localhost:3001/audit

---

## 🎯 Ejemplo Completo con UUID Real

Si tu UUID es: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`

```sql
-- Opción A: Insertar perfil nuevo
INSERT INTO profiles (id, email, role, full_name, zone, created_at)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'auditor@test.com',
  'auditor',
  'Auditor Test',
  'Lima Centro',
  NOW()
)
ON CONFLICT (id) 
DO UPDATE SET 
  role = 'auditor';

-- Opción B: Actualizar perfil existente
UPDATE profiles 
SET role = 'auditor'
WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
```

---

## 🛠️ Crear Múltiples Auditores

```sql
-- Auditor 1
INSERT INTO profiles (id, email, role, full_name, zone, created_at)
SELECT id, 'auditor1@test.com', 'auditor', 'María López', 'Lima Norte', NOW()
FROM auth.users WHERE email = 'auditor1@test.com';

-- Auditor 2
INSERT INTO profiles (id, email, role, full_name, zone, created_at)
SELECT id, 'auditor2@test.com', 'auditor', 'Juan Pérez', 'Lima Sur', NOW()
FROM auth.users WHERE email = 'auditor2@test.com';

-- Auditor 3 (Admin)
INSERT INTO profiles (id, email, role, full_name, zone, created_at)
SELECT id, 'admin@test.com', 'admin', 'Administrador', 'Central', NOW()
FROM auth.users WHERE email = 'admin@test.com';
```

---

## 🔑 Roles Disponibles

| Rol | Permisos | Acceso |
|-----|----------|--------|
| `supervisor` | Crear reembolsos | `/dashboard`, `/reimbursements/new` |
| `auditor` | Revisar y aprobar | `/audit` |
| `admin` | Acceso total | Todas las rutas |

---

## ⚠️ Solución de Problemas

### **Error: "No tienes permisos para acceder"**
- Verifica que el rol sea exactamente `'auditor'` (minúsculas)
- Verifica que el perfil exista en la tabla `profiles`

### **Error: "Invalid login credentials"**
- Verifica el email y password en Authentication → Users
- Prueba con "Reset password" si olvidaste la contraseña

### **Error: "profiles table does not exist"**
- Revisa que ejecutaste las migraciones de base de datos
- La tabla `profiles` debe existir con columnas: id, email, role, full_name, zone

---

## 📝 Resumen de Pasos Rápidos

1. ✅ **Supabase Dashboard** → Authentication → Users → **Add user**
2. ✅ Email: `auditor@test.com`, Password: `auditor123`
3. ✅ Copiar UUID del usuario creado
4. ✅ **SQL Editor** → Ejecutar INSERT INTO profiles con UUID
5. ✅ Verificar con SELECT * FROM profiles WHERE role = 'auditor'
6. ✅ Login en http://localhost:3001/login
7. ✅ Acceder a http://localhost:3001/audit

---

🎉 **¡Listo!** Ahora puedes ver el panel del auditor con todos los reembolsos, tipos de recibo, y advertencias de fraude.
