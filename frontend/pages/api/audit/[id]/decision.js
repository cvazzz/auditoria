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
    const { status, comment } = req.body;

    // Validar status
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ 
        error: 'Status debe ser APPROVED o REJECTED' 
      });
    }

    // Obtener usuario autenticado
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Verificar que sea auditor o admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['auditor', 'admin'].includes(profile.role)) {
      return res.status(403).json({ error: 'No tiene permisos para auditar' });
    }

    // Obtener el reimbursement
    const { data: reimb, error: reimbError } = await supabase
      .from('reimbursements')
      .select('*, profiles(*)')
      .eq('id', id)
      .single();

    if (reimbError || !reimb) {
      return res.status(404).json({ error: 'Reembolso no encontrado' });
    }

    // Actualizar reimbursement
    const { error: updateError } = await supabase
      .from('reimbursements')
      .update({
        status,
        auditor_comment: comment || null,
        audited_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Log de auditoría
    await supabase.from('audit_logs').insert({
      reimbursement_id: id,
      actor: user.email,
      action: status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
      detail: { comment }
    });

    // TODO: Enviar notificación por email al empleado
    // await sendNotificationEmail(reimb.profiles.email, status, comment);

    return res.status(200).json({ 
      success: true,
      message: `Reembolso ${status === 'APPROVED' ? 'aprobado' : 'rechazado'} exitosamente`
    });

  } catch (error) {
    console.error('Error updating reimbursement:', error);
    return res.status(500).json({ error: error.message });
  }
}
