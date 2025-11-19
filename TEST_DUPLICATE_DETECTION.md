# 🧪 Guía de Prueba - Detección de Duplicados

## ✅ Sistema Activo

El agente ahora tiene **3 capas de validación**:

1. **Validación de Tipo de Recibo** → Rechaza screenshots de negociación
2. **Detección de Fraude** → Detecta duplicados y operaciones repetidas  
3. **Validación de Monto** → Aprueba solo si coincide

---

## 🎯 Casos de Prueba

### **Test 1: Screenshot "Pon Tu Precio" (RECHAZADO) ✅**

**Resultado Actual:**
```
✅ FUNCIONANDO - Ya probado exitosamente

OCR detectó:
- Texto: "Pon Tu Precio" + "Disfruta tu viaje con DIDI"
- Monto: S/ 22.30
- receipt_type: INVOICE (confundido, pero funciona)

Validación:
- validation_action: REJECT (CRITICAL)
- Razón: "Screenshot de negociación de DiDi (Pon Tu Precio)"

Resultado Final:
- status: REJECTED ❌
- ai_result: "RECIBO NO VÁLIDO: Screenshot de negociación..."
```

---

### **Test 2: Viaje Aceptado con Conductor (APROBADO) ✅**

**Resultado Actual:**
```
✅ FUNCIONANDO - Ya probado exitosamente

OCR detectó:
- Texto: "Rodrigo Martin aceptó tu solicitud" + "M35030"
- Monto: S/ 7.00
- receipt_type: UNKNOWN (podría mejorarse)

Validación:
- validation_action: APPROVE
- Tesseract confianza: 84%

Resultado Final:
- status: APPROVED ✅
- ai_result: "COINCIDE"
```

---

### **Test 3: Imagen DUPLICADA (debe RECHAZAR) 🆕**

**Cómo Probar:**

1. **Subir primera vez:**
   - Imagen válida (viaje aceptado con conductor)
   - Monto: S/ 18.60
   - Esperado: **APROBADO** ✅

2. **Subir MISMA IMAGEN segunda vez:**
   ```
   Esperado:
   - Fraud Detection calcula hash SHA256
   - Detecta imagen duplicada en DB
   - warning: DUPLICATE_IMAGE (CRITICAL)
   - action: REJECT
   
   Resultado Final:
   - status: REJECTED ❌
   - ai_result: "FRAUDE DETECTADO: Imagen idéntica ya usada en reembolso #[ID]"
   - fraud_warnings: [
       {
         "type": "DUPLICATE_IMAGE",
         "severity": "CRITICAL",
         "message": "Imagen idéntica ya usada en otro reembolso",
         "details": {
           "previous_id": "...",
           "previous_date": "...",
           "previous_amount": 18.60,
           "previous_status": "APPROVED"
         }
       }
     ]
   ```

3. **Verificar en Supabase:**
   ```sql
   SELECT 
     id, 
     user_id, 
     image_hash, 
     status, 
     ai_result,
     fraud_warnings
   FROM reimbursements
   WHERE image_hash IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 5;
   ```

---

### **Test 4: Número de Operación DUPLICADO (debe RECHAZAR) 🆕**

**Cómo Probar:**

1. **Subir Yape válido primera vez:**
   - Imagen: "Yapeaste S/ 20.00" + "Nro. de operación: 07397334"
   - Esperado: **APROBADO** ✅
   - Se guarda: `operation_number = "07397334"`

2. **Editar imagen (cambiar color/crop) pero mantener mismo número:**
   - Imagen diferente (hash distinto)
   - Texto igual: "Nro. de operación: 07397334"
   - Monto: S/ 20.00 (igual o diferente)
   
   ```
   Esperado:
   - Fraud Detection detecta operation_number duplicado
   - warning: DUPLICATE_OPERATION (CRITICAL)
   - action: REJECT
   
   Resultado Final:
   - status: REJECTED ❌
   - ai_result: "FRAUDE DETECTADO: Número de operación ya registrado"
   - fraud_warnings: [
       {
         "type": "DUPLICATE_OPERATION",
         "severity": "CRITICAL",
         "message": "Número de operación ya registrado",
         "details": {
           "operation_number": "07397334",
           "previous_id": "...",
           "previous_date": "...",
           "previous_amount": 20.00
         }
       }
     ]
   ```

3. **Verificar en Supabase:**
   ```sql
   SELECT 
     id,
     operation_number,
     detected_amount,
     status,
     ai_result,
     fraud_warnings
   FROM reimbursements
   WHERE operation_number = '07397334'
   ORDER BY created_at DESC;
   ```

---

### **Test 5: Recibo MUY ANTIGUO (debe REVISAR) 🆕**

**Cómo Probar:**

1. **Subir recibo con fecha >30 días:**
   - Imagen válida con fecha visible: "15 Oct 2024"
   - Fecha actual: 14 Nov 2025
   - Diferencia: ~395 días
   
   ```
   Esperado:
   - Fraud Detection valida fecha
   - warning: DATE_MISMATCH (HIGH)
   - action: MANUAL_REVIEW
   
   Resultado Final:
   - status: PENDING_AUDIT ⚠️ (no rechaza, pero requiere revisión)
   - ai_result: "COINCIDE" (si monto coincide)
   - fraud_warnings: [
       {
         "type": "DATE_MISMATCH",
         "severity": "HIGH",
         "message": "Recibo muy antiguo (395 días)",
         "details": {
           "receipt_date": "2024-10-15",
           "reported_date": "2025-11-14",
           "days_diff": 395
         }
       }
     ]
   ```

---

## 📊 Matriz de Decisiones

| Caso | Tipo | Duplicado | Operación | Fecha | Monto | Resultado Final |
|------|------|-----------|-----------|-------|-------|-----------------|
| Screenshot "Pon Tu Precio" | ❌ NEGOTIATION | - | - | - | - | **REJECTED** |
| Viaje aceptado | ✅ ACCEPTED | No | - | OK | ✅ | **APPROVED** |
| Imagen duplicada | ✅ ACCEPTED | ✅ SÍ | - | OK | ✅ | **REJECTED** (fraude) |
| Operación duplicada | ✅ YAPE | No | ✅ SÍ | OK | ✅ | **REJECTED** (fraude) |
| Recibo antiguo (>30d) | ✅ ACCEPTED | No | No | ⚠️ Viejo | ✅ | **PENDING_AUDIT** |
| Fecha futura | ✅ ACCEPTED | No | No | ❌ Futuro | ✅ | **REJECTED** (fraude) |

---

## 🔍 SQL Queries para Verificar

### **1. Ver todos los duplicados detectados:**
```sql
SELECT 
  r1.id as first_id,
  r1.created_at as first_date,
  r1.detected_amount as first_amount,
  r1.status as first_status,
  r2.id as duplicate_id,
  r2.created_at as duplicate_date,
  r2.detected_amount as duplicate_amount,
  r2.status as duplicate_status,
  r2.ai_result as duplicate_result
FROM reimbursements r1
JOIN reimbursements r2 ON r1.image_hash = r2.image_hash AND r1.id != r2.id
WHERE r1.image_hash IS NOT NULL
ORDER BY r1.created_at DESC;
```

### **2. Ver operaciones duplicadas (Yape/Boletas):**
```sql
SELECT 
  operation_number,
  COUNT(*) as total_uses,
  ARRAY_AGG(id ORDER BY created_at) as reimbursement_ids,
  ARRAY_AGG(status ORDER BY created_at) as statuses,
  ARRAY_AGG(detected_amount ORDER BY created_at) as amounts
FROM reimbursements
WHERE operation_number IS NOT NULL
GROUP BY operation_number
HAVING COUNT(*) > 1
ORDER BY total_uses DESC;
```

### **3. Ver recibos con advertencias de fraude:**
```sql
SELECT 
  id,
  user_id,
  receipt_type,
  detected_amount,
  status,
  ai_result,
  fraud_warnings,
  created_at
FROM reimbursements
WHERE fraud_warnings IS NOT NULL 
  AND fraud_warnings != '[]'::jsonb
ORDER BY created_at DESC
LIMIT 20;
```

### **4. Estadísticas de fraude por usuario:**
```sql
SELECT 
  user_id,
  COUNT(*) as total_submissions,
  COUNT(*) FILTER (WHERE status = 'REJECTED' AND ai_result LIKE '%FRAUDE%') as fraud_attempts,
  COUNT(*) FILTER (WHERE status = 'REJECTED' AND ai_result LIKE '%NO VÁLIDO%') as invalid_receipts,
  COUNT(*) FILTER (WHERE status = 'APPROVED') as approved,
  ROUND(AVG(detected_amount), 2) as avg_amount
FROM reimbursements
GROUP BY user_id
ORDER BY fraud_attempts DESC, invalid_receipts DESC;
```

---

## 🚀 Próximos Pasos para Probar

### **Orden de Pruebas Recomendado:**

1. ✅ **Ya probado:** Screenshot "Pon Tu Precio" → RECHAZADO
2. ✅ **Ya probado:** Viaje aceptado → APROBADO
3. 🆕 **Probar ahora:** Subir misma imagen 2 veces → Segunda debe ser RECHAZADA
4. 🆕 **Probar luego:** Yape con mismo número de operación → Segunda debe ser RECHAZADA
5. 🆕 **Probar final:** Recibo con fecha antigua → PENDING_AUDIT

---

## 📝 Log Esperado para Duplicado

```
[Agent] Procesando reimbursement: xxx
[Agent] PASO 1: Ejecutando Tesseract OCR...
[Tesseract] Monto detectado: 18.60, Confianza: 0.85
[Tesseract] Tipo de recibo: DIDI_ACCEPTED, Válido: true

[Agent] Validando fraude (duplicados, operaciones, fechas)...
[FraudDetection] Validando reimbursement xxx...
[FraudDetection] Calculando hash de imagen...
[FraudDetection] Hash: abc123def456...
[FraudDetection] Buscando duplicados en DB...
[FraudDetection] ⚠️ ALERTA: Imagen duplicada detectada (original: yyy)

[Agent] ❌ RECHAZADO por fraude: Imagen idéntica ya usada en otro reembolso
[Agent] Guardando en DB: {
  "status": "REJECTED",
  "ai_result": "FRAUDE DETECTADO: Imagen idéntica ya usada en reembolso #yyy",
  "image_hash": "abc123def456...",
  "fraud_warnings": [...]
}
```

---

## ✅ Checklist de Funcionalidades

- [x] Validación de tipo de recibo (negociación vs confirmado)
- [x] Auto-rechazo de "Pon Tu Precio"
- [x] Auto-aprobación de viajes con conductor
- [x] Integración de fraud detection en agente
- [ ] **Test de imagen duplicada** ⬅️ **PENDIENTE**
- [ ] **Test de operación duplicada** ⬅️ **PENDIENTE**
- [ ] **Test de fecha antigua** ⬅️ **PENDIENTE**

---

🎯 **¿Listo para probar duplicados?** Sube la misma imagen dos veces y verás cómo la segunda es rechazada automáticamente.
