# Sistema de Auditoría de Reembolsos con IA

Sistema completo de auditoría automatizada de reembolsos que utiliza múltiples tecnologías de OCR (Tesseract, Hugging Face Donut/LayoutLM, y Gemini Pro Vision) para validar automáticamente las solicitudes de reembolso de empleados.

## 🏗️ Arquitectura

```
┌─────────────┐
│  Frontend   │  Next.js + React (Vercel)
│  (Vercel)   │
└──────┬──────┘
       │
┌──────▼──────────────────────────────┐
│  Supabase                            │
│  - Auth (Autenticación)              │
│  - Postgres (Base de datos)          │
│  - Storage (Archivos)                │
│  - Edge Functions (opcional)         │
└──────┬──────────────────────────────┘
       │
┌──────▼──────┐
│   Agent     │  Node.js Worker
│  (Worker)   │  - Tesseract.js OCR
│             │  - Hugging Face API
│             │  - Gemini Pro Vision
└─────────────┘
```

## 📋 Características

- ✅ **OCR Multi-nivel**: Tesseract → Hugging Face → Gemini Vision
- ✅ **Detección automática de montos** con tolerancia del 3%
- ✅ **Clasificación inteligente**: COINCIDE / DUDOSO / NO_COINCIDE
- ✅ **Notificaciones por email** (Resend/SendGrid)
- ✅ **Dashboard de auditoría** para aprobación manual
- ✅ **Reportes y estadísticas** por zona/tipo/período
- ✅ **Row Level Security (RLS)** en Supabase
- ✅ **Límites de uso** de APIs para control de costos

## 🚀 Setup del Proyecto

### 1. Prerequisitos

- Node.js 18+ instalado
- Cuenta de Supabase (gratis)
- API Keys:
  - Hugging Face (gratis): https://huggingface.co/settings/tokens
  - Google Gemini (gratis con límites): https://makersuite.google.com/app/apikey
  - Resend (gratis 100 emails/día): https://resend.com

### 2. Configurar Supabase

1. Crear proyecto en https://supabase.com
2. En SQL Editor, ejecutar los migrations:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rls_policies.sql`
3. En Storage, crear bucket `reimbursements` (privado)
4. Copiar URL y API Keys de Settings

### 3. Instalar Dependencias

#### Frontend
```powershell
cd frontend
npm install
```

#### Agent
```powershell
cd agent
npm install
```

### 4. Configurar Variables de Entorno

#### Frontend (.env.local)
```bash
cp .env.example .env.local
# Editar con tus valores reales
```

#### Agent (.env)
```bash
cp .env.example .env
# Editar con tus valores reales
```

### 5. Ejecutar el Sistema

#### Frontend (Terminal 1)
```powershell
cd frontend
npm run dev
```
Abre http://localhost:3000

#### Agent (Terminal 2)
```powershell
cd agent
npm start
```

## 📊 Flujo de Procesamiento

```
1. Empleado sube evidencia (imagen trayecto, screenshot, PDF boleta)
   ↓
2. Se crea registro en DB con status = "PENDING_OCR"
   ↓
3. Agent procesa:
   a) Tesseract OCR (gratis, rápido)
      - Si confianza ≥ 85% → Comparar y decidir → FIN
   b) Si falla → Hugging Face Donut/LayoutLM
      - Si confianza ≥ 90% → Comparar y decidir → FIN
   c) Si falla O necesita comparación visual → Gemini Vision
      - Extrae + compara + decide → FIN
   d) Fallback → Marca DUDOSO
   ↓
4. Resultado: COINCIDE / DUDOSO / NO_COINCIDE
   ↓
5. Status → "PENDING_AUDIT"
   ↓
6. Auditor recibe email y revisa
   ↓
7. Auditor aprueba/rechaza
   ↓
8. Empleado recibe notificación
```

## 🔧 Umbrales y Configuración

Los siguientes valores están definidos en `agent/config.js` y `.env`:

| Variable | Valor Default | Descripción |
|----------|---------------|-------------|
| `TESSERACT_CONF_THRESHOLD` | 0.85 | Confianza mínima de Tesseract |
| `HF_CONF_THRESHOLD` | 0.90 | Confianza mínima de Hugging Face |
| `GEMINI_CONF_THRESHOLD` | 0.80 | Confianza mínima de Gemini |
| `MONEY_MATCH_TOLERANCE` | 0.03 | Tolerancia 3% para comparar montos |
| `MAX_GEMINI_CALLS_PER_DAY` | 100 | Límite diario de llamadas a Gemini |

## 🗄️ Estructura de la Base de Datos

### Tabla `profiles`
```sql
- id: uuid (PK)
- full_name: text
- dni: text
- phone: text
- email: text (unique)
- zone: text
- role: text (supervisor | auditor | admin)
- created_at: timestamptz
```

### Tabla `reimbursements`
```sql
- id: uuid (PK)
- profile_id: uuid (FK)
- type: text (taxi, transporte, otros)
- reported_amount: numeric(12,2)
- detected_amount: numeric(12,2)
- detected_currency: text
- gasto_date: date
- week, month, year: integer
- transport_image_url: text
- cost_screenshot_url: text
- receipt_url: text
- ai_result: text (COINCIDE | DUDOSO | NO_COINCIDE)
- ai_confidence: numeric(5,4)
- status: text (PENDING_OCR, PENDING_AUDIT, APPROVED, REJECTED)
- auditor_comment: text
- created_at: timestamptz
- audited_at: timestamptz
```

### Tabla `audit_logs`
```sql
- id: uuid (PK)
- reimbursement_id: uuid (FK)
- actor: text
- action: text
- detail: jsonb
- created_at: timestamptz
```

## 🔒 Seguridad (RLS Policies)

- Usuarios solo ven sus propios reembolsos
- Auditores/admins ven todos los reembolsos
- Solo auditores/admins pueden cambiar status a APPROVED/REJECTED
- Archivos en Storage con URLs firmadas (1 hora de expiración)

## 📡 API Routes

### POST `/api/reimbursements/create`
Crea nuevo reembolso
```json
{
  "type": "taxi",
  "reported_amount": 25.50,
  "gasto_date": "2025-11-12",
  "transport_image_url": "...",
  "cost_screenshot_url": "...",
  "receipt_url": "..."
}
```

### GET `/api/reimbursements/:id`
Obtiene reembolso por ID (incluye URLs firmadas)

### POST `/api/agent/process/:id`
Re-procesa un reembolso (solo admin/auditor)

### POST `/api/audit/:id/decision`
Aprueba o rechaza reembolso
```json
{
  "status": "APPROVED", // o "REJECTED"
  "comment": "Comentario opcional"
}
```

### GET `/api/reports?from=...&to=...&zone=...`
Obtiene reportes con estadísticas

## 🎯 Casos de Uso

### Caso 1: Reembolso Limpio
- Imagen clara con monto visible
- Tesseract detecta con 90% confianza
- Monto coincide → **COINCIDE**
- Pasa a auditor para aprobación final

### Caso 2: Imagen Borrosa
- Tesseract falla (60% confianza)
- Hugging Face procesa PDF y extrae monto
- Monto coincide → **COINCIDE**
- Pasa a auditor

### Caso 3: Inconsistencia
- Tesseract detecta S/ 50.00
- Empleado reportó S/ 10.00
- Diferencia > 3% → **NO_COINCIDE**
- Email urgente a auditor

### Caso 4: Taxi con Verificación Visual
- Tipo = "taxi"
- Hay foto del viaje
- Gemini compara imagen vs screenshot
- Verifica coincidencia visual + monto
- Decide → **COINCIDE** o **DUDOSO**

## 📈 Optimización de Costos

1. **Tesseract primero**: Gratis e instantáneo
2. **Hugging Face segundo**: Free tier generoso
3. **Gemini último**: Solo cuando es necesario
4. **Límite diario**: 100 llamadas/día (configurable)
5. **Contador resetea** a medianoche automáticamente

## 🚢 Deploy

### Frontend (Vercel)
```powershell
cd frontend
vercel
```

### Agent (Railway / Render)
1. Push a GitHub
2. Conectar repo en Railway/Render
3. Configurar variables de entorno
4. Deploy automático

## 🧪 Testing

### Test Manual
1. Crear usuario de prueba en Supabase
2. Subir reembolso con imagen clara
3. Verificar que Agent procesa correctamente
4. Revisar logs en `audit_logs`

### Test de Límites
```powershell
cd agent
# Modificar MAX_GEMINI_CALLS_PER_DAY=5
npm start
# Subir 10 reembolsos y verificar que solo 5 usan Gemini
```

## 📞 Soporte

Para dudas o problemas:
1. Revisar logs del Agent
2. Verificar tabla `audit_logs` en Supabase
3. Comprobar variables de entorno

## 📝 Licencia

Este proyecto es de uso interno para auditoría de reembolsos.

---

**Desarrollado con**: Next.js, Supabase, Tesseract.js, Hugging Face, Google Gemini, Resend
