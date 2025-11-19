const config = require('./config');
const { runTesseract } = require('./ocr/tesseract');
const { runEasyOCRMultiple } = require('./ocr/easyocr');
const { runHuggingFace } = require('./ocr/huggingface');
const { runGeminiVision } = require('./ocr/gemini');
const { 
  getReimbursement, 
  getPendingReimbursements, 
  updateReimbursement, 
  logAudit,
  getSignedUrl
} = require('./utils/supabaseClient');
const { validateReimbursement } = require('./utils/fraudDetection');
const { 
  moneyMatch, 
  shouldCallGemini, 
  decideResult,
  getWeekNumber,
  getMonthYear
} = require('./utils/decisionEngine');

// Contador de llamadas a Gemini (en memoria, resetear diariamente)
let geminiCallsToday = 0;
let lastResetDate = new Date().toDateString();

/**
 * Resetea el contador de llamadas a Gemini si es un nuevo día
 */
function resetGeminiCounterIfNeeded() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    console.log('[Agent] Nuevo día - reseteando contador de Gemini');
    geminiCallsToday = 0;
    lastResetDate = today;
  }
}

/**
 * Verifica si se puede llamar a Gemini (límite diario)
 */
function canCallGemini() {
  resetGeminiCounterIfNeeded();
  const canCall = geminiCallsToday < config.MAX_GEMINI_CALLS_PER_DAY;
  if (!canCall) {
    console.warn(`[Agent] Límite de Gemini alcanzado: ${geminiCallsToday}/${config.MAX_GEMINI_CALLS_PER_DAY}`);
  }
  return canCall;
}

/**
 * Guarda los resultados en la base de datos
 */
async function saveToDb(reimb) {
  const updates = {
    detected_amount: reimb.detected_amount,
    detected_currency: reimb.detected_currency || 'PEN',
    ai_result: reimb.ai_result,
    ai_confidence: reimb.ai_confidence,
    status: reimb.status,
    receipt_type: reimb.receipt_type || 'UNKNOWN',
    operation_number: reimb.operation_number || null,
    receipt_date: reimb.receipt_date || null,
    image_hash: reimb.image_hash || null,
    fraud_warnings: reimb.fraud_warnings || []
  };
  
  console.log(`[Agent] Guardando en DB:`, JSON.stringify(updates, null, 2));
  
  // Agregar week, month, year si hay fecha
  if (reimb.gasto_date) {
    updates.week = getWeekNumber(reimb.gasto_date);
    const { month, year } = getMonthYear(reimb.gasto_date);
    updates.month = month;
    updates.year = year;
  }
  
  const success = await updateReimbursement(reimb.id, updates);
  if (success) {
    console.log(`[Agent] ✓ Reimbursement ${reimb.id} actualizado en DB correctamente`);
  } else {
    console.error(`[Agent] ✗ Error actualizando reimbursement ${reimb.id}`);
  }
  
  return success;
}

/**
 * Procesa un reimbursement individual
 * FLUJO PRINCIPAL según especificaciones
 */
async function processReimbursement(reimb) {
  console.log(`\n========================================`);
  console.log(`[Agent] Procesando reimbursement: ${reimb.id}`);
  console.log(`[Agent] Tipo: ${reimb.type}, Monto reportado: ${reimb.reported_amount}`);
  console.log(`========================================\n`);
  
  try {
    // Convertir rutas de archivos a URLs firmadas
    const urls = [];
    const paths = [
      reimb.transport_image_url,
      reimb.cost_screenshot_url, 
      reimb.receipt_url
    ].filter(Boolean);
    
    console.log(`[Agent] Obteniendo URLs firmadas para ${paths.length} archivos...`);
    for (const path of paths) {
      const signedUrl = await getSignedUrl('reimbursements', path, 3600);
      if (signedUrl) {
        urls.push(signedUrl);
        console.log(`[Agent] ✓ URL firmada obtenida para: ${path}`);
      } else {
        console.warn(`[Agent] ✗ No se pudo obtener URL para: ${path}`);
      }
    }
    
    if (urls.length === 0) {
      console.error('[Agent] No se pudieron obtener URLs firmadas');
      reimb.ai_result = 'DUDOSO';
      reimb.ai_confidence = 0;
      reimb.status = 'PENDING_AUDIT';
      await saveToDb(reimb);
      return;
    }
    
    // ===== PASO 1: Tesseract OCR =====
    console.log('[Agent] PASO 1: Ejecutando Tesseract OCR...');
    const tRes = await runTesseract(urls);
    
    await logAudit(reimb.id, 'AGENT_SYSTEM', 'TESSERACT_RESULT', {
      confidence: tRes.best_confidence,
      detected_amount: tRes.detected_amount,
      receipt_type: tRes.receipt_type,
      is_valid_receipt: tRes.is_valid_receipt,
      texto_sample: tRes.texto?.substring(0, 200)
    });
    
    // VALIDAR FRAUDE PRIMERO (para calcular hash y detectar duplicados SIEMPRE)
    console.log('[Agent] Validando fraude (duplicados, operaciones, fechas)...');
    const fraudValidation = await validateReimbursement(reimb, tRes, urls);
    
    await logAudit(reimb.id, 'AGENT_SYSTEM', 'FRAUD_VALIDATION', {
      is_suspicious: fraudValidation.is_suspicious,
      should_block: fraudValidation.should_block,
      warnings: fraudValidation.warnings,
      action: fraudValidation.action
    });
    
    // VALIDAR TIPO DE RECIBO (negociación vs confirmado)
    // Si es REJECT por tipo inválido O por fraude, rechazar con TODAS las advertencias
    if (tRes.validation_action === 'REJECT' || fraudValidation.action === 'REJECT') {
      const allWarnings = [...(tRes.receipt_warnings || []), ...fraudValidation.warnings];
      const allMessages = allWarnings.map(w => w.message).join(' | ');
      
      console.log(`[Agent] ❌ RECHAZADO (${allWarnings.length} advertencias):`);
      allWarnings.forEach((w, i) => {
        console.log(`  ${i + 1}. [${w.severity}] ${w.message}`);
      });
      
      reimb.ai_result = `FRAUDE/RECIBO INVÁLIDO: ${allMessages}`;
      reimb.ai_confidence = tRes.best_confidence;
      reimb.status = 'REJECTED';
      reimb.detected_amount = tRes.detected_amount;
      reimb.receipt_type = tRes.receipt_type;
      reimb.operation_number = tRes.operation_number;
      reimb.receipt_date = tRes.receipt_date;
      reimb.image_hash = fraudValidation.image_hash;
      reimb.fraud_warnings = allWarnings;
      await saveToDb(reimb);
      return;
    }
    
    // Si llegamos aquí, el recibo es válido y no hay fraude crítico
    // Revisar si hay advertencias de severidad HIGH (requiere revisión manual)
    if (fraudValidation.action === 'MANUAL_REVIEW') {
      console.log(`[Agent] ⚠️ Requiere revisión manual por advertencias: ${fraudValidation.warnings.map(w => w.type).join(', ')}`);
      // Continuar procesamiento pero marcar para revisión
    }
    
    // Si Tesseract tiene alta confianza Y detectó monto QUE COINCIDE
    if (tRes.best_confidence >= config.TESSERACT_CONF_THRESHOLD && tRes.detected_amount) {
      const match = moneyMatch(reimb.reported_amount, tRes.detected_amount);
      
      if (match) {
        // Alta confianza + coincidencia + sin fraude crítico = aprobar
        reimb.detected_amount = tRes.detected_amount;
        reimb.ai_confidence = tRes.best_confidence;
        reimb.ai_result = 'COINCIDE';
        reimb.status = fraudValidation.action === 'MANUAL_REVIEW' ? 'PENDING_AUDIT' : 'APPROVED';
        reimb.receipt_type = tRes.receipt_type;
        reimb.operation_number = fraudValidation.operation_number;
        reimb.receipt_date = fraudValidation.receipt_date;
        reimb.image_hash = fraudValidation.image_hash;
        reimb.fraud_warnings = fraudValidation.warnings;
        console.log(`[Agent] ✓ Tesseract alta confianza (${tRes.best_confidence.toFixed(2)}) + montos COINCIDEN - ${reimb.status}`);
        await saveToDb(reimb);
        return;
      } else {
        // Alta confianza pero NO coincide = continuar a EasyOCR para confirmar
        console.log(`[Agent] ⚠ Tesseract alta confianza (${tRes.best_confidence.toFixed(2)}) pero NO coincide (detectado: ${tRes.detected_amount}, reportado: ${reimb.reported_amount}) - continuando a EasyOCR...`);
      }
    }
    
    // Si Tesseract detectó monto con baja confianza, verificar si coincide
    if (tRes.detected_amount && tRes.best_confidence < config.TESSERACT_CONF_THRESHOLD) {
      const match = moneyMatch(reimb.reported_amount, tRes.detected_amount);
      if (match) {
        // Baja confianza pero montos coinciden + sin fraude crítico = aprobar
        reimb.detected_amount = tRes.detected_amount;
        reimb.ai_confidence = tRes.best_confidence;
        reimb.ai_result = 'COINCIDE';
        reimb.status = fraudValidation.action === 'MANUAL_REVIEW' ? 'PENDING_AUDIT' : 'APPROVED';
        reimb.receipt_type = tRes.receipt_type;
        reimb.operation_number = fraudValidation.operation_number;
        reimb.receipt_date = fraudValidation.receipt_date;
        reimb.image_hash = fraudValidation.image_hash;
        reimb.fraud_warnings = fraudValidation.warnings;
        console.log(`[Agent] ✓ Tesseract baja confianza (${tRes.best_confidence.toFixed(2)}) pero montos COINCIDEN - ${reimb.status}`);
        await saveToDb(reimb);
        return;
      }
    }
    
    // ===== PASO 2: EasyOCR (si Tesseract falla o no coincide) =====
    console.log('[Agent] PASO 2: Tesseract insuficiente, intentando EasyOCR (mejor precisión)...');
    const easyRes = await runEasyOCRMultiple(urls);
    
    await logAudit(reimb.id, 'AGENT_SYSTEM', 'EASYOCR_RESULT', {
      confidence: easyRes.best_confidence,
      detected_amount: easyRes.detected_amount,
      receipt_type: easyRes.receipt_type,
      is_valid_receipt: easyRes.is_valid_receipt,
      texto_sample: easyRes.texto?.substring(0, 200)
    });
    
    // VALIDAR TIPO DE RECIBO con EasyOCR (doble verificación)
    if (easyRes.validation_action === 'REJECT') {
      console.log(`[Agent] ❌ RECHAZADO por EasyOCR - Tipo de recibo inválido: ${easyRes.receipt_type}`);
      reimb.ai_result = `RECIBO NO VÁLIDO: ${easyRes.receipt_warnings[0]?.message || 'Screenshot de negociación o incompleto'}`;
      reimb.ai_confidence = easyRes.best_confidence;
      reimb.status = 'REJECTED';
      reimb.detected_amount = easyRes.detected_amount;
      reimb.receipt_type = easyRes.receipt_type;
      reimb.operation_number = easyRes.operation_number;
      reimb.receipt_date = easyRes.receipt_date;
      reimb.fraud_warnings = easyRes.receipt_warnings;
      await saveToDb(reimb);
      return;
    }
    
    // Si EasyOCR detectó monto
    if (easyRes.detected_amount) {
      reimb.detected_amount = easyRes.detected_amount;
      reimb.ai_confidence = easyRes.best_confidence;
      reimb.receipt_type = easyRes.receipt_type;
      reimb.operation_number = fraudValidation.operation_number || easyRes.operation_number;
      reimb.receipt_date = fraudValidation.receipt_date || easyRes.receipt_date;
      reimb.image_hash = fraudValidation.image_hash;
      reimb.fraud_warnings = fraudValidation.warnings;
      
      const match = moneyMatch(reimb.reported_amount, reimb.detected_amount);
      reimb.ai_result = decideResult(reimb.reported_amount, reimb.detected_amount, reimb.ai_confidence);
      
      // Aprobación automática si COINCIDE (y sin advertencias críticas de fraude)
      if (reimb.ai_result === 'COINCIDE') {
        reimb.status = fraudValidation.action === 'MANUAL_REVIEW' ? 'PENDING_AUDIT' : 'APPROVED';
        console.log(`[Agent] ✓ EasyOCR exitoso - Resultado: ${reimb.ai_result} - ${reimb.status}`);
      } else {
        reimb.status = 'PENDING_AUDIT';
        console.log(`[Agent] ✓ EasyOCR exitoso - Resultado: ${reimb.ai_result} - Requiere auditoría`);
      }
      
      await saveToDb(reimb);
      return;
    }
    
    // Si EasyOCR no detectó monto pero detectó algo con confianza baja, verificar coincidencia
    if (easyRes.best_confidence > 0 && tRes.detected_amount) {
      const match = moneyMatch(reimb.reported_amount, tRes.detected_amount);
      if (match) {
        reimb.detected_amount = tRes.detected_amount;
        reimb.ai_confidence = easyRes.best_confidence;
        reimb.ai_result = 'COINCIDE';
        reimb.status = 'APPROVED';
        console.log(`[Agent] ✓ EasyOCR + Tesseract: Montos COINCIDEN - APROBADO AUTOMÁTICAMENTE`);
        await saveToDb(reimb);
        return;
      }
    }
    
    // ===== HuggingFace y Gemini DESACTIVADOS (solo OCR gratuito) =====
    console.log('[Agent] Tesseract y EasyOCR insuficientes - Marcando como DUDOSO para auditoría manual');
    reimb.ai_result = 'DUDOSO';
    reimb.ai_confidence = Math.max(tRes.best_confidence || 0, easyRes.best_confidence || 0);
    reimb.detected_amount = easyRes.detected_amount || tRes.detected_amount || null;
    reimb.status = 'PENDING_AUDIT';
    await saveToDb(reimb);
    return;
    
    /* 
    // ===== PASO 2: Hugging Face ===== [DESACTIVADO]
    console.log('[Agent] PASO 2: Tesseract insuficiente, intentando Hugging Face...');
    const hfRes = await runHuggingFace(urls); // Usar las URLs firmadas
    
    await logAudit(reimb.id, 'AGENT_SYSTEM', 'HUGGINGFACE_RESULT', {
      confidence: hfRes.best_confidence,
      detected_amount: hfRes.detected_amount,
      detected_date: hfRes.detected_date
    });
    
    // Si Hugging Face tiene alta confianza Y detectó monto
    if (hfRes.best_confidence >= config.HF_CONF_THRESHOLD && hfRes.detected_amount) {
      reimb.detected_amount = hfRes.detected_amount;
      reimb.ai_confidence = hfRes.best_confidence;
      
      const match = moneyMatch(reimb.reported_amount, reimb.detected_amount);
      reimb.ai_result = decideResult(reimb.reported_amount, reimb.detected_amount, reimb.ai_confidence);
      
      // Aprobación automática si COINCIDE
      if (reimb.ai_result === 'COINCIDE') {
        reimb.status = 'APPROVED';
        console.log(`[Agent] ✓ Hugging Face exitoso - Resultado: ${reimb.ai_result} - APROBADO AUTOMÁTICAMENTE`);
      } else {
        reimb.status = 'PENDING_AUDIT';
        console.log(`[Agent] ✓ Hugging Face exitoso - Resultado: ${reimb.ai_result} - Requiere auditoría`);
      }
      
      await saveToDb(reimb);
      return;
    }
    
    // ===== PASO 3: Gemini Vision (si es necesario) ===== [DESACTIVADO]
    if (shouldCallGemini(reimb, tRes, hfRes)) {
      console.log('[Agent] PASO 3: Llamando a Gemini Vision...');
      
      if (!canCallGemini()) {
        console.warn('[Agent] Límite de Gemini alcanzado - marcando como DUDOSO');
        reimb.ai_result = 'DUDOSO';
        reimb.status = 'PENDING_AUDIT';
        reimb.ai_confidence = 0.0;
        await saveToDb(reimb);
        await logAudit(reimb.id, 'AGENT_SYSTEM', 'GEMINI_LIMIT_REACHED', {});
        return;
      }
      
      geminiCallsToday++;
      
      // Crear objeto reimbursement con URLs firmadas
      const reimbWithSignedUrls = {
        ...reimb,
        transport_image_url: urls[0] || null,
        cost_screenshot_url: urls[1] || null,
        receipt_url: urls[2] || null
      };
      
      const gemRes = await runGeminiVision(reimbWithSignedUrls);
      
      await logAudit(reimb.id, 'AGENT_SYSTEM', 'GEMINI_RESULT', {
        confidence: gemRes.confidence,
        detected_amount: gemRes.detected_amount,
        result: gemRes.result,
        raw_sample: gemRes.raw?.substring(0, 500)
      });
      
      reimb.detected_amount = gemRes.detected_amount;
      reimb.detected_currency = gemRes.detected_currency;
      reimb.ai_confidence = gemRes.confidence;
      reimb.ai_result = gemRes.result; // Gemini ya decide COINCIDE/DUDOSO/NO_COINCIDE
      
      // Aprobación automática si COINCIDE
      if (reimb.ai_result === 'COINCIDE') {
        reimb.status = 'APPROVED';
        console.log(`[Agent] ✓ Gemini procesado - Resultado: ${reimb.ai_result} - APROBADO AUTOMÁTICAMENTE`);
      } else {
        reimb.status = 'PENDING_AUDIT';
        console.log(`[Agent] ✓ Gemini procesado - Resultado: ${reimb.ai_result} - Requiere auditoría`);
      }
      
      await saveToDb(reimb);
      return;
    }
    */
    
    // ===== PASO 4: Fallback - marcar como DUDOSO =====
    console.log('[Agent] PASO 4: Fallback - marcando como DUDOSO para revisión manual');
    reimb.ai_result = 'DUDOSO';
    reimb.status = 'PENDING_AUDIT';
    reimb.ai_confidence = 0.0;
    
    await saveToDb(reimb);
    await logAudit(reimb.id, 'AGENT_SYSTEM', 'FALLBACK_TO_AUDIT', {
      reason: 'No se pudo procesar con ningún sistema OCR'
    });
    
  } catch (error) {
    console.error(`[Agent] Error procesando reimbursement ${reimb.id}:`, error);
    
    // Marcar como error y enviar a auditoría
    await updateReimbursement(reimb.id, {
      status: 'PENDING_AUDIT',
      ai_result: 'DUDOSO',
      ai_confidence: 0.0
    });
    
    await logAudit(reimb.id, 'AGENT_SYSTEM', 'PROCESSING_ERROR', {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Worker principal - procesa la cola de reimbursements pendientes
 */
async function runWorker() {
  console.log('[Agent] Iniciando worker...');
  console.log(`[Agent] Configuración:`);
  console.log(`  - Tesseract threshold: ${config.TESSERACT_CONF_THRESHOLD}`);
  console.log(`  - HuggingFace threshold: ${config.HF_CONF_THRESHOLD}`);
  console.log(`  - Gemini threshold: ${config.GEMINI_CONF_THRESHOLD}`);
  console.log(`  - Money match tolerance: ${(config.MONEY_MATCH_TOLERANCE * 100)}%`);
  console.log(`  - Max Gemini calls/day: ${config.MAX_GEMINI_CALLS_PER_DAY}`);
  
  while (true) {
    try {
      resetGeminiCounterIfNeeded();
      
      // Obtener reimbursements pendientes
      const pending = await getPendingReimbursements(5);
      
      if (pending.length === 0) {
        console.log(`[Agent] No hay reimbursements pendientes. Esperando...`);
      } else {
        console.log(`[Agent] Procesando ${pending.length} reimbursements pendientes...`);
        
        // Procesar secuencialmente
        for (const reimb of pending) {
          await processReimbursement(reimb);
          
          // Pequeña pausa entre procesamiento
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Esperar antes del siguiente ciclo
      await new Promise(resolve => setTimeout(resolve, config.POLL_INTERVAL_MS));
      
    } catch (error) {
      console.error('[Agent] Error en el worker:', error);
      // Esperar más tiempo si hay error
      await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minuto
    }
  }
}

// Si se ejecuta directamente
if (require.main === module) {
  console.log('==============================================');
  console.log('   AGENTE DE AUDITORÍA DE REEMBOLSOS');
  console.log('==============================================\n');
  
  runWorker().catch(error => {
    console.error('[Agent] Error fatal:', error);
    process.exit(1);
  });
}

module.exports = {
  processReimbursement,
  runWorker
};
