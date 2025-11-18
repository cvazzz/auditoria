import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    // Verificar autenticación
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Verificar que sea admin o auditor
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'auditor'].includes(profile.role)) {
      return res.status(403).json({ error: 'No tiene permisos para esta acción' });
    }

    // Obtener reimbursement
    const { data: reimb, error } = await supabase
      .from('reimbursements')
      .select('*, profiles(*)')
      .eq('id', id)
      .single();

    if (error || !reimb) {
      return res.status(404).json({ error: 'Reembolso no encontrado' });
    }

    // Resetear estado a PENDING_OCR
    await supabase
      .from('reimbursements')
      .update({ status: 'PENDING_OCR' })
      .eq('id', id);

    // Log de auditoría
    await supabase.from('audit_logs').insert({
      reimbursement_id: id,
      actor: user.email,
      action: 'REPROCESS_TRIGGERED',
      detail: {}
    });

    // Procesar en segundo plano
    processReimbursement(reimb).catch(err => {
      console.error('Error en procesamiento:', err);
    });

    return res.status(200).json({ 
      success: true,
      message: 'Procesamiento iniciado'
    });

  } catch (error) {
    console.error('Error processing reimbursement:', error);
    return res.status(500).json({ error: error.message });
  }
}
