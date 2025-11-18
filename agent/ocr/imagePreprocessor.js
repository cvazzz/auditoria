const sharp = require('sharp');
const fetch = require('node-fetch');

/**
 * Descarga y preprocesa una imagen para mejorar OCR
 * @param {string} url - URL de la imagen
 * @param {Object} options - Opciones de preprocesamiento
 * @returns {Promise<Buffer>} - Buffer de imagen procesada
 */
async function preprocessImage(url, options = {}) {
  try {
    // Descargar imagen
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error descargando imagen: ${response.statusText}`);
    }
    
    const buffer = await response.buffer();
    
    // Obtener metadata de la imagen
    const metadata = await sharp(buffer).metadata();
    console.log(`[ImagePreprocessor] Imagen original: ${metadata.width}x${metadata.height} ${metadata.format}`);
    
    // Procesar imagen
    let processedImage = sharp(buffer);
    
    // 1. Redimensionar si es muy pequeña (mínimo 1200px de ancho para mejor OCR)
    if (metadata.width < 1200) {
      const scale = 1200 / metadata.width;
      const newHeight = Math.round(metadata.height * scale);
      console.log(`[ImagePreprocessor] Redimensionando a: 1200x${newHeight}`);
      processedImage = processedImage.resize(1200, newHeight, {
        kernel: sharp.kernel.lanczos3, // Mejor calidad de interpolación
        fit: 'fill'
      });
    }
    
    // 2. Mejorar contraste antes de greyscale (importante para texto morado/coloreado)
    // Contraste moderado-alto para mejorar legibilidad sin perder detalles
    processedImage = processedImage
      .normalize() // Normalizar contraste primero
      .linear(1.2, -(128 * 0.2)); // Aumentar contraste moderadamente: (input * 1.2) - offset
    
    // 3. Convertir a escala de grises DESPUÉS de mejorar contraste
    processedImage = processedImage.greyscale();
    
    // 4. Aplicar normalización y nitidez (sin threshold agresivo)
    processedImage = processedImage
      .normalise() // Normalizar nuevamente después de ajustes
      .sharpen({ sigma: 1.5, m1: 0.8, m2: 0.6 }); // Nitidez moderada-alta con control fino
    
    // 5. NO aplicar threshold para Tesseract - dejarlo en escala de grises es mejor
    // El threshold era demasiado agresivo y borraba el "S/ 20"
    
    // 6. Convertir a PNG (mejor para OCR)
    const outputBuffer = await processedImage.png().toBuffer();
    
    console.log(`[ImagePreprocessor] Imagen procesada correctamente (greyscale con contraste mejorado)`);
    return outputBuffer;
    
  } catch (error) {
    console.error(`[ImagePreprocessor] Error: ${error.message}`);
    // Si falla el preprocesamiento, descargar imagen original
    try {
      const response = await fetch(url);
      return await response.buffer();
    } catch (fallbackError) {
      throw new Error(`No se pudo descargar la imagen: ${fallbackError.message}`);
    }
  }
}

/**
 * Preprocesa múltiples URLs de imágenes
 * @param {string[]} urls - Array de URLs
 * @returns {Promise<Buffer[]>} - Array de buffers procesados
 */
async function preprocessImages(urls) {
  console.log(`[ImagePreprocessor] Preprocesando ${urls.length} imágenes...`);
  const buffers = await Promise.all(
    urls.map(url => preprocessImage(url))
  );
  return buffers;
}

module.exports = {
  preprocessImage,
  preprocessImages
};
