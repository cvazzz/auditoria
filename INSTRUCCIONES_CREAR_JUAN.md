# 🔧 Solución: Crear Supervisor "Juan" en Supabase

## 🎯 Problema Identificado
En la imagen se ve: **"No hay supervisores registrados"**

Esto significa que:
- ✅ El campo `description` ya existe en la tabla (migración aplicada)
- ❌ No hay usuarios con rol `supervisor` en la base de datos
- ❌ Los reembolsos existentes no tienen `profile_id` válido

---

## 📋 Solución Paso a Paso

### **PASO 1: Abrir Supabase Dashboard**
1. Ve a: https://supabase.com/dashboard
2. Selecciona tu proyecto "Auditoria"
3. Click en **SQL Editor** (ícono de código en el menú izquierdo)

---

### **PASO 2: Verificar Datos Actuales**

Ejecuta este query para ver qué usuarios tienes:

```sql
-- Ver todos los usuarios y perfiles
SELECT 
  u.id,
  u.email,
  p.full_name,
  p.role,
  p.zone
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
ORDER BY u.created_at DESC;
```

**¿Qué deberías ver?**
- Si hay usuarios pero `full_name` es NULL → Necesitas actualizar el perfil
- Si no hay usuarios → Necesitas registrarte primero en la app

---

### **PASO 3A: Si YA tienes un usuario registrado**

Ejecuta esto para convertirlo en "Juan Pérez" (supervisor):

```sql
-- Actualizar el perfil del primer usuario
UPDATE profiles 
SET 
  full_name = 'Juan Pérez',
  role = 'supervisor',
  zone = 'Lima Centro',
  phone = '+51 999 888 777'
WHERE id = (
  SELECT id 
  FROM auth.users 
  ORDER BY created_at ASC 
  LIMIT 1
);

-- Verificar
SELECT * FROM profiles WHERE full_name = 'Juan Pérez';
```

---

### **PASO 3B: Si NO tienes usuarios**

1. Ve a tu app: http://localhost:3000/login
2. Click en "Sign Up" (Registrarse)
3. Crea una cuenta con:
   - Email: `juan@test.com`
   - Password: `Test123456!`
4. Después de crear la cuenta, vuelve a Supabase y ejecuta el query del PASO 3A

---

### **PASO 4: Crear Reembolsos de Prueba para Juan**

```sql
-- Insertar 3 reembolsos de ejemplo
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
  type_data.type,
  type_data.amount,
  type_data.date,
  type_data.desc,
  type_data.status,
  EXTRACT(WEEK FROM type_data.date)::integer,
  EXTRACT(MONTH FROM type_data.date)::integer,
  EXTRACT(YEAR FROM type_data.date)::integer
FROM profiles p
CROSS JOIN (
  VALUES 
    ('TRANSPORTE', 25.50, CURRENT_DATE, 'Taxi desde oficina central hasta reunión con cliente en San Isidro', 'PENDING_AUDIT'),
    ('TRANSPORTE', 18.00, CURRENT_DATE - 2, 'Transporte público para visita a almacén en Ate', 'APPROVED'),
    ('BOLETA', 45.80, CURRENT_DATE - 5, 'Almuerzo de negocios con proveedor', 'REJECTED')
) AS type_data(type, amount, date, desc, status)
WHERE p.full_name = 'Juan Pérez'
LIMIT 3;

-- Verificar
SELECT 
  r.type,
  r.reported_amount,
  r.status,
  r.description,
  p.full_name
FROM reimbursements r
JOIN profiles p ON r.profile_id = p.id
WHERE p.full_name = 'Juan Pérez';
```

---

### **PASO 5: Crear un Auditor (IMPORTANTE)**

Para poder ver el panel de auditor, necesitas un usuario con rol `auditor`:

```sql
-- Si tienes un segundo usuario, conviértelo en auditor
UPDATE profiles 
SET 
  full_name = 'María González',
  role = 'auditor',
  zone = 'Lima',
  phone = '+51 987 654 321'
WHERE id = (
  SELECT id 
  FROM auth.users 
  ORDER BY created_at DESC 
  LIMIT 1 OFFSET 1
);
```

**O si solo tienes 1 usuario:**

1. Registra otro usuario en la app: `auditor@test.com`
2. Ejecuta el query de arriba

---

### **PASO 6: Verificar en la App**

1. **Cierra sesión** en http://localhost:3000
2. Inicia sesión con el usuario **auditor** (`auditor@test.com`)
3. Ve al panel de auditoría
4. Ahora deberías ver:
   - ✅ **Supervisores: Juan Pérez** en el filtro
   - ✅ **3 reembolsos** de Juan en la lista
   - ✅ **Nombres y descripciones** visibles

---

## 🐛 Troubleshooting

### Problema: "No aparece Juan en el filtro"
**Solución:** Abre la consola del navegador (F12) y busca:
```
Supervisor Directory: [...]
Supervisor Map: {...}
```
Si está vacío, refresca la página (Ctrl+R)

### Problema: "Los reembolsos no tienen nombre"
**Solución:** Verifica que `profile_id` coincida con un ID válido:
```sql
SELECT r.id, r.profile_id, p.full_name
FROM reimbursements r
LEFT JOIN profiles p ON r.profile_id = p.id
WHERE p.full_name IS NULL;
```

### Problema: "No puedo acceder al panel de auditor"
**Solución:** Verifica tu rol:
```sql
SELECT email, role FROM profiles WHERE email = 'tu-email-aqui';
```
Si no es `auditor`, actualiza:
```sql
UPDATE profiles SET role = 'auditor' WHERE email = 'tu-email-aqui';
```

---

## 📊 Resultado Esperado

Después de seguir estos pasos, deberías ver:

- **Panel de Auditor:**
  - 📊 Total: 3 reembolsos
  - ⏳ Pendientes: 1
  - ✅ Aprobados: 1
  - ❌ Rechazados: 1

- **Filtro de Supervisores:**
  - Todos (1)
  - Juan Pérez

- **Tarjetas de Reembolsos:**
  - Nombre: Juan Pérez
  - Email: juan@test.com
  - Zona: Lima Centro
  - Descripción visible en cada reembolso

---

## 🚀 Archivos SQL Creados

1. **VERIFICAR_DATOS.sql** - Para diagnosticar problemas
2. **CREAR_SUPERVISOR_JUAN.sql** - Script completo con todas las opciones

Ejecuta estos archivos en **Supabase SQL Editor**.

---

✅ **Una vez completado, recarga la página y deberías ver a Juan y sus reembolsos.**
