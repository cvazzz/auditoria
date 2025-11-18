const Tesseract = require('tesseract.js');
const fetch = require('node-fetch');
const { preprocessImage } = require('./imagePreprocessor');
const { validateReceipt } = require('../utils/receiptValidator');

/**
 * Extrae número de operación del recibo (Yape, DiDi, Beat, etc.)
 * @param {string} text - Texto extraído del OCR
 * @returns {string|null} - Número de operación o null
 */
function extractOperationNumber(text) {
  const cleanText = text.replace(/\s+/g, ' ');
  
  // Patrón 1: Yape - "Nro. de operación 07397334"
  const yapePattern = /(?:Nro\.?\s*de\s*operaci[oó]n|operaci[oó]n)[:\s]*(\d{6,12})/gi;
  let match = yapePattern.exec(cleanText);
  if (match) {
    console.log(`[extractOperationNumber] Yape: ${match[1]}`);
    return match[1];
  }
  
  // Patrón 2: DiDi, Beat - "Orden:" o "Order:"
  const orderPattern = /(?:orden|order|pedido)[:\s]*(\d{6,15})/gi;
  match = orderPattern.exec(cleanText);
  if (match) {
    console.log(`[extractOperationNumber] Order: ${match[1]}`);
    return match[1];
  }
  
  // Patrón 3: Cualquier número largo (8-15 dígitos) como fallback
  const longNumberPattern = /\b(\d{8,15})\b/g;
  const numbers = [];
  while ((match = longNumberPattern.exec(cleanText)) !== null) {
    numbers.push(match[1]);
  }
  
  if (numbers.length > 0) {
    console.log(`[extractOperationNumber] Número largo: ${numbers[0]}`);
    return numbers[0];
  }
  
  return null;
}

/**
 * Extrae fecha del recibo
 * @param {string} text - Texto extraído del OCR
 * @returns {Date|null} - Fecha del recibo o null
 */
function extractReceiptDate(text) {
  const cleanText = text.replace(/\s+/g, ' ');
  
  // Patrón 1: "11 set 2025" (formato Yape)
  const yapePattern = /(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)[a-z]*\s+(\d{4})/gi;
  let match = yapePattern.exec(cleanText);
  if (match) {
    const months = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, set: 8, sep: 8, oct: 9, nov: 10, dic: 11 };
    const day = parseInt(match[1]);
    const month = months[match[2].toLowerCase()];
    const year = parseInt(match[3]);
    const date = new Date(year, month, day);
    console.log(`[extractReceiptDate] Fecha Yape: ${date.toISOString()}`);
    return date;
  }
  
  // Patrón 2: "2025-11-13" o "13/11/2025"
  const isoPattern = /(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
  match = isoPattern.exec(cleanText);
  if (match) {
    let date;
    if (match[1]) {
      // Formato YYYY-MM-DD
      date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    } else {
      // Formato DD/MM/YYYY
      date = new Date(parseInt(match[6]), parseInt(match[5]) - 1, parseInt(match[4]));
    }
    console.log(`[extractReceiptDate] Fecha ISO: ${date.toISOString()}`);
    return date;
  }
  
  return null;
}

/**
 * Extrae montos específicos de facturas (con IGV, sin IGV, base gravada)
 * @param {string} text - Texto extraído del OCR
 * @returns {Object} - { base_imponible, igv, total, detected_amount }
 */
function extractInvoiceAmounts(text) {
  const cleanText = text.replace(/\s+/g, ' ').toUpperCase();
  
  const result = {
    base_imponible: null,  // Monto sin IGV (OP. GRAVADA)
    igv: null,              // IGV
    total: null,            // Total con IGV
    detected_amount: null   // El que usaremos para comparar
  };
  
  // Buscar "OP. GRAVADA", "BASE IMPONIBLE", "SUBTOTAL" (monto sin IGV)
  const basePatterns = [
    /(?:OP\.?\s*GRAVADA|BASE\s*IMPONIBLE|SUBTOTAL|GRAVADA)[:\s]*(?:S\/\.?|PEN)?\s*(\d{1,5}(?:[.,]\d{2})?)/gi,
    /GRAVADA\s*S\/\s*(\d{1,5}(?:[.,]\d{2})?)/gi
  ];
  
  for (const pattern of basePatterns) {
    const match = pattern.exec(cleanText);
    if (match) {
      const value = parseFloat(match[1].replace(',', '.'));
      if (!isNaN(value) && value > 0) {
        result.base_imponible = value;
        break;
      }
    }
  }
  
  // Buscar "OP. EXO" (Operación Exonerada - también es sin IGV)
  const exoPattern = /(?:OP\.?\s*EXO|EXONERADA?|OP\.?\s*INAFECTA?)[:\s]*(?:S\/\.?|PEN)?\s*(\d{1,5}(?:[.,]\d{2})?)/gi;
  const exoMatch = exoPattern.exec(cleanText);
  if (exoMatch && !result.base_imponible) {
    const value = parseFloat(exoMatch[1].replace(',', '.'));
    if (!isNaN(value) && value > 0) {
      result.base_imponible = value;
    }
  }
  
  // Buscar "IGV"
  const igvPattern = /IGV\s*(?:S\/\.?|PEN)?\s*(\d{1,5}(?:[.,]\d{2})?)/gi;
  const igvMatch = igvPattern.exec(cleanText);
  if (igvMatch) {
    const value = parseFloat(igvMatch[1].replace(',', '.'));
    if (!isNaN(value) && value > 0) {
      result.igv = value;
    }
  }
  
  // Buscar "IMPORTE TOTAL", "TOTAL"
  const totalPatterns = [
    /(?:IMPORTE\s*TOTAL|TOTAL)[:\s]*(?:S\/\.?|PEN)?\s*(\d{1,5}(?:[.,]\d{2})?)/gi,
    /TOTAL\s*S\/\s*(\d{1,5}(?:[.,]\d{2})?)/gi
  ];
  
  for (const pattern of totalPatterns) {
    const match = pattern.exec(cleanText);
    if (match) {
      const value = parseFloat(match[1].replace(',', '.'));
      if (!isNaN(value) && value > 0) {
        result.total = value;
        break;
      }
    }
  }
  
  // DECISIÓN: Usar base imponible si existe, sino usar total
  result.detected_amount = result.base_imponible || result.total;
  
  return result;
}

/**
 * Extrae montos de texto usando regex
 * Soporta formatos: 
 * - Tradicionales: S/ 22.30, $123.45, 22.30 soles
 * - Apps de taxi: PEN7, PEN 7, PEN7.50
 * - Sin decimales: s/2230 -> 22.30, PEN750 -> 7.50
 */
function extractMoney(text) {
  // Primero intentar extraer montos de factura (con/sin IGV)
  const invoiceAmounts = extractInvoiceAmounts(text);
  if (invoiceAmounts.detected_amount) {
    console.log(`[Tesseract] Factura detectada - Base: ${invoiceAmounts.base_imponible}, IGV: ${invoiceAmounts.igv}, Total: ${invoiceAmounts.total}`);
    return invoiceAmounts.detected_amount;
  }
  
  // Si no es factura, usar extracción normal
  const amounts = [];
  
  // Limpiar el texto: remover saltos de línea excesivos
  const cleanText = text.replace(/\s+/g, ' ');
  
  // PRIORIDAD 1: Buscar "S/ XX" o "S/XX" cerca de palabras clave (Yape, Total, Monto)
  // Esto ayuda a evitar confusiones con otros números en el recibo
  const priorityPattern = /(?:yape|total|monto|precio|amount|pagaste)[^\d]*(?:S\/\.?|s\/|S\s*\/)\s*(\d{1,4}(?:[.,]\d{1,2})?)/gi;
  let match;
  while ((match = priorityPattern.exec(cleanText)) !== null) {
    const value = parseFloat(match[1].replace(',', '.'));
    if (!isNaN(value) && value > 0 && value < 10000) {
      console.log(`[extractMoney] Patrón prioritario encontrado: ${value} (contexto: ${match[0]})`);
      amounts.push({ value, priority: 10 }); // Alta prioridad
    }
  }
  
  // PRIORIDAD 1B: Buscar "S/XX" al inicio o después de salto de línea (típico de Yape)
  // Yape muestra "S/ 20" en la parte superior del recibo
  const yapePattern = /(?:^|[\r\n])\s*(?:S\/\.?|s\/|S\s*\/)\s*(\d{1,4}(?:[.,]\d{1,2})?)/gi;
  while ((match = yapePattern.exec(text)) !== null) {
    const value = parseFloat(match[1].replace(',', '.'));
    if (!isNaN(value) && value > 0 && value < 10000) {
      console.log(`[extractMoney] Patrón Yape encontrado: ${value} (inicio línea)`);
      amounts.push({ value, priority: 10 }); // Alta prioridad
    }
  }
  
  // PRIORIDAD 1C: Detectar "5/20" o "5/ 20" (OCR confunde S con 5 en "S/")
  const confusedSPattern = /(?:^|[\r\n]|yape|total)\s*5\s*\/\s*(\d{1,4}(?:[.,]\d{1,2})?)/gi;
  while ((match = confusedSPattern.exec(cleanText)) !== null) {
    const value = parseFloat(match[1].replace(',', '.'));
    if (!isNaN(value) && value > 0 && value < 10000) {
      console.log(`[extractMoney] Patrón S/X confundido con 5/X: ${value}`);
      amounts.push({ value, priority: 9 }); // Casi máxima prioridad
    }
  }
  
  // Patrón 1: Formato apps y tradicional mejorado
  // Detecta: S/20, S/ 20, s/20, PEN7, USD10, $ 20, etc.
  const appPattern = /(?:PEN|USD|S\s*\/\.?|s\s*\/\.?|\$)\s*(\d{1,5}(?:[.,]\d{1,2})?)/gi;
  while ((match = appPattern.exec(cleanText)) !== null) {
    let amount = match[1].replace(',', '.');
    
    // NO convertir a decimales aquí si ya viene con moneda explícita
    // PEN15 debe ser 15.00, no 0.15
    const value = parseFloat(amount);
    if (!isNaN(value) && value > 0 && value < 10000) {
      amounts.push({ value, priority: 6 });
    }
  }
  
  // Patrón 1B: Número seguido de moneda: 7S/, 7 S/, 10PEN, 10 PEN (formato Beat)
  const reversedPattern = /(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:S\/|PEN|USD|soles?)/gi;
  while ((match = reversedPattern.exec(cleanText)) !== null) {
    let amount = match[1].replace(',', '.');
    
    // NO convertir a decimales aquí si ya viene con moneda explícita
    const value = parseFloat(amount);
    if (!isNaN(value) && value > 0 && value < 10000) {
      amounts.push({ value, priority: 5 });
    }
  }
  
  // Patrón 1C: Número seguido de "/" (OCR confunde S con 5): "155/" = 15S/, "75/" = 7S/
  // Solo para números de 2-3 dígitos que terminen en 5/
  const slashPattern = /(\d{2,3})\/(?!\d)/gi;
  while ((match = slashPattern.exec(cleanText)) !== null) {
    const numStr = match[1];
    // Si termina en 5 y tiene 2-3 dígitos, probablemente sea XS/ mal leído
    if (numStr.endsWith('5')) {
      // Reemplazar el último 5 con nada: 155 -> 15, 75 -> 7, 235 -> 23
      const corrected = numStr.slice(0, -1);
      const value = parseFloat(corrected);
      if (!isNaN(value) && value >= 5 && value <= 200) { // Rango típico de taxis
        amounts.push({ value, priority: 5 });
      }
    }
  }
  
  // Patrón 2: Formato tradicional con símbolos: S/ 22.30, $123.45
  const traditionalPattern = /(?:S\/\.?|soles?|USD|\$)\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/gi;
  while ((match = traditionalPattern.exec(cleanText)) !== null) {
    let amount = match[1]
      .replace(/\.(?=\d{3}(?![.,]\d))/g, '') // Remover separadores de miles
      .replace(',', '.'); // Convertir coma decimal a punto
    
    const value = parseFloat(amount);
    if (!isNaN(value) && value > 0 && value < 10000) {
      amounts.push({ value, priority: 3 });
    }
  }
  
  // Patrón 3: Números con decimales solos: 22.30, 7.50
  const decimalPattern = /\b(\d{1,4}[.,]\d{2})\b/g;
  while ((match = decimalPattern.exec(cleanText)) !== null) {
    const amount = match[1].replace(',', '.');
    const value = parseFloat(amount);
    if (!isNaN(value) && value > 0 && value < 10000) {
      amounts.push({ value, priority: 1 });
    }
  }
  
  // Patrón 4: Con palabras clave: total: 22.30, precio: 7.50
  const keywordPattern = /(?:total|monto|amount|price|precio|costo|cost)[:\s]*(?:S\/\.?|PEN|USD|\$)?\s*(\d{1,4}(?:[.,]\d{2})?)/gi;
  while ((match = keywordPattern.exec(cleanText)) !== null) {
    const amount = match[1].replace(',', '.');
    const value = parseFloat(amount);
    if (!isNaN(value) && value > 0 && value < 10000) {
      amounts.push({ value, priority: 8 });
    }
  }
  
  // Si no encontramos nada, buscar cualquier número de 1-4 dígitos
  if (amounts.length === 0) {
    const anyNumberPattern = /\b(\d{1,4})\b/g;
    while ((match = anyNumberPattern.exec(cleanText)) !== null) {
      const value = parseFloat(match[1]);
      if (!isNaN(value) && value >= 5 && value < 1000) { // Montos razonables para taxi
        // Si es 2-3 dígitos, añadir decimales: 750 -> 7.50
        if (value >= 100 && value < 1000) {
          amounts.push({ value: value / 100, priority: 0 });
        } else {
          amounts.push({ value, priority: 0 });
        }
      }
    }
  }
  
  // Retornar el monto con mayor prioridad y en rango típico
  if (amounts.length === 0) return null;
  
  // Ordenar por prioridad (mayor a menor) y luego por rango típico de taxi
  amounts.sort((a, b) => {
    // Primero por prioridad
    if (b.priority !== a.priority) return b.priority - a.priority;
    
    // Si tienen misma prioridad, preferir los que están en rango típico (5-200)
    const aInRange = a.value >= 5 && a.value <= 200 ? 1 : 0;
    const bInRange = b.value >= 5 && b.value <= 200 ? 1 : 0;
    if (bInRange !== aInRange) return bInRange - aInRange;
    
    // Si ambos en rango o ambos fuera, preferir el menor (más común en taxis)
    return a.value - b.value;
  });
  
  console.log(`[extractMoney] Montos detectados: ${amounts.map(a => `${a.value} (p${a.priority})`).join(', ')}`);
  return amounts[0].value;
}

/**
 * Calcula confianza promedio de las palabras reconocidas
 */
function averageConfidence(data) {
  if (!data.words || data.words.length === 0) return 0;
  
  const sum = data.words.reduce((acc, word) => acc + word.confidence, 0);
  return sum / data.words.length / 100; // Normalizar a 0-1
}

/**
 * Ejecuta OCR en una URL de imagen
 * @param {string} url - URL de la imagen
 * @returns {Promise<{texto: string, detected_amount: number|null, best_confidence: number}>}
 */
async function ocrFromUrl(url) {
  try {
    console.log(`[Tesseract] Procesando imagen: ${url}`);
    
    // Preprocesar imagen para mejorar OCR
    console.log(`[Tesseract] Preprocesando imagen...`);
    const buffer = await preprocessImage(url);
    
    // Ejecutar OCR con configuración optimizada para recibos
    const { data } = await Tesseract.recognize(
      buffer, 
      'spa+eng', 
      { 
        // PSM 6: Asume un bloque uniforme de texto (mejor para recibos)
        // PSM 3: Auto, detecta automáticamente (default)
        // PSM 11: Encontrar todo el texto sin orden particular (mejor para apps)
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        tessedit_char_whitelist: '0123456789.,/SsPENsole$áéíóúÁÉÍÓÚñÑABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz :.-',
        logger: m => {
          if (m.status === 'recognizing text') {
            // Solo mostrar cada 20% de progreso
            if (m.progress === 0 || m.progress === 0.2 || m.progress === 0.4 || 
                m.progress === 0.6 || m.progress === 0.8 || m.progress === 1) {
              console.log(`[Tesseract] ${m.status}: ${Math.round(m.progress * 100)}%`);
            }
          } else {
            console.log(`[Tesseract] ${m.status}: ${m.progress || ''}`);
          }
        }
      }
    );
    
    const texto = data.text;
    const monto = extractMoney(texto);
    const operationNumber = extractOperationNumber(texto);
    const receiptDate = extractReceiptDate(texto);
    const conf = data.confidence ? data.confidence / 100 : averageConfidence(data);
    
    // VALIDAR TIPO DE RECIBO (negociación vs viaje confirmado)
    const ocrResult = { 
      texto, 
      detected_amount: monto,
      operation_number: operationNumber,
      receipt_date: receiptDate
    };
    const validation = validateReceipt(texto, ocrResult);
    
    console.log(`[Tesseract] Texto extraído: ${texto.substring(0, 200)}...`);
    console.log(`[Tesseract] Monto detectado: ${monto}, Confianza: ${conf}`);
    console.log(`[Tesseract] Tipo de recibo: ${validation.receiptType}, Válido: ${validation.isValid}`);
    if (operationNumber) console.log(`[Tesseract] Número de operación: ${operationNumber}`);
    if (receiptDate) console.log(`[Tesseract] Fecha del recibo: ${receiptDate.toISOString().split('T')[0]}`);
    if (validation.warnings.length > 0) {
      console.log(`[Tesseract] ⚠️ Advertencias: ${validation.warnings.map(w => w.message).join(', ')}`);
    }
    
    return { 
      texto, 
      detected_amount: monto,
      operation_number: operationNumber,
      receipt_date: receiptDate,
      best_confidence: conf,
      receipt_type: validation.receiptType,
      is_valid_receipt: validation.isValid,
      receipt_warnings: validation.warnings,
      validation_action: validation.action
    };
  } catch (error) {
    console.error(`[Tesseract] Error: ${error.message}`);
    return { 
      texto: '', 
      detected_amount: null,
      operation_number: null,
      receipt_date: null,
      best_confidence: 0,
      receipt_type: 'UNKNOWN',
      is_valid_receipt: false,
      receipt_warnings: [],
      validation_action: 'MANUAL_REVIEW'
    };
  }
}

/**
 * Procesa múltiples URLs y retorna el mejor resultado
 * @param {string[]} urls - Array de URLs
 * @returns {Promise<{texto: string, detected_amount: number|null, best_confidence: number, all_results: Array}>}
 */
async function runTesseract(urls) {
  const validUrls = urls.filter(url => url && url.trim() !== '');
  
  if (validUrls.length === 0) {
    return { 
      texto: '', 
      detected_amount: null,
      operation_number: null,
      receipt_date: null,
      best_confidence: 0,
      receipt_type: 'UNKNOWN',
      is_valid_receipt: false,
      receipt_warnings: [],
      validation_action: 'MANUAL_REVIEW',
      all_results: []
    };
  }

  console.log(`[Tesseract] Procesando ${validUrls.length} imágenes...`);
  
  // Procesar todas las URLs
  const results = await Promise.all(
    validUrls.map(url => ocrFromUrl(url))
  );
  
  // Encontrar el mejor resultado (mayor confianza con monto detectado)
  const validResults = results.filter(r => r.detected_amount !== null);
  
  if (validResults.length === 0) {
    // Si ninguno tiene monto, retornar el de mayor confianza
    const best = results.reduce((prev, current) => 
      current.best_confidence > prev.best_confidence ? current : prev
    );
    return { ...best, all_results: results };
  }
  
  // Retornar el resultado con mayor confianza que tenga monto
  const best = validResults.reduce((prev, current) => 
    current.best_confidence > prev.best_confidence ? current : prev
  );
  
  return { ...best, all_results: results };
}

module.exports = { 
  ocrFromUrl, 
  runTesseract,
  extractMoney,
  extractInvoiceAmounts,
  extractOperationNumber,
  extractReceiptDate,
  averageConfidence
};
