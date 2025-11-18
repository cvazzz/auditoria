/**
 * Validador de Recibos - Detecta screenshots falsos vs comprobantes reales
 */

/**
 * Detecta si es un screenshot de negociación (no válido) vs viaje confirmado
 * @param {string} text - Texto extraído del OCR
 * @param {string} detectedAmount - Monto detectado
 * @returns {Object} - { isValid, warning, type }
 */
function validateReceiptType(text, detectedAmount) {
  const cleanText = text.replace(/\s+/g, ' ').toLowerCase();
  
  const warnings = [];
  let receiptType = 'UNKNOWN';
  let isValid = true;
  
  // DETECCIÓN DE SCREENSHOTS DE NEGOCIACIÓN (NO VÁLIDOS)
  
  // DiDi - "Pon Tu Precio" (negociación, NO es comprobante)
  if (cleanText.includes('pon tu precio') || cleanText.includes('negocia') || cleanText.includes('elige')) {
    warnings.push({
      type: 'NEGOTIATION_SCREENSHOT',
      severity: 'CRITICAL',
      message: 'Screenshot de negociación de DiDi (Pon Tu Precio) - NO es comprobante válido',
      reason: 'El viaje no se confirmó, es solo una oferta'
    });
    receiptType = 'DIDI_NEGOTIATION';
    isValid = false;
  }
  
  // DiDi - Screenshot de búsqueda (antes de aceptar conductor)
  if (cleanText.includes('buscando conductor') || cleanText.includes('esperando conductor')) {
    warnings.push({
      type: 'SEARCHING_DRIVER',
      severity: 'CRITICAL',
      message: 'Screenshot de búsqueda de conductor - NO es comprobante válido',
      reason: 'El viaje no fue aceptado aún'
    });
    receiptType = 'DIDI_SEARCHING';
    isValid = false;
  }
  
  // Beat - "Hacer oferta" o "Proponer precio"
  if (cleanText.includes('hacer oferta') || cleanText.includes('proponer precio') || cleanText.includes('tu oferta')) {
    warnings.push({
      type: 'NEGOTIATION_SCREENSHOT',
      severity: 'CRITICAL',
      message: 'Screenshot de oferta de Beat - NO es comprobante válido',
      reason: 'El viaje no se confirmó, es solo una propuesta'
    });
    receiptType = 'BEAT_NEGOTIATION';
    isValid = false;
  }
  
  // Uber - "Tarifa estimada" (antes de confirmar)
  if (cleanText.includes('tarifa estimada') || cleanText.includes('precio estimado')) {
    warnings.push({
      type: 'ESTIMATED_FARE',
      severity: 'CRITICAL',
      message: 'Screenshot de tarifa estimada - NO es comprobante válido',
      reason: 'El viaje no se realizó, es solo una estimación'
    });
    receiptType = 'UBER_ESTIMATE';
    isValid = false;
  }
  
  // DETECCIÓN DE COMPROBANTES VÁLIDOS
  
  // DiDi - Viaje ACEPTADO con conductor asignado (VÁLIDO durante el viaje)
  // Keywords: conductor asignado, placa, calificación, ruta, distancia
  const hasConductor = cleanText.includes('conductor') || cleanText.includes('chofer') || cleanText.includes('driver');
  const hasRoute = cleanText.includes('min') && cleanText.includes('km');
  const hasVehicle = /[a-z]{3}\d{3,4}|[a-z]\d{1,2}-\d{4}/i.test(text); // Placa: AMY061, A1-2345
  const hasRating = cleanText.includes('viajes') || /\d+\s*viajes/.test(cleanText); // "200 viajes"
  
  if (hasConductor && (hasRoute || hasVehicle || hasRating)) {
    receiptType = 'DIDI_ACCEPTED';
    isValid = true;
    console.log('[ReceiptValidator] ✓ DiDi viaje aceptado detectado (conductor asignado)');
  }
  
  // DiDi - Viaje COMPLETADO (VÁLIDO después del viaje)
  if (cleanText.includes('viaje completado') || cleanText.includes('gracias por viajar') || cleanText.includes('califica tu viaje')) {
    receiptType = 'DIDI_COMPLETED';
    isValid = true;
    console.log('[ReceiptValidator] ✓ DiDi viaje completado detectado');
  }
  
  // Beat - Viaje finalizado (VÁLIDO)
  if (cleanText.includes('viaje finalizado') || cleanText.includes('tu viaje') && cleanText.includes('finalizado')) {
    receiptType = 'BEAT_COMPLETED';
    isValid = true;
    console.log('[ReceiptValidator] ✓ Beat viaje finalizado detectado');
  }
  
  // Uber - Recibo de viaje (VÁLIDO)
  if (cleanText.includes('recibo') || cleanText.includes('tu viaje con')) {
    receiptType = 'UBER_RECEIPT';
    isValid = true;
    console.log('[ReceiptValidator] ✓ Uber recibo detectado');
  }
  
  // Yape - Transacción exitosa (VÁLIDO)
  if (cleanText.includes('yapeaste') || cleanText.includes('yapeo exitoso')) {
    receiptType = 'YAPE_TRANSACTION';
    isValid = true;
    console.log('[ReceiptValidator] ✓ Yape transacción detectada');
  }
  
  // Boletas/Facturas - Número de RUC o "Boleta" (VÁLIDO)
  if (cleanText.includes('ruc') || cleanText.includes('boleta') || cleanText.includes('factura')) {
    receiptType = 'INVOICE';
    isValid = true;
    console.log('[ReceiptValidator] ✓ Boleta/Factura detectada');
  }
  
  return {
    isValid,
    receiptType,
    warnings,
    shouldReject: !isValid && warnings.length > 0
  };
}

/**
 * Valida que el recibo tenga información de viaje completado
 * @param {string} text - Texto del OCR
 * @returns {Object}
 */
function validateTripCompletion(text) {
  const cleanText = text.replace(/\s+/g, ' ').toLowerCase();
  
  const completionKeywords = [
    'viaje completado',
    'viaje finalizado',
    'gracias por viajar',
    'califica tu viaje',
    'trip completed',
    'viaje realizado',
    'transacción exitosa',
    'yapeo exitoso',
    'operación exitosa'
  ];
  
  const hasCompletion = completionKeywords.some(keyword => cleanText.includes(keyword));
  
  if (!hasCompletion) {
    return {
      isComplete: false,
      warning: {
        type: 'NO_COMPLETION_PROOF',
        severity: 'HIGH',
        message: 'No se detectó confirmación de viaje completado',
        reason: 'Puede ser un screenshot de estimación o negociación'
      }
    };
  }
  
  return {
    isComplete: true,
    warning: null
  };
}

/**
 * Valida que exista código de operación SOLO si es Yape o Boleta
 * @param {string} receiptType - Tipo de recibo detectado
 * @param {string|null} operationNumber - Número de operación extraído
 * @returns {Object}
 */
function validateOperationNumber(receiptType, operationNumber) {
  const requiresOperationNumber = ['YAPE_TRANSACTION', 'INVOICE'];
  
  // Si es Yape o Boleta, DEBE tener número de operación
  if (requiresOperationNumber.includes(receiptType)) {
    if (!operationNumber) {
      return {
        isValid: false,
        warning: {
          type: 'MISSING_OPERATION_NUMBER',
          severity: 'HIGH',
          message: `${receiptType} debe tener número de operación visible`,
          reason: 'Yape y boletas siempre tienen código único'
        }
      };
    }
  }
  
  // Apps de taxi (DiDi, Beat, Uber) NO requieren código de operación
  const taxiApps = ['DIDI_COMPLETED', 'BEAT_COMPLETED', 'UBER_RECEIPT'];
  if (taxiApps.includes(receiptType) && !operationNumber) {
    console.log('[ReceiptValidator] ℹ️ App de taxi sin código de operación (normal)');
  }
  
  return {
    isValid: true,
    warning: null
  };
}

/**
 * Validación completa de recibo
 * @param {string} ocrText - Texto del OCR
 * @param {Object} ocrResult - Resultado completo del OCR
 * @returns {Object}
 */
function validateReceipt(ocrText, ocrResult) {
  console.log('[ReceiptValidator] Validando tipo de recibo...');
  
  const warnings = [];
  
  // 1. Validar tipo de recibo (¿es negociación o viaje real?)
  const typeValidation = validateReceiptType(ocrText, ocrResult.detected_amount);
  if (typeValidation.warnings.length > 0) {
    warnings.push(...typeValidation.warnings);
  }
  
  // 2. Validar que el viaje esté completado
  if (typeValidation.isValid) {
    const completionValidation = validateTripCompletion(ocrText);
    if (completionValidation.warning) {
      warnings.push(completionValidation.warning);
    }
  }
  
  // 3. Validar número de operación (solo si es Yape o Boleta)
  const operationValidation = validateOperationNumber(
    typeValidation.receiptType, 
    ocrResult.operation_number
  );
  if (operationValidation.warning) {
    warnings.push(operationValidation.warning);
  }
  
  // Decisión final
  const hasCritical = warnings.some(w => w.severity === 'CRITICAL');
  const hasHigh = warnings.some(w => w.severity === 'HIGH');
  
  let action = 'APPROVE';
  if (hasCritical) {
    action = 'REJECT';
  } else if (hasHigh) {
    action = 'MANUAL_REVIEW';
  }
  
  console.log(`[ReceiptValidator] Tipo: ${typeValidation.receiptType}, Acción: ${action}`);
  
  return {
    isValid: typeValidation.isValid,
    receiptType: typeValidation.receiptType,
    warnings,
    action,
    shouldReject: hasCritical
  };
}

module.exports = {
  validateReceiptType,
  validateTripCompletion,
  validateOperationNumber,
  validateReceipt
};
