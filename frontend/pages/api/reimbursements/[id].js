import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

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
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    // Obtener reimbursement
    let query = supabase
      .from('reimbursements')
      .select('*, profiles(*)')
      .eq('id', id);

    // Si no es auditor/admin, solo puede ver sus propios reembolsos
    if (profile.role !== 'auditor' && profile.role !== 'admin') {
      query = query.eq('profile_id', user.id);
    }

    const { data, error } = await query.single();

    if (error) {
      return res.status(404).json({ error: 'Reembolso no encontrado' });
    }

    // Generar URLs firmadas para archivos privados
    const signedUrls = {};
    
    if (data.transport_image_url) {
      const { data: signedData } = await supabase.storage
        .from('reimbursements')
        .createSignedUrl(data.transport_image_url, 3600);
      signedUrls.transport_image = signedData?.signedUrl;
    }

    if (data.cost_screenshot_url) {
      const { data: signedData } = await supabase.storage
        .from('reimbursements')
        .createSignedUrl(data.cost_screenshot_url, 3600);
      signedUrls.cost_screenshot = signedData?.signedUrl;
    }

    if (data.receipt_url) {
      const { data: signedData } = await supabase.storage
        .from('reimbursements')
        .createSignedUrl(data.receipt_url, 3600);
      signedUrls.receipt = signedData?.signedUrl;
    }

    return res.status(200).json({ 
      ...data,
      signed_urls: signedUrls
    });

  } catch (error) {
    console.error('Error fetching reimbursement:', error);
    return res.status(500).json({ error: error.message });
  }
}
