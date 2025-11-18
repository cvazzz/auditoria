const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY; // Service role key para el agent

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[Supabase] SUPABASE_URL y SUPABASE_KEY deben estar configurados');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Obtiene un reimbursement por ID
 * @param {string} id - UUID del reimbursement
 * @returns {Promise<object|null>}
 */
async function getReimbursement(id) {
  try {
    const { data, error } = await supabase
      .from('reimbursements')
      .select('*, profiles(*)')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`[Supabase] Error obteniendo reimbursement: ${error.message}`);
    return null;
  }
}

/**
 * Obtiene reimbursements pendientes de procesamiento
 * @param {number} limit - Límite de resultados
 * @returns {Promise<Array>}
 */
async function getPendingReimbursements(limit = 10) {
  try {
    const { data, error } = await supabase
      .from('reimbursements')
      .select('*, profiles(*)')
      .eq('status', 'PENDING_OCR')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error(`[Supabase] Error obteniendo pendientes: ${error.message}`);
    return [];
  }
}

/**
 * Actualiza un reimbursement
 * @param {string} id - UUID del reimbursement
 * @param {object} updates - Campos a actualizar
 * @returns {Promise<boolean>}
 */
async function updateReimbursement(id, updates) {
  try {
    const { error } = await supabase
      .from('reimbursements')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`[Supabase] Error actualizando reimbursement: ${error.message}`);
    return false;
  }
}

/**
 * Inserta un log de auditoría
 * @param {string} reimbursementId - UUID del reimbursement
 * @param {string} actor - Identificador del actor (usuario o sistema)
 * @param {string} action - Acción realizada
 * @param {object} detail - Detalles adicionales en JSON
 * @returns {Promise<boolean>}
 */
async function logAudit(reimbursementId, actor, action, detail = {}) {
  try {
    const { error } = await supabase
      .from('audit_logs')
      .insert({
        reimbursement_id: reimbursementId,
        actor,
        action,
        detail
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`[Supabase] Error insertando audit log: ${error.message}`);
    return false;
  }
}

/**
 * Obtiene URLs firmadas para archivos privados
 * @param {string} bucket - Nombre del bucket
 * @param {string} path - Ruta del archivo
 * @param {number} expiresIn - Tiempo de expiración en segundos
 * @returns {Promise<string|null>}
 */
async function getSignedUrl(bucket, path, expiresIn = 3600) {
  try {
    const { data, error } = await supabase
      .storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) throw error;
    return data.signedUrl;
  } catch (error) {
    console.error(`[Supabase] Error obteniendo signed URL: ${error.message}`);
    return null;
  }
}

/**
 * Obtiene el perfil del auditor para notificaciones
 * @returns {Promise<Array>}
 */
async function getAuditors() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['auditor', 'admin']);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error(`[Supabase] Error obteniendo auditores: ${error.message}`);
    return [];
  }
}

module.exports = {
  supabase,
  getReimbursement,
  getPendingReimbursements,
  updateReimbursement,
  logAudit,
  getSignedUrl,
  getAuditors
};
