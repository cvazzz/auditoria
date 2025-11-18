import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { getReimbursement } from '../../lib/supabase';
import Image from 'next/image';
import NotificationCenter from '../../components/NotificationCenter';

export default function ReimbursementDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [reimbursement, setReimbursement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  const showNotification = useCallback((payload) => {
    if (!payload) return;
    setNotification({ id: Date.now(), duration: 3200, type: 'info', ...payload });
  }, []);

  const loadReimbursement = useCallback(async () => {
    try {
      const data = await getReimbursement(id);
      setReimbursement(data);
    } catch (error) {
      console.error('Error:', error);
      showNotification({
        type: 'error',
        title: 'No se pudo cargar el reembolso',
        message: 'Intenta recargar la página o vuelve al dashboard.'
      });
    } finally {
      setLoading(false);
    }
  }, [id, showNotification]);

  useEffect(() => {
    if (id) {
      loadReimbursement();
    }
  }, [id, loadReimbursement]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!reimbursement) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold mb-2">Reembolso no encontrado</h2>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-blue-500 hover:text-blue-700"
          >
            Volver al Dashboard
          </button>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    const styles = {
      PENDING_OCR: 'bg-blue-100 text-blue-800',
      PENDING_AUDIT: 'bg-yellow-100 text-yellow-800',
      APPROVED: 'bg-green-100 text-green-800',
      REJECTED: 'bg-red-100 text-red-800'
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const getAIResultColor = (result) => {
    const colors = {
      COINCIDE: 'text-green-600',
      DUDOSO: 'text-orange-600',
      NO_COINCIDE: 'text-red-600'
    };
    return colors[result] || 'text-gray-600';
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-900">Detalle del Reembolso</h1>
              <button
                onClick={() => router.push('/dashboard')}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Volver
              </button>
            </div>
          </div>
        </nav>

        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            {/* Header Card */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {reimbursement.type.toUpperCase()}
                  </h2>
                  <p className="text-gray-600">ID: {reimbursement.id}</p>
                </div>
                <span className={`px-4 py-2 rounded-full text-sm font-medium ${getStatusBadge(reimbursement.status)}`}>
                  {reimbursement.status}
                </span>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-gray-700 mb-3">Información del Empleado</h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium">Nombre:</span> {reimbursement.profiles?.full_name}</p>
                    <p><span className="font-medium">Email:</span> {reimbursement.profiles?.email}</p>
                    <p><span className="font-medium">Zona:</span> {reimbursement.profiles?.zone}</p>
                    <p><span className="font-medium">DNI:</span> {reimbursement.profiles?.dni || 'N/A'}</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-700 mb-3">Información del Gasto</h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium">Fecha del gasto:</span> {reimbursement.gasto_date || 'N/A'}</p>
                    <p><span className="font-medium">Fecha de solicitud:</span> {new Date(reimbursement.created_at).toLocaleString()}</p>
                    {reimbursement.audited_at && (
                      <p><span className="font-medium">Fecha de auditoría:</span> {new Date(reimbursement.audited_at).toLocaleString()}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Amounts Card */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h3 className="font-semibold text-gray-700 mb-4">Montos</h3>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="border-l-4 border-blue-500 pl-4">
                  <p className="text-sm text-gray-600 mb-1">Monto Declarado</p>
                  <p className="text-3xl font-bold text-gray-900">
                    S/ {reimbursement.reported_amount}
                  </p>
                </div>

                {reimbursement.detected_amount && (
                  <div className="border-l-4 border-purple-500 pl-4">
                    <p className="text-sm text-gray-600 mb-1">Monto Detectado (IA)</p>
                    <p className="text-3xl font-bold text-gray-900">
                      S/ {reimbursement.detected_amount}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {reimbursement.detected_currency || 'PEN'}
                    </p>
                  </div>
                )}

                {reimbursement.detected_amount && (
                  <div className="border-l-4 border-orange-500 pl-4">
                    <p className="text-sm text-gray-600 mb-1">Diferencia</p>
                    <p className="text-3xl font-bold text-gray-900">
                      S/ {Math.abs(reimbursement.reported_amount - reimbursement.detected_amount).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {((Math.abs(reimbursement.reported_amount - reimbursement.detected_amount) / reimbursement.reported_amount) * 100).toFixed(2)}% diferencia
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* AI Analysis Card */}
            {reimbursement.ai_result && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h3 className="font-semibold text-gray-700 mb-4">Análisis de IA</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Resultado</p>
                    <p className={`text-2xl font-bold ${getAIResultColor(reimbursement.ai_result)}`}>
                      {reimbursement.ai_result}
                    </p>
                  </div>
                  {reimbursement.ai_confidence && (
                    <div>
                      <p className="text-sm text-gray-600 mb-2">Confianza del Sistema</p>
                      <div className="flex items-center">
                        <div className="flex-1 bg-gray-200 rounded-full h-4 mr-3">
                          <div
                            className="bg-blue-500 h-4 rounded-full"
                            style={{ width: `${reimbursement.ai_confidence * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-xl font-bold">
                          {(reimbursement.ai_confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Evidence Card */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h3 className="font-semibold text-gray-700 mb-4">Evidencias</h3>
              <div className="grid md:grid-cols-3 gap-4">
                {reimbursement.signed_urls?.transport_image && (
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Imagen del Trayecto</p>
                    <a
                      href={reimbursement.signed_urls.transport_image}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <div className="relative w-full h-48">
                        <Image
                          src={reimbursement.signed_urls.transport_image}
                          alt="Transport"
                          fill
                          sizes="(max-width: 768px) 100vw, 33vw"
                          className="rounded border object-cover hover:opacity-80"
                          unoptimized
                        />
                      </div>
                    </a>
                  </div>
                )}

                {reimbursement.signed_urls?.cost_screenshot && (
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Screenshot del Monto</p>
                    <a
                      href={reimbursement.signed_urls.cost_screenshot}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <div className="relative w-full h-48">
                        <Image
                          src={reimbursement.signed_urls.cost_screenshot}
                          alt="Cost Screenshot"
                          fill
                          sizes="(max-width: 768px) 100vw, 33vw"
                          className="rounded border object-cover hover:opacity-80"
                          unoptimized
                        />
                      </div>
                    </a>
                  </div>
                )}

                {reimbursement.signed_urls?.receipt && (
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Recibo/Boleta</p>
                    <a
                      href={reimbursement.signed_urls.receipt}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block bg-gray-100 h-48 rounded border hover:bg-gray-200 flex items-center justify-center"
                    >
                      <div className="text-center">
                        <div className="text-4xl mb-2">📄</div>
                        <p className="text-sm text-gray-600">Ver Recibo</p>
                      </div>
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Comments Card */}
            {reimbursement.auditor_comment && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="font-semibold text-gray-700 mb-4">Comentarios del Auditor</h3>
                <div className="bg-gray-50 p-4 rounded border-l-4 border-blue-500">
                  <p className="text-gray-800">{reimbursement.auditor_comment}</p>
                </div>
              </div>
            )}
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
