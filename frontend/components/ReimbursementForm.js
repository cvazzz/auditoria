import { useState, useCallback } from 'react';
import { uploadFile, createReimbursement } from '../lib/supabase';
import NotificationCenter from './NotificationCenter';

export default function ReimbursementForm() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    type: 'taxi',
    reported_amount: '',
    gasto_date: '',
    description: '', // NUEVO CAMPO
  });
  const [files, setFiles] = useState({
    transport_image: null,
    cost_screenshot: null,
    receipt: null
  });
  const [previews, setPreviews] = useState({
    transport_image: null,
    cost_screenshot: null,
    receipt: null
  });
  const [notification, setNotification] = useState(null);

  const showNotification = useCallback((payload) => {
    if (!payload) return;
    setNotification({ id: Date.now(), duration: 3200, type: 'info', ...payload });
  }, []);

  const handleFileChange = (field, file) => {
    if (!file) return;
    
    setFiles({ ...files, [field]: file });
    
    // Crear preview si es imagen
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews({ ...previews, [field]: reader.result });
      };
      reader.readAsDataURL(file);
    } else {
      setPreviews({ ...previews, [field]: '📄 PDF' });
    }
  };

  const removeFile = (field) => {
    setFiles({ ...files, [field]: null });
    setPreviews({ ...previews, [field]: null });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // Validaciones
      if (!formData.type || !formData.reported_amount || !formData.gasto_date) {
        showNotification({
          type: 'warning',
          title: 'Campos incompletos',
          message: 'Completa el tipo de gasto, monto y fecha antes de enviar.'
        });
        return;
      }

      if (!formData.description || formData.description.trim().length < 10) {
        showNotification({
          type: 'warning',
          title: 'Falta descripción',
          message: 'Por favor describe la razón del gasto (mínimo 10 caracteres).'
        });
        return;
      }

      if (!files.cost_screenshot && !files.receipt) {
        showNotification({
          type: 'warning',
          title: 'Falta evidencia',
          message: 'Sube al menos un comprobante (screenshot o recibo).'
        });
        return;
      }

      setLoading(true);

      // Subir archivos
      const urls = {};
      
      if (files.transport_image) {
        const result = await uploadFile(files.transport_image);
        if (result) urls.transport_image_url = result.path;
      }

      if (files.cost_screenshot) {
        const result = await uploadFile(files.cost_screenshot);
        if (result) urls.cost_screenshot_url = result.path;
      }

      if (files.receipt) {
        const result = await uploadFile(files.receipt);
        if (result) urls.receipt_url = result.path;
      }

      // Crear reembolso
      const response = await createReimbursement({
        ...formData,
        reported_amount: parseFloat(formData.reported_amount),
        ...urls
      });

      showNotification({
        type: 'success',
        title: '🎉 Reembolso enviado exitosamente',
        message: `Se registró la solicitud #${response.id}. Te avisaremos por email.`
      });
      
      // Reset form
      setFormData({ type: 'taxi', reported_amount: '', gasto_date: '', description: '' });
      setFiles({ transport_image: null, cost_screenshot: null, receipt: null });
      setPreviews({ transport_image: null, cost_screenshot: null, receipt: null });

    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Error al crear reembolso',
        message: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const typeIcons = {
    taxi: '🚕',
    transporte: '🚌',
    otros: '💼'
  };

  const amountValue = parseFloat(formData.reported_amount) || 0;

  return (
    <>
      <div className="max-w-4xl mx-auto">
        {/* Header con gradiente */}
        <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-t-2xl p-8 text-white shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold mb-2">💰 Nuevo Reembolso</h2>
              <p className="text-sm opacity-90">Completa el formulario para solicitar tu reembolso</p>
            </div>
            <div className="text-6xl animate-bounce">
              {typeIcons[formData.type]}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-b-2xl shadow-2xl p-8 space-y-6">
          {/* Tipo de gasto - Mejorado con cards */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-gray-900 mb-3">
              📋 Tipo de Gasto <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-4">
              {[
                { value: 'taxi', label: 'Taxi/Uber', icon: '🚕', color: 'from-yellow-400 to-orange-500' },
                { value: 'transporte', label: 'Transporte', icon: '🚌', color: 'from-blue-400 to-cyan-500' },
                { value: 'otros', label: 'Otros', icon: '💼', color: 'from-purple-400 to-pink-500' }
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, type: option.value })}
                  className={`p-6 rounded-xl border-2 transition-all transform hover:scale-105 ${
                    formData.type === option.value
                      ? `bg-gradient-to-br ${option.color} text-white border-transparent shadow-xl`
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-4xl mb-2">{option.icon}</div>
                  <div className="text-sm font-semibold">{option.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Monto - Mejorado con preview */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-gray-900">
              💵 Monto (PEN) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-2xl text-gray-400">S/</span>
              <input
                type="number"
                step="0.01"
                value={formData.reported_amount}
                onChange={(e) => setFormData({ ...formData, reported_amount: e.target.value })}
                className="w-full pl-14 pr-4 py-4 border-2 border-gray-300 rounded-xl text-2xl font-bold focus:ring-4 focus:ring-indigo-200 focus:border-indigo-500 transition-all"
                placeholder="0.00"
                required
              />
            </div>
            {amountValue > 0 && (
              <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 animate-fadeIn">
                <p className="text-sm text-green-800">
                  <span className="font-bold">Monto a reembolsar:</span> S/ {amountValue.toFixed(2)}
                </p>
              </div>
            )}
          </div>

          {/* Fecha */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-gray-900">
              📅 Fecha del Gasto <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.gasto_date}
              onChange={(e) => setFormData({ ...formData, gasto_date: e.target.value })}
              max={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-4 border-2 border-gray-300 rounded-xl text-lg focus:ring-4 focus:ring-indigo-200 focus:border-indigo-500 transition-all"
              required
            />
          </div>

          {/* NUEVO: Campo de descripción/razón del gasto */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-gray-900">
              📝 Razón del Gasto <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-4 border-2 border-gray-300 rounded-xl focus:ring-4 focus:ring-indigo-200 focus:border-indigo-500 transition-all resize-none"
              rows="4"
              placeholder="Ej: Taxi para reunión con cliente en San Isidro, desde oficina central hasta Av. Camino Real 456..."
              required
              minLength={10}
            />
            <div className="flex items-center justify-between text-xs">
              <p className="text-gray-500">
                💡 Describe el motivo del gasto (origen, destino, propósito)
              </p>
              <p className={`font-semibold ${formData.description.length < 10 ? 'text-red-500' : 'text-green-600'}`}>
                {formData.description.length} / 10 mín.
              </p>
            </div>
          </div>

          {/* Archivos con preview mejorado */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">📎 Adjuntar Comprobantes</h3>
            
            {/* Transport Image */}
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 hover:border-indigo-400 transition-all">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                🚗 Imagen del Trayecto (opcional)
              </label>
              {!previews.transport_image ? (
                <div className="space-y-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileChange('transport_image', e.target.files[0])}
                    className="w-full text-sm"
                    id="transport_image"
                  />
                  <label htmlFor="transport_image" className="block w-full bg-gray-100 hover:bg-gray-200 text-center py-4 rounded-lg cursor-pointer transition-all">
                    📸 Click para subir foto del viaje
                  </label>
                </div>
              ) : (
                <div className="relative">
                  <img src={previews.transport_image} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
                  <button
                    type="button"
                    onClick={() => removeFile('transport_image')}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600 shadow-lg"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Cost Screenshot */}
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 hover:border-indigo-400 transition-all">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                📱 Screenshot del Monto <span className="text-red-500">*</span>
              </label>
              {!previews.cost_screenshot ? (
                <div className="space-y-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileChange('cost_screenshot', e.target.files[0])}
                    className="w-full text-sm"
                    id="cost_screenshot"
                  />
                  <label htmlFor="cost_screenshot" className="block w-full bg-indigo-100 hover:bg-indigo-200 text-center py-4 rounded-lg cursor-pointer transition-all">
                    📸 Click para subir captura del app
                  </label>
                </div>
              ) : (
                <div className="relative">
                  <img src={previews.cost_screenshot} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
                  <button
                    type="button"
                    onClick={() => removeFile('cost_screenshot')}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600 shadow-lg"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Receipt */}
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 hover:border-indigo-400 transition-all">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                🧾 Recibo/Boleta (PDF o imagen)
              </label>
              {!previews.receipt ? (
                <div className="space-y-3">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => handleFileChange('receipt', e.target.files[0])}
                    className="w-full text-sm"
                    id="receipt"
                  />
                  <label htmlFor="receipt" className="block w-full bg-gray-100 hover:bg-gray-200 text-center py-4 rounded-lg cursor-pointer transition-all">
                    📄 Click para subir recibo
                  </label>
                </div>
              ) : (
                <div className="relative">
                  {previews.receipt === '📄 PDF' ? (
                    <div className="bg-gray-100 p-8 rounded-lg text-center">
                      <div className="text-6xl mb-2">📄</div>
                      <p className="font-semibold">PDF Cargado</p>
                    </div>
                  ) : (
                    <img src={previews.receipt} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeFile('receipt')}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600 shadow-lg"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Submit Button - Mejorado */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white py-6 px-6 rounded-xl font-bold text-lg hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl transform transition-all hover:scale-105 disabled:hover:scale-100"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-3">
                <span className="animate-spin text-2xl">⏳</span>
                Procesando reembolso...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-3">
                <span className="text-2xl">🚀</span>
                Enviar Solicitud de Reembolso
              </span>
            )}
          </button>

          {/* Info adicional */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
            <p className="text-xs text-blue-800">
              <span className="font-bold">ℹ️ Nota:</span> Tu solicitud será procesada automáticamente por IA y luego revisada por un auditor. Recibirás una notificación por email con el resultado.
            </p>
          </div>
        </form>
      </div>
      
      <NotificationCenter
        notification={notification}
        onClose={() => setNotification(null)}
      />
    </>
  );
}
