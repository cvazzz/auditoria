import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/router';
import ReimbursementForm from '../components/ReimbursementForm';
import ReimbursementCard from '../components/ReimbursementCard';

export default function Home() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setUser(session.user);
        
        // Obtener perfil para validar rol
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        
        setProfile(profileData);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error checking user:', error);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl font-bold text-gray-900 mb-4">
              Sistema de Auditoría de Reembolsos
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              Procesamiento inteligente con IA para validación automática de gastos
            </p>
            
            <div className="grid md:grid-cols-3 gap-6 my-12">
              <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="text-4xl mb-4">🔍</div>
                <h3 className="font-bold text-lg mb-2">OCR Inteligente</h3>
                <p className="text-gray-600 text-sm">
                  Tesseract, Hugging Face y Gemini Vision
                </p>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="text-4xl mb-4">✓</div>
                <h3 className="font-bold text-lg mb-2">Validación Automática</h3>
                <p className="text-gray-600 text-sm">
                  Comparación de montos con 3% de tolerancia
                </p>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="text-4xl mb-4">📊</div>
                <h3 className="font-bold text-lg mb-2">Reportes en Tiempo Real</h3>
                <p className="text-gray-600 text-sm">
                  Estadísticas por zona, tipo y período
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <button
                onClick={() => router.push('/login')}
                className="bg-blue-500 text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-blue-600 transition"
              >
                Iniciar Sesión
              </button>
              
              <p className="text-sm text-gray-500">
                ¿No tienes cuenta? Contacta a tu administrador
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Auditoría de Reembolsos</h1>
            <div className="flex items-center space-x-4">
              <span className="text-gray-600">{user.email}</span>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  setUser(null);
                }}
                className="text-red-500 hover:text-red-700"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-white p-4 rounded-lg shadow hover:shadow-md transition"
          >
            <div className="text-3xl mb-2">📋</div>
            <h3 className="font-semibold">Mis Reembolsos</h3>
            <p className="text-sm text-gray-600">Ver historial</p>
          </button>
          
          {profile?.role !== 'auditor' && (
            <button
              onClick={() => router.push('/reimbursements/new')}
              className="bg-blue-500 text-white p-4 rounded-lg shadow hover:shadow-md transition"
            >
              <div className="text-3xl mb-2">➕</div>
              <h3 className="font-semibold">Nuevo Reembolso</h3>
              <p className="text-sm">Solicitar gasto</p>
            </button>
          )}
          
          {(profile?.role === 'auditor' || profile?.role === 'admin') && (
            <button
              onClick={() => router.push('/audit')}
              className="bg-green-500 text-white p-4 rounded-lg shadow hover:shadow-md transition"
            >
              <div className="text-3xl mb-2">✓</div>
              <h3 className="font-semibold">Auditoría</h3>
              <p className="text-sm">Revisar pendientes</p>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
