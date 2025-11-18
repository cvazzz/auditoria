const config = require('../config');

/**
 * Compara dos montos con tolerancia configurada
 * @param {number} reported - Monto declarado
 * @param {number} detected - Monto detectado
 * @returns {boolean} - true si coinciden dentro de la tolerancia
 */
function moneyMatch(reported, detected) {
  if (!reported || !detected) return false;
  
  const tolerance = config.MONEY_MATCH_TOLERANCE;
  const maxValue = Math.max(reported, detected);
  const difference = Math.abs(reported - detected);
  const percentDiff = difference / maxValue;
  
  const matches = percentDiff <= tolerance;
  
  console.log(`[DecisionEngine] Comparación: ${reported} vs ${detected}`);
  console.log(`[DecisionEngine] Diferencia: ${(percentDiff * 100).toFixed(2)}% (tolerancia: ${(tolerance * 100)}%)`);
  console.log(`[DecisionEngine] Resultado: ${matches ? 'COINCIDE' : 'NO COINCIDE'}`);
  
  return matches;
}

/**
 * Determina si se debe llamar a Gemini Vision
 * @param {object} reimb - Objeto reimbursement
 * @param {object} tRes - Resultado de Tesseract (opcional)
 * @param {object} hfRes - Resultado de Hugging Face (opcional)
 * @returns {boolean}
 */
function shouldCallGemini(reimb, tRes = null, hfRes = null) {
  // Caso 1: Ambos OCR fallaron o tienen baja confianza
  const lowConfidence = 
    (tRes && tRes.best_confidence < config.TESSERACT_CONF_THRESHOLD) ||
    (hfRes && hfRes.best_confidence < config.HF_CONF_THRESHOLD);
  
  if (lowConfidence) {
    console.log('[DecisionEngine] Baja confianza en OCR -> Llamar Gemini');
    return true;
  }
  
  // Caso 2: Es un taxi/uber con imagen de transporte (verificación visual)
  const needsVisualCheck = 
    reimb.type === 'taxi' && 
    reimb.transport_image_url && 
    reimb.transport_image_url.trim() !== '';
  
  if (needsVisualCheck) {
    console.log('[DecisionEngine] Taxi con imagen -> Llamar Gemini para verificación visual');
    return true;
  }
  
  // Caso 3: No se detectó monto en ningún OCR
  const noAmount = 
    (!tRes || !tRes.detected_amount) && 
    (!hfRes || !hfRes.detected_amount);
  
  if (noAmount) {
    console.log('[DecisionEngine] No se detectó monto -> Llamar Gemini como último recurso');
    return true;
  }
  
  console.log('[DecisionEngine] No es necesario llamar a Gemini');
  return false;
}

/**
 * Decide el resultado final basado en confianza y coincidencia
 * @param {number} reported - Monto reportado
 * @param {number} detected - Monto detectado
 * @param {number} confidence - Confianza del sistema
 * @returns {string} - COINCIDE | DUDOSO | NO_COINCIDE
 */
function decideResult(reported, detected, confidence) {
  // Si no hay monto detectado
  if (!detected) {
    console.log('[DecisionEngine] Sin monto detectado -> DUDOSO');
    return 'DUDOSO';
  }
  
  // Comparar montos primero
  const match = moneyMatch(reported, detected);
  
  // Si coinciden perfectamente (diferencia < 3%), aceptar incluso con confianza baja
  if (match) {
    console.log('[DecisionEngine] Montos coinciden -> COINCIDE');
    return 'COINCIDE';
  }
  
  // Si NO coinciden pero la confianza es muy baja, no podemos estar seguros
  if (confidence < 0.5) {
    console.log('[DecisionEngine] No coinciden y confianza muy baja -> DUDOSO');
    return 'DUDOSO';
  }
  
  // Confianza alta y NO coinciden
  if (confidence >= 0.8) {
    // Gran diferencia con alta confianza
    const diff = Math.abs(reported - detected) / Math.max(reported, detected);
    if (diff > 0.2) { // Más del 20% de diferencia
      return 'NO_COINCIDE';
    }
    return 'DUDOSO';
  }
  
  // Confianza media (0.5 - 0.8) y NO coinciden
  return 'DUDOSO';
}

/**
 * Calcula semana del año a partir de una fecha
 * @param {Date|string} date - Fecha
 * @returns {number} - Número de semana (1-53)
 */
function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}

/**
 * Extrae mes y año de una fecha
 * @param {Date|string} date - Fecha
 * @returns {{month: number, year: number}}
 */
function getMonthYear(date) {
  const d = new Date(date);
  return {
    month: d.getMonth() + 1, // 1-12
    year: d.getFullYear()
  };
}

module.exports = {
  moneyMatch,
  shouldCallGemini,
  decideResult,
  getWeekNumber,
  getMonthYear
};
