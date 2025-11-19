# 🔐 Matriz de Permisos y Roles

## 📋 Roles Disponibles

El sistema cuenta con **3 roles principales**:

| Rol | Descripción | Acceso Principal |
|-----|-------------|------------------|
| **supervisor** | Usuario que crea y gestiona reembolsos | Dashboard, Crear Reembolsos |
| **auditor** | Revisa y aprueba/rechaza reembolsos | Panel de Auditoría |
| **admin** | Acceso completo al sistema | Todas las funcionalidades |

---

## 🚪 Acceso a Páginas por Rol

### 1. `/` (Home/Landing)
- ✅ **Todos** pueden acceder
- Si **NO autenticado**: Muestra landing page con botón "Iniciar Sesión"
- Si **autenticado**: Muestra botones según rol:
  - **Supervisor**: "Mis Reembolsos", "Nuevo Reembolso"
  - **Auditor**: "Mis Reembolsos", "Auditoría"
  - **Admin**: Los 3 botones

### 2. `/login`
- ✅ **Todos** pueden acceder
- **Redirige automáticamente tras login:**
  - **Auditor** → `/audit`
  - **Supervisor** → `/dashboard?view=supervisor`
  - **Admin** → `/dashboard`

### 3. `/dashboard`
- ✅ **Supervisor**: Puede ver SUS propios reembolsos
- ✅ **Admin**: Puede ver TODOS los reembolsos
- ❌ **Auditor**: Redirigido a `/audit` automáticamente

### 4. `/audit`
- ✅ **Auditor**: Acceso completo
- ✅ **Admin**: Acceso completo
- ❌ **Supervisor**: Redirigido a `/dashboard` con mensaje de error

### 5. `/reimbursements/new`
- ✅ **Supervisor**: Puede crear reembolsos
- ✅ **Admin**: Puede crear reembolsos
- ❌ **Auditor**: Bloqueado por API (403)

### 6. `/reimbursements/[id]`
- ✅ **Todos los autenticados** pueden ver detalles
- **Restricción**: Supervisores solo ven sus propios reembolsos (RLS)

---

## 🔒 Validaciones de Seguridad

### Frontend (React/Next.js)

#### `pages/audit.js`
```javascript
// Verifica rol antes de mostrar página
if (!profileData || !['auditor', 'admin'].includes(profileData.role)) {
  alert('No tienes permisos...');
  router.push('/dashboard'); // ✅ Redirige a dashboard
  return;
}
```

#### `pages/dashboard.js`
```javascript
// Redirige auditores al panel correcto
if (normalizedRole === 'auditor') {
  showNotification({
    type: 'warning',
    title: 'Panel de auditoría',
    message: 'Los auditores deben continuar en el panel especializado.'
  });
  router.push('/audit'); // ✅ Redirige a audit
  return;
}
```

#### `pages/index.js`
```javascript
// Muestra botones según rol
{profile?.role !== 'auditor' && (
  <button onClick={() => router.push('/reimbursements/new')}>
    Nuevo Reembolso
  </button>
)}

{(profile?.role === 'auditor' || profile?.role === 'admin') && (
  <button onClick={() => router.push('/audit')}>
    Auditoría
  </button>
)}
```

### Backend (API Routes)

#### `api/reimbursements/create.js`
```javascript
// Bloquea auditores de crear reembolsos
if (normalizedRole === 'auditor') {
  return res.status(403).json({ 
    error: 'Acceso denegado: los auditores no pueden crear reembolsos' 
  });
}
```

#### `api/audit/[id]/decision.js`
```javascript
// Solo auditores/admin pueden auditar
if (!profile || !['auditor', 'admin'].includes(profile.role)) {
  return res.status(403).json({ 
    error: 'No tiene permisos para auditar' 
  });
}
```

### Base de Datos (Row Level Security - RLS)

#### Tabla `reimbursements`
```sql
-- Los supervisores solo ven SUS reembolsos
CREATE POLICY "users_can_view_own" ON reimbursements
FOR SELECT
USING (profile_id = auth.uid());

-- Auditores/Admin ven TODOS los reembolsos
CREATE POLICY "auditor_can_view_all" ON reimbursements
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('auditor', 'admin')
  )
);

-- Solo auditores/admin pueden actualizar
CREATE POLICY "auditor_can_update_all" ON reimbursements
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('auditor', 'admin')
  )
);
```

---

## 🎯 Flujos de Usuario por Rol

### 👤 Supervisor
1. **Login** → Redirige a `/dashboard?view=supervisor`
2. **Dashboard**: Ve solo SUS reembolsos
3. **Puede crear**: Nuevos reembolsos vía `/reimbursements/new`
4. **NO puede**: Acceder a `/audit` (redirigido)
5. **NO puede**: Ver reembolsos de otros usuarios (RLS)

### 🔍 Auditor
1. **Login** → Redirige a `/audit`
2. **Panel de Auditoría**: Ve TODOS los reembolsos pendientes
3. **Puede**: Aprobar/Rechazar reembolsos
4. **NO puede**: Crear reembolsos (bloqueado por API)
5. **NO puede**: Acceder a `/dashboard` (redirigido a `/audit`)

### 👑 Admin
1. **Login** → Redirige a `/dashboard`
2. **Dashboard**: Ve TODOS los reembolsos
3. **Puede**: Crear reembolsos
4. **Puede**: Acceder a `/audit` para auditar
5. **Acceso completo** a todas las funcionalidades

---

## 🧪 Casos de Prueba

### ✅ Test 1: Supervisor intenta acceder a `/audit`
```
GIVEN: Usuario con rol "supervisor" autenticado
WHEN: Navega a /audit
THEN: 
  - Muestra alert "No tienes permisos..."
  - Redirige a /dashboard
  - NO puede realizar acciones de auditoría
```

### ✅ Test 2: Auditor intenta acceder a `/dashboard`
```
GIVEN: Usuario con rol "auditor" autenticado
WHEN: Navega a /dashboard
THEN: 
  - Muestra notificación warning
  - Redirige a /audit
  - NO puede ver reembolsos en dashboard
```

### ✅ Test 3: Auditor intenta crear reembolso
```
GIVEN: Usuario con rol "auditor" autenticado
WHEN: POST a /api/reimbursements/create
THEN: 
  - Respuesta 403 Forbidden
  - Error: "los auditores no pueden crear reembolsos"
```

### ✅ Test 4: Supervisor intenta aprobar reembolso
```
GIVEN: Usuario con rol "supervisor" autenticado
WHEN: POST a /api/audit/[id]/decision
THEN: 
  - Respuesta 403 Forbidden
  - Error: "No tiene permisos para auditar"
```

---

## 📊 Resumen Visual

```
┌──────────────────┬──────────┬─────────┬───────┐
│   Acción         │Supervisor│ Auditor │ Admin │
├──────────────────┼──────────┼─────────┼───────┤
│ Ver propios      │    ✅    │   N/A   │  ✅   │
│ Ver todos        │    ❌    │   ✅    │  ✅   │
│ Crear            │    ✅    │   ❌    │  ✅   │
│ Auditar          │    ❌    │   ✅    │  ✅   │
│ /dashboard       │    ✅    │   ❌    │  ✅   │
│ /audit           │    ❌    │   ✅    │  ✅   │
│ Top Colaborador. │    ❌    │   ✅    │  ✅   │
└──────────────────┴──────────┴─────────┴───────┘
```

### 🆕 Características Exclusivas por Rol

#### 👨‍💼 Supervisor
- Dashboard simplificado con:
  - 📊 Estadísticas de sus reembolsos
  - 📈 Tendencias mensuales
  - 🎯 Distribución por tipo

#### 🔍 Auditor
- Dashboard completo con:
  - 📊 Estadísticas globales
  - 📈 Tendencias mensuales
  - 🎯 Distribución por tipo
  - 👥 Top Supervisores por monto
  - ⭐ **Top Colaboradores con tasa de aprobación** (EXCLUSIVO)

#### 👑 Admin
- Acceso a todos los paneles y características

---

## 🚨 Problemas Corregidos

### ❌ ANTES (Problemas)
1. Supervisores podían acceder a `/audit` y realizar acciones de auditoría
2. Redirigía a `/` en vez de `/dashboard` cuando negaba acceso
3. Todos veían el botón "Auditoría" en la página principal
4. No se validaba rol al mostrar botón "Nuevo Reembolso"

### ✅ AHORA (Corregido)
1. ✅ Supervisores son redirigidos a `/dashboard` desde `/audit`
2. ✅ Redirige correctamente a `/dashboard` en caso de acceso denegado
3. ✅ Solo auditores/admin ven botón "Auditoría" en home
4. ✅ Solo supervisores/admin ven botón "Nuevo Reembolso"

---

## 📝 Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| `pages/audit.js` | Redirige a `/dashboard` en vez de `/` cuando rol no válido |
| `pages/index.js` | Obtiene `profile` y valida rol antes de mostrar botones |
| `pages/dashboard.js` | Ya estaba correcto (redirige auditores a `/audit`) ✅ |
| `pages/login.js` | Ya estaba correcto (redirige según rol) ✅ |

---

## 🔧 Mantenimiento

Para **agregar un nuevo rol** en el futuro:

1. **Base de datos**: Agregar en enum `user_role` (supabase/migrations)
2. **Frontend**: Actualizar validaciones en `pages/audit.js` y `pages/dashboard.js`
3. **API**: Actualizar checks en `api/audit/[id]/decision.js` y `api/reimbursements/create.js`
4. **RLS**: Crear nuevas policies en Supabase si es necesario

---

✅ **Sistema de permisos completamente implementado y documentado**
