// Cargar variables de entorno
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Configuración del agente
module.exports = {
  // Umbrales de confianza para cada sistema OCR
  TESSERACT_CONF_THRESHOLD: parseFloat(process.env.TESSERACT_CONF_THRESHOLD || '0.85'),
  HF_CONF_THRESHOLD: parseFloat(process.env.HF_CONF_THRESHOLD || '0.90'),
  GEMINI_CONF_THRESHOLD: parseFloat(process.env.GEMINI_CONF_THRESHOLD || '0.80'),
  
  // Tolerancia para comparación de montos (3%)
  MONEY_MATCH_TOLERANCE: parseFloat(process.env.MONEY_MATCH_TOLERANCE || '0.03'),
  
  // Límites de uso de APIs
  MAX_GEMINI_CALLS_PER_DAY: parseInt(process.env.MAX_GEMINI_CALLS_PER_DAY || '100'),
  
  // Configuración de Tesseract
  TESSERACT_LANGS: process.env.TESSERACT_LANGS || 'spa+eng',
  
  // Intervalos de procesamiento
  POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS || '30000'), // 30 segundos
  
  // Configuración de Supabase
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
  
  // Configuración de APIs externas
  HF_API_KEY: process.env.HF_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  
  // Configuración de notificaciones
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
  NOTIFICATION_FROM_EMAIL: process.env.NOTIFICATION_FROM_EMAIL || 'noreply@auditoria.com',
  
  // URLs base
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info', // debug | info | warn | error
};
