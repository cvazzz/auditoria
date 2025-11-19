const crypto = require('crypto');
const sharp = require('sharp');
const { supabase } = require('./supabaseClient');

/**
 * Calcula hash único de una imagen para detectar duplicados
 * @param {Buffer} imageBuffer - Buffer de la imagen
 * @returns {Promise<string>} - Hash SHA256
 */
async function calculateImageHash(imageBuffer) {
  try {
    // Normalizar imagen para comparación consistente
    const normalized = await sharp(imageBuffer)
      .resize(200, 200, { fit: 'fill' }) // Tamaño fijo
      .greyscale() // Eliminar color
      .normalize() // Normalizar contraste
      .raw() // Datos crudos
      .toBuffer();
    
    // Calcular hash SHA256
    return crypto.createHash('sha256').update(normalized).digest('hex');
  } catch (error) {
    console.error(`[FraudDetection] Error calculando hash: ${error.message}`);
    return null;
  }
}

/**
 * Calcula hash desde URL de imagen
 * @param {string} imageUrl - URL de la imagen
 * @returns {Promise<string>} - Hash SHA256
 */
async function calculateImageHashFromUrl(imageUrl) {
  try {
    const fetch = require('node-fetch');
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Error descargando imagen: ${response.statusText}`);
    }
    const buffer = await response.buffer();
    return await calculateImageHash(buffer);
  } catch (error) {
    console.error(`[FraudDetection] Error descargando imagen: ${error.message}`);
    return null;
  }
}

/**
 * Verifica si una imagen ya fue usada en otro reembolso
 * @param {string} imageHash - Hash de la imagen
 * @param {string} currentReimbId - ID del reembolso actual (para excluir)
 * @returns {Promise<Object|null>} - Reembolso duplicado o null
 */
async function checkDuplicateImage(imageHash, currentReimbId) {
  if (!imageHash) return null;
  
  try {
    console.log(`[FraudDetection] Buscando duplicados de hash: ${imageHash}, excluyendo: ${currentReimbId}`);
    
    const { data, error } = await supabase
      .from('reimbursements')
      .select('id, created_at, reported_amount, status')
      .eq('image_hash', imageHash)
      .neq('id', currentReimbId)
      .limit(1); // Cambiar .single() por .limit(1) para obtener array
    
    if (error) {
      console.error(`[FraudDetection] Error buscando duplicados: ${error.message}, code: ${error.code}`);
      return null;
    }
    
    if (data && data.length > 0) {
      console.log(`[FraudDetection] ✓ DUPLICADO ENCONTRADO:`, data[0]);
      return data[0]; // Retornar el primer resultado
    } else {
      console.log(`[FraudDetection] No se encontraron duplicados`);
      return null;
    }
  } catch (error) {
    console.error(`[FraudDetection] Error en checkDuplicateImage: ${error.message}`);
    return null;
  }
}

/**
 * Verifica si un número de operación ya fue usado
 * @param {string} operationNumber - Número de operación
 * @param {string} currentReimbId - ID del reembolso actual
 * @returns {Promise<Object|null>} - Reembolso duplicado o null
 */
async function checkDuplicateOperation(operationNumber, currentReimbId) {
  if (!operationNumber) return null;
  
  try {
    const { data, error } = await supabase
      .from('reimbursements')
      .select('id, created_at, reported_amount, status')
      .eq('operation_number', operationNumber)
      .neq('id', currentReimbId)
      .limit(1); // Cambiar .single() por .limit(1)
    
    if (error) {
      console.error(`[FraudDetection] Error buscando operación: ${error.message}`);
      return null;
    }
    
    return (data && data.length > 0) ? data[0] : null;
  } catch (error) {
    console.error(`[FraudDetection] Error en checkDuplicateOperation: ${error.message}`);
    return null;
  }
}

/**
 * Valida la fecha del recibo vs fecha reportada
 * @param {Date} receiptDate - Fecha extraída del recibo
 * @param {Date} reportedDate - Fecha reportada por el usuario
 * @returns {Object} - { isValid, daysDiff, warning }
 */
function validateReceiptDate(receiptDate, reportedDate) {
  if (!receiptDate || !reportedDate) {
    return { isValid: true, daysDiff: null, warning: null };
  }
  
  const receipt = new Date(receiptDate);
  const reported = new Date(reportedDate);
  const daysDiff = Math.abs((reported - receipt) / (1000 * 60 * 60 * 24));
  
  let warning = null;
  let isValid = true;
  
  if (daysDiff > 30) {
    warning = {
      type: 'DATE_MISMATCH',
      severity: 'MEDIUM',
      message: `Recibo de hace ${Math.round(daysDiff)} días`,
      daysDiff: Math.round(daysDiff)
    };
    isValid = false;
  } else if (receipt > reported) {
    warning = {
      type: 'FUTURE_DATE',
      severity: 'HIGH',
      message: 'Recibo con fecha futura',
      daysDiff: Math.round(daysDiff)
    };
    isValid = false;
  }
  
  return { isValid, daysDiff: Math.round(daysDiff), warning };
}

/**
 * Ejecuta todas las validaciones de fraude
 * @param {Object} reimb - Objeto del reembolso
 * @param {Object} ocrResult - Resultado del OCR
 * @param {string[]} imageUrls - URLs de las imágenes
 * @returns {Promise<Object>} - Resultado de validación
 */
async function validateReimbursement(reimb, ocrResult, imageUrls) {
  console.log(`[FraudDetection] Validando reembolso ${reimb.id}...`);
  
  const warnings = [];
  let imageHash = null;
  
  // 0. AGREGAR ADVERTENCIAS DEL OCR/RECEIPT VALIDATOR
  if (ocrResult.warnings && Array.isArray(ocrResult.warnings)) {
    warnings.push(...ocrResult.warnings);
    console.log(`[FraudDetection] Advertencias del OCR/Validator: ${ocrResult.warnings.length}`);
  }
  
  // 1. VALIDAR HASH DE IMAGEN (duplicado exacto)
  if (imageUrls && imageUrls.length > 0) {
    imageHash = await calculateImageHashFromUrl(imageUrls[0]);
    
    if (imageHash) {
      const duplicate = await checkDuplicateImage(imageHash, reimb.id);
      
      if (duplicate) {
        warnings.push({
          type: 'DUPLICATE_IMAGE',
          severity: 'CRITICAL',
          message: 'Imagen idéntica ya usada en otro reembolso',
          details: {
            previous_id: duplicate.id,
            previous_date: duplicate.created_at,
            previous_amount: duplicate.reported_amount,
            previous_status: duplicate.status
          }
        });
        console.log(`[FraudDetection] ⚠️ ALERTA: Imagen duplicada detectada (original: ${duplicate.id})`);
      }
    }
  }
  
  // 2. VALIDAR NÚMERO DE OPERACIÓN (solo Yape y Boletas)
  const textLower = ocrResult.texto ? ocrResult.texto.toLowerCase() : '';
  const isYape = textLower.includes('yape');
  const isInvoice = textLower.includes('boleta') || textLower.includes('factura') || textLower.includes('ruc');
  const isTaxiApp = textLower.includes('didi') || textLower.includes('beat') || textLower.includes('uber');
  
  if (ocrResult.operation_number) {
    const dupOperation = await checkDuplicateOperation(ocrResult.operation_number, reimb.id);
    
    if (dupOperation) {
      warnings.push({
        type: 'DUPLICATE_OPERATION',
        severity: 'CRITICAL',
        message: 'Número de operación ya registrado',
        details: {
          operation_number: ocrResult.operation_number,
          previous_id: dupOperation.id,
          previous_date: dupOperation.created_at,
          previous_amount: dupOperation.reported_amount
        }
      });
      console.log(`[FraudDetection] ⚠️ ALERTA: Número de operación duplicado (${ocrResult.operation_number})`);
    }
  } else if ((isYape || isInvoice) && !isTaxiApp) {
    // Si es Yape o Boleta (no taxi) y NO tiene código, es sospechoso
    warnings.push({
      type: 'MISSING_OPERATION_NUMBER',
      severity: 'HIGH',
      message: 'Yape o Boleta sin número de operación visible',
      details: {
        reason: 'Puede ser screenshot editado o incompleto',
        detected_type: isYape ? 'Yape' : 'Boleta/Factura'
      }
    });
    console.log(`[FraudDetection] ⚠️ ${isYape ? 'Yape' : 'Boleta'} sin número de operación`);
  } else if (isTaxiApp && !ocrResult.operation_number) {
    console.log(`[FraudDetection] ℹ️ App de taxi sin código de operación (normal)`);
  }
  
  // 3. VALIDAR FECHA DEL RECIBO
  if (ocrResult.receipt_date && reimb.gasto_date) {
    const dateValidation = validateReceiptDate(ocrResult.receipt_date, reimb.gasto_date);
    if (dateValidation.warning) {
      warnings.push(dateValidation.warning);
      console.log(`[FraudDetection] ⚠️ Fecha sospechosa: ${dateValidation.warning.message}`);
    }
  }
  
  // DECISIÓN FINAL
  const hasCritical = warnings.some(w => w.severity === 'CRITICAL');
  const hasHigh = warnings.some(w => w.severity === 'HIGH');
  
  let action = 'APPROVE';
  if (hasCritical) {
    action = 'REJECT'; // Rechazar automáticamente
  } else if (hasHigh || warnings.length > 0) {
    action = 'MANUAL_REVIEW'; // Requiere revisión manual
  }
  
  const result = {
    is_suspicious: warnings.length > 0,
    should_block: hasCritical,
    warnings,
    action,
    image_hash: imageHash,
    operation_number: ocrResult.operation_number,
    receipt_date: ocrResult.receipt_date
  };
  
  console.log(`[FraudDetection] Resultado: ${action} (${warnings.length} advertencias)`);
  
  return result;
}

module.exports = {
  calculateImageHash,
  calculateImageHashFromUrl,
  checkDuplicateImage,
  checkDuplicateOperation,
  validateReceiptDate,
  validateReimbursement
};
