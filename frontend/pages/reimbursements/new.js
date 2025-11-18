import { useRouter } from 'next/router';
import ReimbursementForm from '../../components/ReimbursementForm';
import { supabase } from '../../lib/supabase';
import { useState, useEffect, useCallback } from 'react';
import NotificationCenter from '../../components/NotificationCenter';

export default function NewReimbursement() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [notification, setNotification] = useState(null);

  const showNotification = useCallback((payload) => {
    if (!payload) return;
    setNotification({ id: Date.now(), duration: 3200, type: 'info', ...payload });
  }, []);

  const checkUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      router.push('/login');
      return;
    }

    setUser(session.user);

    const { data: profileData, error } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', session.user.id)
      .single();

    if (error) {
      console.error('Error al obtener perfil:', error);
      showNotification({
        type: 'error',
        title: 'No se pudo verificar el perfil',
        message: 'Intenta nuevamente en unos segundos.'
      });
      router.push('/dashboard');
      return;
    }

    const normalizedRole = profileData?.role?.toLowerCase?.();
    setProfile({ ...profileData, role: normalizedRole });

    if (normalizedRole === 'auditor') {
      showNotification({
        type: 'warning',
        title: 'Acceso restringido',
        message: 'Los auditores no pueden crear reembolsos desde este módulo.'
      });
      router.push('/audit');
    }
  }, [router, showNotification]);

  useEffect(() => {
    checkUser();
  }, [checkUser]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Nuevo Reembolso</h1>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Volver al Dashboard
              </button>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push('/login');
                }}
                className="text-red-500 hover:text-red-700"
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-900 mb-2">📝 Instrucciones</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Completa todos los campos obligatorios (*)</li>
              <li>• Sube al menos un comprobante (screenshot o recibo)</li>
              <li>• Para taxis, se recomienda subir también la foto del trayecto</li>
              <li>• El sistema procesará automáticamente con IA (Tesseract, HuggingFace, Gemini)</li>
              <li>• Recibirás un email cuando sea aprobado o rechazado</li>
            </ul>
          </div>

          <ReimbursementForm />
        </div>
      </div>
      </div>
      <NotificationCenter
        notification={notification}
        onClose={() => setNotification(null)}
      />
    </>
  );
}
