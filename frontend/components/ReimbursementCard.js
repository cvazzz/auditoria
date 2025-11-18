export default function ReimbursementCard({ reimbursement }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'APPROVED': return 'bg-green-100 text-green-800';
      case 'REJECTED': return 'bg-red-100 text-red-800';
      case 'PENDING_AUDIT': return 'bg-yellow-100 text-yellow-800';
      case 'PENDING_OCR': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getAIResultColor = (result) => {
    switch (result) {
      case 'COINCIDE': return 'text-green-600';
      case 'NO_COINCIDE': return 'text-red-600';
      case 'DUDOSO': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold">{reimbursement.type}</h3>
          <p className="text-sm text-gray-500">
            {new Date(reimbursement.created_at).toLocaleDateString()}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(reimbursement.status)}`}>
          {reimbursement.status}
        </span>
      </div>

      {/* Amounts */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-500">Monto Declarado</p>
          <p className="text-xl font-bold">S/ {reimbursement.reported_amount}</p>
        </div>
        {reimbursement.detected_amount && (
          <div>
            <p className="text-xs text-gray-500">Monto Detectado</p>
            <p className="text-xl font-bold">S/ {reimbursement.detected_amount}</p>
          </div>
        )}
      </div>

      {/* AI Result */}
      {reimbursement.ai_result && (
        <div className="mb-4">
          <p className="text-xs text-gray-500">Resultado IA</p>
          <div className="flex items-center justify-between">
            <span className={`font-medium ${getAIResultColor(reimbursement.ai_result)}`}>
              {reimbursement.ai_result}
            </span>
            {reimbursement.ai_confidence && (
              <span className="text-sm text-gray-600">
                Confianza: {(reimbursement.ai_confidence * 100).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* Employee Info (for auditors) */}
      {reimbursement.profiles && (
        <div className="border-t pt-4 mt-4">
          <p className="text-xs text-gray-500">Empleado</p>
          <p className="font-medium">{reimbursement.profiles.full_name}</p>
          <p className="text-sm text-gray-600">{reimbursement.profiles.zone}</p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4">
        <a
          href={`/reimbursements/${reimbursement.id}`}
          className="text-blue-500 hover:text-blue-700 text-sm font-medium"
        >
          Ver Detalles →
        </a>
      </div>
    </div>
  );
}
