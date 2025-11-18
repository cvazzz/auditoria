import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Sube un archivo a Supabase Storage
 * @param {File} file - Archivo a subir
 * @param {string} bucket - Nombre del bucket
 * @param {string} path - Ruta dentro del bucket
 * @returns {Promise<{url: string, path: string}|null>}
 */
export async function uploadFile(file, bucket = 'reimbursements', path = '') {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = path ? `${path}/${fileName}` : fileName;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file);

    if (error) throw error;

    // Para buckets privados, guardamos la ruta completa
    // El agent usará el service key para acceder
    const fullUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${filePath}`;

    return {
      url: filePath, // Guardamos solo la ruta, el agent construirá la URL completa
      path: filePath,
      fullUrl: fullUrl // URL completa para referencia
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    return null;
  }
}

/**
 * Crea un nuevo reembolso
 */
export async function createReimbursement(data) {
  try {
    const response = await fetch('/api/reimbursements/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error creating reimbursement');
    }

    return await response.json();
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

/**
 * Obtiene un reembolso por ID
 */
export async function getReimbursement(id) {
  try {
    const response = await fetch(`/api/reimbursements/${id}`, {
      headers: {
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
      }
    });

    if (!response.ok) {
      throw new Error('Error fetching reimbursement');
    }

    return await response.json();
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

/**
 * Audita un reembolso (aprobar/rechazar)
 */
export async function auditReimbursement(id, status, comment) {
  try {
    const response = await fetch(`/api/audit/${id}/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
      },
      body: JSON.stringify({ status, comment })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error auditing reimbursement');
    }

    return await response.json();
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}
