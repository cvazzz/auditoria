# Guía de Implementación - Sistema de Auditoría de Reembolsos

## Cronograma de Implementación (13 pasos)

### ✅ Fase 1: Setup Inicial (Día 1)

#### 1. Crear proyecto en Supabase
- [ ] Ir a https://supabase.com y crear cuenta
- [ ] Crear nuevo proyecto
- [ ] Anotar: URL del proyecto, anon key, service role key
- [ ] Ir a SQL Editor

#### 2. Ejecutar SQL para crear tablas
- [ ] Copiar contenido de `supabase/migrations/001_initial_schema.sql`
- [ ] Pegar en SQL Editor y ejecutar
- [ ] Copiar contenido de `supabase/migrations/002_rls_policies.sql`
- [ ] Pegar en SQL Editor y ejecutar
- [ ] Verificar que las tablas existan en Table Editor

#### 3. Configurar Storage
- [ ] Ir a Storage en Supabase
- [ ] Crear bucket llamado `reimbursements`
- [ ] Configurar como **privado** (Private)
- [ ] En Policies, permitir INSERT para usuarios autenticados
- [ ] En Policies, permitir SELECT solo para owner o auditor/admin

---

### ✅ Fase 2: Frontend Básico (Día 2)

#### 4. Instalar y configurar Next.js
```powershell
cd frontend
npm install
```

- [ ] Copiar `frontend/.env.example` a `frontend/.env.local`
- [ ] Completar variables:
```
NEXT_PUBLIC_SUPABASE_URL=tu_url_aqui
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_aqui
SUPABASE_SERVICE_KEY=tu_service_role_key_aqui
```

#### 5. Crear páginas básicas
- [ ] Crear `pages/index.js` (landing page)
- [ ] Crear `pages/login.js` (autenticación)
- [ ] Crear `pages/dashboard.js` (lista de reembolsos)
- [ ] Crear `pages/reimbursements/new.js` (usar componente ReimbursementForm)
- [ ] Probar localmente: `npm run dev`

---

### ✅ Fase 3: Agent/Worker (Día 3-4)

#### 6. Configurar Agent
```powershell
cd agent
npm install
```

- [ ] Copiar `agent/.env.example` a `agent/.env`
- [ ] Completar variables (por ahora sin API keys externas)
- [ ] Probar que arranca: `npm start`
- [ ] Debería ver logs: "Iniciando worker..."

#### 7. Obtener API Keys
- [ ] **Hugging Face**: https://huggingface.co/settings/tokens
  - Crear token con permisos de read
  - Agregar a `.env`: `HF_API_KEY=hf_xxx`
  
- [ ] **Google Gemini**: https://makersuite.google.com/app/apikey
  - Crear API key
  - Agregar a `.env`: `GEMINI_API_KEY=xxx`

- [ ] **Resend**: https://resend.com
  - Crear cuenta (gratis 100 emails/día)
  - Crear API key
  - Agregar a `.env`: `RESEND_API_KEY=re_xxx`
  - Configurar dominio o usar onboarding email

#### 8. Test de procesamiento básico
- [ ] Subir un reembolso desde el frontend
- [ ] Verificar que aparece en Supabase (tabla `reimbursements`)
- [ ] Ver logs del Agent procesando
- [ ] Verificar que status cambia a `PENDING_AUDIT`
- [ ] Revisar tabla `audit_logs` para ver el historial

---

### ✅ Fase 4: Funcionalidades de Auditoría (Día 5)

#### 9. Crear UI de auditor
- [ ] Crear `pages/audit/index.js` (lista de pendientes)
- [ ] Crear `pages/audit/[id].js` (detalle + botones aprobar/rechazar)
- [ ] Implementar componente con:
  - Visualización de evidencias (imágenes)
  - Comparación de montos
  - Resultado de IA
  - Botones de acción

#### 10. Implementar sistema de roles
- [ ] En Supabase, crear usuarios de prueba:
  ```sql
  -- Insertar en tabla profiles
  INSERT INTO profiles (full_name, dni, phone, email, zone, role)
  VALUES 
    ('Juan Supervisor', '12345678', '987654321', 'supervisor@test.com', 'Lima Norte', 'supervisor'),
    ('María Auditor', '87654321', '912345678', 'auditor@test.com', 'Lima Sur', 'auditor');
  ```
- [ ] Verificar RLS: supervisor solo ve sus reembolsos
- [ ] Verificar RLS: auditor ve todos los reembolsos

---

### ✅ Fase 5: Notificaciones (Día 6)

#### 11. Configurar emails
- [ ] Verificar dominio en Resend (o usar email de onboarding)
- [ ] Modificar `agent/index.js` para llamar a `notifyAuditorPendingReimbursement()` cuando status sea DUDOSO o NO_COINCIDE
- [ ] Modificar `frontend/pages/api/audit/[id]/decision.js` para llamar a `notifyEmployeeDecision()`
- [ ] Hacer prueba end-to-end:
  1. Supervisor sube reembolso
  2. Agent procesa → marca DUDOSO
  3. Auditor recibe email
  4. Auditor aprueba/rechaza
  5. Supervisor recibe email

---

### ✅ Fase 6: Reportes y Dashboard (Día 7)

#### 12. Crear página de reportes
- [ ] Crear `pages/reports.js`
- [ ] Usar endpoint `/api/reports`
- [ ] Mostrar:
  - Total de reembolsos por período
  - Montos totales
  - Estadísticas por zona
  - Gráficos (opcional: usar Chart.js o similar)
  - Precisión de IA (COINCIDE vs DUDOSO vs NO_COINCIDE)

---

### ✅ Fase 7: Deploy y Producción (Día 8)

#### 13. Deploy
- [ ] **Frontend en Vercel**:
  ```powershell
  cd frontend
  npm install -g vercel
  vercel
  ```
  - Agregar variables de entorno en Vercel dashboard
  
- [ ] **Agent en Railway** (alternativa: Render):
  1. Push código a GitHub
  2. Crear cuenta en https://railway.app
  3. New Project → Deploy from GitHub
  4. Seleccionar carpeta `agent`
  5. Agregar variables de entorno
  6. Deploy

- [ ] **Verificar que todo funciona**:
  - Frontend accesible en URL de Vercel
  - Agent corriendo en Railway (ver logs)
  - Procesar reembolso de prueba
  - Verificar emails

---

## Checklist de Pruebas

### Test 1: Flujo Completo Exitoso
- [ ] Supervisor crea reembolso con imagen clara
- [ ] Agent procesa con Tesseract (alta confianza)
- [ ] Status → PENDING_AUDIT
- [ ] AI Result → COINCIDE
- [ ] Auditor recibe email
- [ ] Auditor aprueba
- [ ] Supervisor recibe email de aprobación

### Test 2: Imagen Borrosa → Hugging Face
- [ ] Subir imagen borrosa o PDF complejo
- [ ] Tesseract falla (< 85% confianza)
- [ ] Agent llama a Hugging Face
- [ ] HF detecta monto correctamente
- [ ] Status → PENDING_AUDIT

### Test 3: Inconsistencia → NO_COINCIDE
- [ ] Declarar monto: 10.00
- [ ] Subir recibo con monto: 50.00
- [ ] Agent detecta inconsistencia
- [ ] AI Result → NO_COINCIDE o DUDOSO
- [ ] Email urgente a auditor

### Test 4: Taxi con Imagen → Gemini
- [ ] Tipo = "taxi"
- [ ] Subir foto del viaje + screenshot
- [ ] Agent llama a Gemini Vision
- [ ] Gemini verifica coincidencia visual
- [ ] Decide resultado final

### Test 5: Límite de Gemini
- [ ] Configurar `MAX_GEMINI_CALLS_PER_DAY=2`
- [ ] Subir 5 reembolsos que requieran Gemini
- [ ] Verificar que solo los primeros 2 usan Gemini
- [ ] Los siguientes se marcan DUDOSO automáticamente

### Test 6: Seguridad RLS
- [ ] Login como supervisor A
- [ ] Intentar acceder a reembolso de supervisor B (debería fallar)
- [ ] Login como auditor
- [ ] Verificar acceso a todos los reembolsos

---

## Troubleshooting Común

### Problema: Agent no procesa reembolsos
**Solución**:
- Verificar que status inicial sea `PENDING_OCR`
- Revisar logs del Agent: `cd agent && npm start`
- Verificar conexión a Supabase (URL y KEY correctas)

### Problema: Tesseract no detecta montos
**Solución**:
- Verificar que imagen tenga buena resolución
- Probar con diferentes imágenes
- Reducir `TESSERACT_CONF_THRESHOLD` a 0.70 temporalmente

### Problema: Gemini API error
**Solución**:
- Verificar API key válida
- Verificar límites de cuota (free tier tiene límites)
- Revisar tamaño de imágenes (máx 4MB por imagen)

### Problema: Emails no llegan
**Solución**:
- Verificar RESEND_API_KEY
- Verificar dominio verificado en Resend
- Revisar spam folder
- Verificar `NOTIFICATION_FROM_EMAIL` configurado

---

## Mantenimiento

### Diario
- [ ] Revisar logs del Agent
- [ ] Verificar contador de Gemini calls
- [ ] Revisar reembolsos PENDING_AUDIT

### Semanal
- [ ] Generar y enviar reporte semanal
- [ ] Revisar estadísticas de precisión de IA
- [ ] Ajustar umbrales si es necesario

### Mensual
- [ ] Revisar costos de APIs
- [ ] Analizar casos DUDOSO recurrentes
- [ ] Optimizar prompts de Gemini si es necesario
- [ ] Backup de base de datos

---

## Optimizaciones Futuras

1. **Cache de resultados OCR** (evitar reprocesar misma imagen)
2. **Queue system** (usar Redis o Supabase Realtime)
3. **Batch processing** (procesar múltiples reembolsos en paralelo)
4. **ML model custom** (entrenar modelo propio con datos históricos)
5. **Mobile app** (React Native para supervisores)
6. **Dashboard analytics** (Power BI o Metabase)
7. **Integración con ERP** (SAP, Oracle, etc.)

---

¡Éxito con la implementación! 🚀
