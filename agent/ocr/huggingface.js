const fetch = require('node-fetch');
const HUGGINGFACE_API_KEY = process.env.HF_API_KEY;

/**
 * Parsea el monto del JSON de respuesta de Hugging Face
 */
function parseAmount(json) {
  try {
    // Diferentes modelos pueden retornar diferentes estructuras
    // Intentar extraer de campos comunes
    const possibleFields = [
      'total', 'amount', 'total_amount', 'price', 
      'grand_total', 'subtotal', 'net_amount'
    ];

    // Si es un array, tomar el primer elemento
    const data = Array.isArray(json) ? json[0] : json;

    // Buscar en campos directos
    for (const field of possibleFields) {
      if (data[field]) {
        const value = typeof data[field] === 'string' 
          ? parseFloat(data[field].replace(/[^\d.]/g, ''))
          : data[field];
        
        if (!isNaN(value) && value > 0) {
          return value;
        }
      }
    }

    // Buscar en nested objects
    if (data.predictions || data.result) {
      const nested = data.predictions || data.result;
      for (const field of possibleFields) {
        if (nested[field]) {
          const value = typeof nested[field] === 'string'
            ? parseFloat(nested[field].replace(/[^\d.]/g, ''))
            : nested[field];
          
          if (!isNaN(value) && value > 0) {
            return value;
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error(`[HuggingFace] Error parsing amount: ${error.message}`);
    return null;
  }
}

/**
 * Parsea la confianza del JSON de respuesta
 */
function parseConfidence(json) {
  try {
    const data = Array.isArray(json) ? json[0] : json;
    
    // Buscar campos de confianza comunes
    const confFields = ['confidence', 'score', 'probability'];
    
    for (const field of confFields) {
      if (data[field] !== undefined) {
        return typeof data[field] === 'number' ? data[field] : parseFloat(data[field]);
      }
    }

    // Si no hay campo de confianza, usar heurística
    return 0.75; // Confianza por defecto si HF procesó correctamente
  } catch (error) {
    console.error(`[HuggingFace] Error parsing confidence: ${error.message}`);
    return 0.0;
  }
}

/**
 * Parsea la fecha del JSON de respuesta
 */
function parseDate(json) {
  try {
    const data = Array.isArray(json) ? json[0] : json;
    
    const dateFields = ['date', 'invoice_date', 'transaction_date', 'fecha'];
    
    for (const field of dateFields) {
      if (data[field]) {
        return data[field];
      }
    }

    if (data.predictions?.date) {
      return data.predictions.date;
    }

    return null;
  } catch (error) {
    console.error(`[HuggingFace] Error parsing date: ${error.message}`);
    return null;
  }
}

/**
 * Ejecuta el modelo Donut de Hugging Face
 * @param {string} url - URL de la imagen
 * @param {string} modelName - Nombre del modelo (default: naver-clova-ix/donut-base-finetuned-cord-v2)
 * @returns {Promise<{detected_amount: number|null, best_confidence: number, detected_date: string|null, raw: object}>}
 */
async function runDonut(url, modelName = 'naver-clova-ix/donut-base-finetuned-cord-v2') {
  try {
    console.log(`[HuggingFace] Procesando con modelo: ${modelName}`);
    console.log(`[HuggingFace] URL: ${url}`);

    if (!HUGGINGFACE_API_KEY) {
      throw new Error('HF_API_KEY no configurada');
    }

    // Descargar la imagen
    const imageResp = await fetch(url);
    if (!imageResp.ok) {
      throw new Error(`Error descargando imagen: ${imageResp.statusText}`);
    }
    const imageBuffer = await imageResp.buffer();

    // Llamar a la API de Hugging Face (nueva URL)
    const resp = await fetch(
      `https://router.huggingface.co/hf-inference/models/${modelName}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: imageBuffer
      }
    );

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`API error: ${resp.status} - ${errorText}`);
    }

    const json = await resp.json();
    console.log(`[HuggingFace] Respuesta raw:`, JSON.stringify(json, null, 2));

    // Parsear resultados
    const detected_amount = parseAmount(json);
    const best_confidence = parseConfidence(json);
    const detected_date = parseDate(json);

    console.log(`[HuggingFace] Monto: ${detected_amount}, Confianza: ${best_confidence}, Fecha: ${detected_date}`);

    return {
      detected_amount,
      best_confidence,
      detected_date,
      raw: json
    };
  } catch (error) {
    console.error(`[HuggingFace] Error: ${error.message}`);
    return {
      detected_amount: null,
      best_confidence: 0,
      detected_date: null,
      raw: { error: error.message }
    };
  }
}

/**
 * Ejecuta el modelo LayoutLM de Hugging Face
 * Alternativa a Donut, especializado en documentos estructurados
 */
async function runLayoutLM(url, modelName = 'microsoft/layoutlm-base-uncased') {
  // Similar a runDonut pero usando LayoutLM
  return runDonut(url, modelName);
}

/**
 * Procesa múltiples URLs con Hugging Face
 * @param {string[]} urls - Array de URLs
 * @returns {Promise<{detected_amount: number|null, best_confidence: number, detected_date: string|null, all_results: Array}>}
 */
async function runHuggingFace(urls) {
  const validUrls = urls.filter(url => url && url.trim() !== '');
  
  if (validUrls.length === 0) {
    return {
      detected_amount: null,
      best_confidence: 0,
      detected_date: null,
      all_results: []
    };
  }

  console.log(`[HuggingFace] Procesando ${validUrls.length} imágenes...`);

  // Procesar URLs secuencialmente para evitar rate limits
  const results = [];
  for (const url of validUrls) {
    const result = await runDonut(url);
    results.push(result);
    
    // Pequeña pausa entre requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Encontrar el mejor resultado
  const validResults = results.filter(r => r.detected_amount !== null);
  
  if (validResults.length === 0) {
    return {
      detected_amount: null,
      best_confidence: 0,
      detected_date: null,
      all_results: results
    };
  }

  const best = validResults.reduce((prev, current) =>
    current.best_confidence > prev.best_confidence ? current : prev
  );

  return { ...best, all_results: results };
}

module.exports = {
  runDonut,
  runLayoutLM,
  runHuggingFace,
  parseAmount,
  parseConfidence,
  parseDate
};
