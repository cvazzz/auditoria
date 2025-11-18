const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fetch = require('node-fetch');
const { preprocessImage } = require('./imagePreprocessor'); // ← Preprocesamiento
const { extractMoney, extractOperationNumber, extractReceiptDate } = require('./tesseract'); // ← Extracción de datos
const { validateReceipt } = require('../utils/receiptValidator'); // ← Validación de tipo de recibo

/**
 * Script Python para EasyOCR
 */
const PYTHON_SCRIPT = `# -*- coding: utf-8 -*-
import easyocr
import sys
import json
import os

# Configurar encoding UTF-8 para Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
    # Configurar variables de entorno para evitar problemas de encoding
    os.environ['PYTHONIOENCODING'] = 'utf-8'

def main():
    try:
        image_path = sys.argv[1]
        
        # Inicializar EasyOCR (español e inglés)
        # Deshabilitar verbose para evitar problemas de encoding en barra de progreso
        reader = easyocr.Reader(['es', 'en'], gpu=False, verbose=False)
        
        # Leer texto
        result = reader.readtext(image_path, detail=1)
        
        # Formatear resultados
        texts = []
        confidences = []
        
        for (bbox, text, conf) in result:
            texts.append(text)
            confidences.append(float(conf))
        
        full_text = ' '.join(texts)
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0
        
        output = {
            'text': full_text,
            'confidence': avg_confidence,
            'details': [{'text': t, 'confidence': c} for t, c in zip(texts, confidences)]
        }
        
        print(json.dumps(output, ensure_ascii=False))
    except Exception as e:
        error_output = {
            'text': '',
            'confidence': 0,
            'error': str(e)
        }
        print(json.dumps(error_output, ensure_ascii=False))
        sys.exit(1)

if __name__ == '__main__':
    main()
`;

/**
 * Ejecuta EasyOCR en una imagen
 * @param {string} imageUrl - URL de la imagen
 * @returns {Promise<{texto: string, confidence: number}>}
 */
async function runEasyOCR(imageUrl) {
  try {
    console.log(`[EasyOCR] Procesando imagen: ${imageUrl}`);
    
    // PREPROCESAR IMAGEN (igual que Tesseract)
    console.log(`[EasyOCR] Preprocesando imagen...`);
    const buffer = await preprocessImage(imageUrl);
    
    // Guardar imagen preprocesada temporalmente
    const tempPath = path.join(__dirname, `temp_${Date.now()}.png`);
    await fs.writeFile(tempPath, buffer);
    
    // Crear script Python temporal
    const scriptPath = path.join(__dirname, 'easyocr_script.py');
    await fs.writeFile(scriptPath, PYTHON_SCRIPT);
    
    // Ejecutar EasyOCR con encoding UTF-8
    const result = await new Promise((resolve, reject) => {
      const python = spawn('python', [scriptPath, tempPath], {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        encoding: 'utf8'
      });
      
      let stdout = '';
      let stderr = '';
      
      python.stdout.setEncoding('utf8');
      python.stderr.setEncoding('utf8');
      
      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      python.on('close', async (code) => {
        // Limpiar archivos temporales
        try {
          await fs.unlink(tempPath);
          await fs.unlink(scriptPath);
        } catch (e) {
          // Ignorar errores de limpieza
        }
        
        if (code !== 0) {
          console.error(`[EasyOCR] Error: ${stderr}`);
          reject(new Error(`EasyOCR failed with code ${code}`));
          return;
        }
        
        try {
          const data = JSON.parse(stdout);
          if (data.error) {
            reject(new Error(data.error));
            return;
          }
          resolve(data);
        } catch (e) {
          reject(new Error(`Failed to parse EasyOCR output: ${stdout}`));
        }
      });
    });
    
    console.log(`[EasyOCR] Texto: ${result.text.substring(0, 100)}...`);
    console.log(`[EasyOCR] Confianza: ${result.confidence.toFixed(2)}`);
    
    return {
      texto: result.text,
      confidence: result.confidence
    };
    
  } catch (error) {
    console.error(`[EasyOCR] Error: ${error.message}`);
    return {
      texto: '',
      confidence: 0
    };
  }
}

/**
 * Procesa múltiples imágenes con EasyOCR
 * @param {string[]} urls - Array de URLs
 * @returns {Promise<{texto: string, detected_amount: number|null, best_confidence: number}>}
 */
async function runEasyOCRMultiple(urls) {
  console.log(`[EasyOCR] Procesando ${urls.length} imágenes...`);
  
  // Procesar todas las URLs
  const results = await Promise.all(
    urls.map(url => runEasyOCR(url))
  );
  
  // Combinar textos
  const combinedText = results.map(r => r.texto).join(' ');
  const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  
  // EXTRAER MONTO, NÚMERO DE OPERACIÓN Y FECHA usando las mismas funciones que Tesseract
  const monto = extractMoney(combinedText);
  const operationNumber = extractOperationNumber(combinedText);
  const receiptDate = extractReceiptDate(combinedText);
  
  // VALIDAR TIPO DE RECIBO (negociación vs viaje confirmado)
  const ocrResult = { 
    texto: combinedText, 
    detected_amount: monto,
    operation_number: operationNumber,
    receipt_date: receiptDate
  };
  const validation = validateReceipt(combinedText, ocrResult);
  
  console.log(`[EasyOCR] Monto detectado: ${monto}, Confianza promedio: ${avgConfidence.toFixed(2)}`);
  console.log(`[EasyOCR] Tipo de recibo: ${validation.receiptType}, Válido: ${validation.isValid}`);
  if (operationNumber) console.log(`[EasyOCR] Número de operación: ${operationNumber}`);
  if (receiptDate) console.log(`[EasyOCR] Fecha del recibo: ${receiptDate.toISOString().split('T')[0]}`);
  if (validation.warnings.length > 0) {
    console.log(`[EasyOCR] ⚠️ Advertencias: ${validation.warnings.map(w => w.message).join(', ')}`);
  }
  
  return {
    texto: combinedText,
    detected_amount: monto,
    operation_number: operationNumber,
    receipt_date: receiptDate,
    best_confidence: avgConfidence,
    receipt_type: validation.receiptType,
    is_valid_receipt: validation.isValid,
    receipt_warnings: validation.warnings,
    validation_action: validation.action
  };
}

module.exports = {
  runEasyOCR,
  runEasyOCRMultiple
};
