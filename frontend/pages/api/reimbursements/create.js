import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, reported_amount, gasto_date, description } = req.body;
    
    // Validaciones
    if (!type || !reported_amount || !gasto_date) {
      return res.status(400).json({ 
        error: 'Campos obligatorios: type, reported_amount, gasto_date' 
      });
    }

    if (!description || description.trim().length < 10) {
      return res.status(400).json({ 
        error: 'El campo descripción es obligatorio y debe tener al menos 10 caracteres' 
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

    // Obtener perfil del usuario
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    // Bloquear a auditores de crear reembolsos (regla de negocio)
    const normalizedRole = (profile.role || '').toString().toLowerCase();
    if (normalizedRole === 'auditor') {
      return res.status(403).json({ error: 'Acceso denegado: los auditores no pueden crear reembolsos' });
    }

    // Crear reimbursement
    const { data, error } = await supabase
      .from('reimbursements')
      .insert({
        profile_id: profile.id,
        type,
        reported_amount: parseFloat(reported_amount),
        gasto_date,
        description: description.trim(), // NUEVO CAMPO
        transport_image_url: req.body.transport_image_url || null,
        cost_screenshot_url: req.body.cost_screenshot_url || null,
        receipt_url: req.body.receipt_url || null,
        status: 'PENDING_OCR'
      })
      .select()
      .single();

    if (error) throw error;

    // Log de auditoría
    await supabase.from('audit_logs').insert({
      reimbursement_id: data.id,
      actor: profile.email,
      action: 'CREATED',
      detail: { type, reported_amount, gasto_date, description }
    });

    return res.status(201).json({ 
      success: true, 
      id: data.id,
      message: 'Reembolso creado exitosamente'
    });

  } catch (error) {
    console.error('Error creating reimbursement:', error);
    return res.status(500).json({ error: error.message });
  }
}
