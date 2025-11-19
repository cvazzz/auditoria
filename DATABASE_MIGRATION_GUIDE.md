# 🗃️ Migración de Base de Datos - Validación de Recibos

## 📋 Resumen de Cambios

Se agregó **1 columna nueva** y **1 índice** a la tabla `reimbursements`:

### **Columnas Nuevas:**
1. ✅ `image_hash` (TEXT) - Hash SHA256 para detectar duplicados
2. ✅ `operation_number` (TEXT) - Número de operación (Yape, DiDi, etc)
3. ✅ `receipt_date` (TIMESTAMP) - Fecha extraída del recibo
4. 🆕 **`receipt_type` (TEXT)** - Tipo de recibo detectado por OCR
5. ✅ `fraud_warnings` (JSONB) - Advertencias de fraude

### **Índices Nuevos:**
1. ✅ `idx_image_hash` - Búsqueda rápida de imágenes duplicadas
2. ✅ `idx_operation_number` - Búsqueda rápida de operaciones duplicadas
3. 🆕 **`idx_receipt_type`** - Filtrar por tipo de recibo

---

## 🚀 Pasos para Ejecutar la Migración

### **Paso 1: Abrir Supabase SQL Editor**
1. Ve a tu proyecto en https://supabase.com
2. Click en **"SQL Editor"** en el menú lateral
3. Click en **"New Query"**

### **Paso 2: Copiar y Ejecutar el Script**
Copia todo el contenido del archivo `/agent/migrations/add_fraud_detection.sql`:

```sql
-- Agregar columnas para detección de fraude y validación de recibos
ALTER TABLE reimbursements 
ADD COLUMN IF NOT EXISTS image_hash TEXT,
ADD COLUMN IF NOT EXISTS operation_number TEXT,
ADD COLUMN IF NOT EXISTS receipt_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS receipt_type TEXT DEFAULT 'UNKNOWN',
ADD COLUMN IF NOT EXISTS fraud_warnings JSONB DEFAULT '[]'::jsonb;

-- Índices para búsqueda rápida de duplicados
CREATE INDEX IF NOT EXISTS idx_image_hash ON reimbursements(image_hash);
CREATE INDEX IF NOT EXISTS idx_operation_number ON reimbursements(operation_number);
CREATE INDEX IF NOT EXISTS idx_receipt_type ON reimbursements(receipt_type);

-- Comentarios
COMMENT ON COLUMN reimbursements.image_hash IS 'Hash SHA256 de la imagen para detectar duplicados';
COMMENT ON COLUMN reimbursements.operation_number IS 'Número de operación extraído del recibo (Yape, DiDi, etc)';
COMMENT ON COLUMN reimbursements.receipt_date IS 'Fecha extraída del recibo por OCR';
COMMENT ON COLUMN reimbursements.receipt_type IS 'Tipo de recibo: YAPE_TRANSACTION, DIDI_ACCEPTED, DIDI_COMPLETED, BEAT_COMPLETED, UBER_RECEIPT, INVOICE, DIDI_NEGOTIATION, etc';
COMMENT ON COLUMN reimbursements.fraud_warnings IS 'Array de advertencias de fraude detectadas';
```

### **Paso 3: Ejecutar**
Click en **"Run"** o presiona `Ctrl+Enter`

### **Paso 4: Verificar**
Deberías ver un mensaje: **"Success. No rows returned"**

---

## 📊 Tipos de Recibos (receipt_type)

### **✅ Recibos VÁLIDOS:**
| Valor | Descripción |
|-------|-------------|
| `YAPE_TRANSACTION` | Yape con "Yapeaste S/ X" + número de operación |
| `DIDI_ACCEPTED` | DiDi con conductor asignado + placa + ruta |
| `DIDI_COMPLETED` | DiDi con "Viaje Completado" |
| `BEAT_COMPLETED` | Beat con "Viaje Finalizado" |
| `UBER_RECEIPT` | Uber con "Recibo" o "Tu viaje con..." |
| `INVOICE` | Boleta/Factura con RUC |

### **❌ Recibos NO VÁLIDOS (auto-rechazados):**
| Valor | Descripción | Razón |
|-------|-------------|-------|
| `DIDI_NEGOTIATION` | DiDi "Pon Tu Precio" sin conductor | Puede inflar precio antes de confirmar |
| `BEAT_NEGOTIATION` | Beat "Hacer oferta" sin aceptar | Propuesta, no viaje confirmado |
| `UBER_ESTIMATE` | Uber "Tarifa estimada" | Estimación, no recibo real |
| `DIDI_SEARCHING` | DiDi "Buscando conductor" | Viaje no aceptado aún |

### **⚠️ Recibos DUDOSOS (revisión manual):**
| Valor | Descripción |
|-------|-------------|
| `UNKNOWN` | No se pudo determinar el tipo |

---

## 🔍 Queries Útiles

### **1. Ver tipos de recibos más comunes:**
```sql
SELECT 
  receipt_type,
  COUNT(*) as total,
  AVG(detected_amount) as monto_promedio,
  COUNT(*) FILTER (WHERE status = 'APPROVED') as aprobados,
  COUNT(*) FILTER (WHERE status = 'REJECTED') as rechazados
FROM reimbursements
WHERE receipt_type IS NOT NULL
GROUP BY receipt_type
ORDER BY total DESC;
```

### **2. Detectar intentos de fraude (screenshots de negociación):**
```sql
SELECT 
  id,
  user_id,
  receipt_type,
  reported_amount,
  detected_amount,
  ai_result,
  created_at
FROM reimbursements
WHERE receipt_type IN ('DIDI_NEGOTIATION', 'BEAT_NEGOTIATION', 'UBER_ESTIMATE', 'DIDI_SEARCHING')
ORDER BY created_at DESC;
```

### **3. Ver recibos rechazados con razón:**
```sql
SELECT 
  id,
  user_id,
  receipt_type,
  ai_result,
  fraud_warnings,
  created_at
FROM reimbursements
WHERE status = 'REJECTED'
  AND receipt_type LIKE '%NEGOTIATION%'
ORDER BY created_at DESC;
```

### **4. Estadísticas por usuario:**
```sql
SELECT 
  user_id,
  COUNT(*) as total_submissions,
  COUNT(*) FILTER (WHERE receipt_type LIKE '%NEGOTIATION%') as intentos_fraude,
  COUNT(*) FILTER (WHERE status = 'REJECTED') as rechazos,
  COUNT(*) FILTER (WHERE status = 'APPROVED') as aprobados,
  ROUND(AVG(detected_amount), 2) as monto_promedio
FROM reimbursements
GROUP BY user_id
HAVING COUNT(*) FILTER (WHERE receipt_type LIKE '%NEGOTIATION%') > 0
ORDER BY intentos_fraude DESC;
```

### **5. Ver todos los tipos de DiDi:**
```sql
SELECT 
  receipt_type,
  COUNT(*) as total,
  status,
  COUNT(*) as por_status
FROM reimbursements
WHERE receipt_type LIKE 'DIDI%'
GROUP BY receipt_type, status
ORDER BY receipt_type, status;
```

---

## 🎯 Comportamiento del Sistema

### **Flujo de Validación:**

```
Usuario sube imagen
    ↓
OCR extrae texto + monto
    ↓
Validar tipo de recibo
    ↓
┌─────────────────────────────────────┐
│ ¿Es negociación activa?             │
│ (Pon Tu Precio, Hacer oferta, etc)  │
└─────────────────────────────────────┘
    │ SÍ                        │ NO
    ↓                           ↓
❌ RECHAZAR                ¿Tiene conductor asignado?
receipt_type = NEGOTIATION     │ SÍ           │ NO
status = REJECTED              ↓              ↓
ai_result = "RECIBO NO      ✅ VÁLIDO    ¿Es Viaje Completado?
VÁLIDO: Screenshot de       receipt_type        │ SÍ    │ NO
negociación"                = ACCEPTED          ↓       ↓
                            Continuar      ✅ VÁLIDO  ⚠️ DUDOSO
                            validación     receipt_type  receipt_type
                            de monto       = COMPLETED   = UNKNOWN
                                          Continuar     Manual
                                          validación    Review
```

---

## ⚠️ IMPORTANTE: Actualizar Frontend

El frontend también necesita mostrar el tipo de recibo. Agrega en `/frontend/pages/audit.js`:

```jsx
// En la tabla de reimbursements
<TableCell>
  <Chip 
    label={reimb.receipt_type || 'UNKNOWN'} 
    color={
      reimb.receipt_type?.includes('NEGOTIATION') ? 'error' :
      reimb.receipt_type?.includes('COMPLETED') ? 'success' :
      reimb.receipt_type?.includes('ACCEPTED') ? 'success' :
      'default'
    }
    size="small"
  />
</TableCell>
```

---

## ✅ Checklist de Implementación

- [x] Actualizar `/agent/migrations/add_fraud_detection.sql`
- [x] Actualizar `/agent/index.js` - función `saveToDb()`
- [x] Actualizar `/agent/ocr/tesseract.js` - retornar `receipt_type`
- [x] Actualizar `/agent/ocr/easyocr.js` - retornar `receipt_type`
- [ ] **Ejecutar migración SQL en Supabase** ⬅️ **PENDIENTE**
- [ ] Actualizar frontend para mostrar `receipt_type` ⬅️ OPCIONAL
- [ ] Probar con screenshot de "Pon Tu Precio" → debe rechazar
- [ ] Probar con screenshot de "Viaje Aceptado" → debe aprobar

---

## 🧪 Plan de Pruebas

### **Test 1: Screenshot "Pon Tu Precio" (debe RECHAZAR)**
1. Subir imagen con "Pon Tu Precio" + monto + botón "Solicitar"
2. Esperar que el agente detecte `receipt_type = DIDI_NEGOTIATION`
3. Verificar `status = REJECTED`
4. Ver `ai_result = "RECIBO NO VÁLIDO: Screenshot de negociación de DiDi"`

### **Test 2: Screenshot "Viaje Aceptado" (debe APROBAR)**
1. Subir imagen con conductor asignado + placa + ruta + "El conductor aceptó"
2. Esperar que el agente detecte `receipt_type = DIDI_ACCEPTED`
3. Si monto coincide → `status = APPROVED`
4. Ver `ai_result = "COINCIDE"`

### **Test 3: Yape sin Código (debe REVISAR)**
1. Subir Yape sin "Nro. de operación"
2. Esperar `receipt_type = YAPE_TRANSACTION`
3. Verificar `fraud_warnings` contiene "Yape sin número de operación"
4. Ver `status = PENDING_AUDIT` (revisión manual)

---

## 📞 Soporte

Si tienes errores al ejecutar la migración:
1. Verifica que estás conectado a la base de datos correcta
2. Asegúrate de tener permisos de ALTER TABLE
3. Si las columnas ya existen, no hay problema (IF NOT EXISTS)
4. Si los índices ya existen, no hay problema (IF NOT EXISTS)

🎉 **¡Una vez ejecutada la migración, el sistema estará listo para detectar y rechazar screenshots de negociación!**
