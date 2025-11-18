const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

/**
 * Construye el prompt para Gemini Vision
 * @param {object} reimb - Objeto reimbursement con todos los datos
 * @returns {string} - Prompt formateado
 */
function buildGeminiPrompt(reimb) {
  const prompt = `Eres un sistema que EXTRAE y COMPARA montos y fechas de comprobantes. Responde SOLO con JSON.

Input:
- Monto declarado: ${reimb.reported_amount}
- Fecha declarada: ${reimb.gasto_date || 'No proporcionada'}
- Tipo de gasto: ${reimb.type}
- URLs: transport=${reimb.transport_image_url || 'N/A'}, cost=${reimb.cost_screenshot_url || 'N/A'}, receipt=${reimb.receipt_url || 'N/A'}

Tareas:
1) Extrae el monto exacto (number) y moneda (string) de cada imagen/PDF si es posible.
2) Extrae la fecha del comprobante si está visible.
3) Compara el monto detectado con el monto declarado usando 3% de tolerancia.
4) Si hay imagen de transporte (taxi/Uber), verifica que coincida visualmente con el screenshot del costo.
5) Devuelve JSON con este formato exacto:
{
  "detected_amount": 123.45,
  "detected_currency": "PEN",
  "detected_date": "2025-10-12",
  "confidence": 0.87,
  "result": "COINCIDE"
}

Valores válidos para "result": "COINCIDE", "DUDOSO", "NO_COINCIDE"
Si no puedes extraer información, coloca detected_amount = null y confidence = 0.0, result = "DUDOSO"

Responde SOLO con el JSON, sin texto adicional.`;

  return prompt;
}

/**
 * Descarga una imagen y la convierte a base64
 * @param {string} url - URL de la imagen
 * @returns {Promise<{inlineData: {data: string, mimeType: string}}>}
 */
async function urlToBase64(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error descargando: ${response.statusText}`);
    }
    
    const buffer = await response.buffer();
    const base64 = buffer.toString('base64');
    
    // Determinar MIME type
    let mimeType = 'image/jpeg';
    const contentType = response.headers.get('content-type');
    if (contentType) {
      mimeType = contentType;
    } else if (url.toLowerCase().endsWith('.png')) {
      mimeType = 'image/png';
    } else if (url.toLowerCase().endsWith('.pdf')) {
      mimeType = 'application/pdf';
    }
    
    return {
      inlineData: {
        data: base64,
        mimeType: mimeType
      }
    };
  } catch (error) {
    console.error(`[Gemini] Error descargando ${url}: ${error.message}`);
    return null;
  }
}

/**
 * Parsea la respuesta de Gemini extrayendo el JSON
 * @param {string} text - Texto de respuesta
 * @returns {object} - JSON parseado
 */
function parseGeminiResponse(text) {
  try {
    // Intentar parsear directamente
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // Si no hay JSON válido, retornar estructura por defecto
    return {
      detected_amount: null,
      detected_currency: null,
      detected_date: null,
      confidence: 0.0,
      result: 'DUDOSO'
    };
  } catch (error) {
    console.error(`[Gemini] Error parseando respuesta: ${error.message}`);
    return {
      detected_amount: null,
      detected_currency: null,
      detected_date: null,
      confidence: 0.0,
      result: 'DUDOSO'
    };
  }
}

/**
 * Llama a Gemini Pro Vision con imágenes
 * @param {string} prompt - Prompt de texto
 * @param {string[]} imageUrls - Array de URLs de imágenes
 * @returns {Promise<{detected_amount: number|null, detected_currency: string|null, detected_date: string|null, confidence: number, result: string, raw: string}>}
 */
async function callGeminiVision(prompt, imageUrls) {
  try {
    if (!genAI) {
      throw new Error('GEMINI_API_KEY no configurada');
    }

    console.log(`[Gemini] Procesando ${imageUrls.length} imágenes...`);
    
    // Filtrar URLs válidas
    const validUrls = imageUrls.filter(url => url && url.trim() !== '');
    
    if (validUrls.length === 0) {
      throw new Error('No hay URLs válidas para procesar');
    }

    // Descargar y convertir imágenes a base64
    const imageParts = await Promise.all(
      validUrls.map(url => urlToBase64(url))
    );
    
    // Filtrar imágenes que fallaron
    const validImages = imageParts.filter(img => img !== null);
    
    if (validImages.length === 0) {
      throw new Error('No se pudo descargar ninguna imagen');
    }

    // Usar el modelo Gemini 1.5 Pro (soporta visión)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });
    
    // Construir el contenido con texto e imágenes
    const contents = [prompt, ...validImages];
    
    console.log(`[Gemini] Enviando request con ${validImages.length} imágenes...`);
    
    // Generar contenido
    const result = await model.generateContent(contents);
    const response = await result.response;
    const text = response.text();
    
    console.log(`[Gemini] Respuesta raw:`, text);
    
    // Parsear respuesta JSON
    const parsed = parseGeminiResponse(text);
    
    return {
      detected_amount: parsed.detected_amount,
      detected_currency: parsed.detected_currency || 'PEN',
      detected_date: parsed.detected_date,
      confidence: parsed.confidence || 0.0,
      result: parsed.result || 'DUDOSO',
      raw: text
    };
  } catch (error) {
    console.error(`[Gemini] Error: ${error.message}`);
    return {
      detected_amount: null,
      detected_currency: null,
      detected_date: null,
      confidence: 0.0,
      result: 'DUDOSO',
      raw: error.message
    };
  }
}

/**
 * Wrapper principal que usa el reimbursement completo
 * @param {object} reimb - Objeto reimbursement
 * @returns {Promise<object>}
 */
async function runGeminiVision(reimb) {
  const prompt = buildGeminiPrompt(reimb);
  const imageUrls = [
    reimb.transport_image_url,
    reimb.cost_screenshot_url,
    reimb.receipt_url
  ];
  
  return callGeminiVision(prompt, imageUrls);
}

module.exports = {
  buildGeminiPrompt,
  callGeminiVision,
  runGeminiVision,
  parseGeminiResponse
};
