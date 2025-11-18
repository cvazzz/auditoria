import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { from, to, zone, status } = req.query;

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
      return res.status(403).json({ error: 'No tiene permisos para ver reportes' });
    }

    // Construir query
    let query = supabase
      .from('reimbursements')
      .select(`
        *,
        profiles (
          full_name,
          zone,
          email
        )
      `);

    // Aplicar filtros
    if (from) {
      query = query.gte('created_at', from);
    }
    if (to) {
      query = query.lte('created_at', to);
    }
    if (zone) {
      query = query.eq('profiles.zone', zone);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    // Calcular estadísticas
    const stats = {
      total: data.length,
      total_amount: data.reduce((sum, r) => sum + (parseFloat(r.detected_amount || r.reported_amount)), 0),
      approved: data.filter(r => r.status === 'APPROVED').length,
      rejected: data.filter(r => r.status === 'REJECTED').length,
      pending_ocr: data.filter(r => r.status === 'PENDING_OCR').length,
      pending_audit: data.filter(r => r.status === 'PENDING_AUDIT').length,
      by_zone: {},
      by_type: {},
      by_ai_result: {
        COINCIDE: data.filter(r => r.ai_result === 'COINCIDE').length,
        DUDOSO: data.filter(r => r.ai_result === 'DUDOSO').length,
        NO_COINCIDE: data.filter(r => r.ai_result === 'NO_COINCIDE').length
      }
    };

    // Agrupar por zona
    data.forEach(r => {
      const zone = r.profiles?.zone || 'Sin zona';
      if (!stats.by_zone[zone]) {
        stats.by_zone[zone] = { count: 0, total_amount: 0 };
      }
      stats.by_zone[zone].count++;
      stats.by_zone[zone].total_amount += parseFloat(r.detected_amount || r.reported_amount);
    });

    // Agrupar por tipo
    data.forEach(r => {
      if (!stats.by_type[r.type]) {
        stats.by_type[r.type] = { count: 0, total_amount: 0 };
      }
      stats.by_type[r.type].count++;
      stats.by_type[r.type].total_amount += parseFloat(r.detected_amount || r.reported_amount);
    });

    return res.status(200).json({ 
      data,
      stats
    });

  } catch (error) {
    console.error('Error fetching reports:', error);
    return res.status(500).json({ error: error.message });
  }
}
