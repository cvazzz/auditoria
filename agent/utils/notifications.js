const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL = process.env.NOTIFICATION_FROM_EMAIL || 'noreply@auditoria.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * Envía notificación al auditor cuando hay un reembolso pendiente
 */
async function notifyAuditorPendingReimbursement(reimbursement, auditorEmail) {
  if (!resend) {
    console.warn('[Notifications] RESEND_API_KEY no configurada - saltando email');
    return false;
  }

  try {
    const subject = `Nuevo reembolso para auditoría: ${reimbursement.type} - ${reimbursement.reported_amount}`;
    
    const html = `
      <h2>Nuevo Reembolso Pendiente de Auditoría</h2>
      
      <p><strong>Estado AI:</strong> ${reimbursement.ai_result || 'N/A'}</p>
      <p><strong>Confianza:</strong> ${reimbursement.ai_confidence ? (reimbursement.ai_confidence * 100).toFixed(2) + '%' : 'N/A'}</p>
      
      <hr/>
      
      <h3>Detalles del Reembolso</h3>
      <ul>
        <li><strong>ID:</strong> ${reimbursement.id}</li>
        <li><strong>Empleado:</strong> ${reimbursement.profiles?.full_name || 'N/A'} (${reimbursement.profiles?.email || 'N/A'})</li>
        <li><strong>Zona:</strong> ${reimbursement.profiles?.zone || 'N/A'}</li>
        <li><strong>Tipo:</strong> ${reimbursement.type}</li>
        <li><strong>Monto Declarado:</strong> ${reimbursement.reported_amount}</li>
        <li><strong>Monto Detectado:</strong> ${reimbursement.detected_amount || 'No detectado'}</li>
        <li><strong>Fecha del Gasto:</strong> ${reimbursement.gasto_date || 'N/A'}</li>
      </ul>
      
      ${reimbursement.ai_result === 'NO_COINCIDE' ? '<p style="color: red;"><strong>⚠️ ALERTA: Los montos NO coinciden</strong></p>' : ''}
      ${reimbursement.ai_result === 'DUDOSO' ? '<p style="color: orange;"><strong>⚠️ ATENCIÓN: Caso dudoso, requiere revisión manual</strong></p>' : ''}
      
      <hr/>
      
      <p>
        <a href="${FRONTEND_URL}/audit/${reimbursement.id}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          Revisar Reembolso
        </a>
      </p>
      
      <p style="color: #666; font-size: 12px;">
        Este es un mensaje automático del Sistema de Auditoría de Reembolsos.
      </p>
    `;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: auditorEmail,
      subject,
      html
    });

    if (error) {
      console.error('[Notifications] Error enviando email:', error);
      return false;
    }

    console.log(`[Notifications] Email enviado a ${auditorEmail}:`, data.id);
    return true;

  } catch (error) {
    console.error('[Notifications] Error:', error);
    return false;
  }
}

/**
 * Envía notificación al empleado cuando su reembolso es aprobado/rechazado
 */
async function notifyEmployeeDecision(reimbursement, status, comment) {
  if (!resend) {
    console.warn('[Notifications] RESEND_API_KEY no configurada - saltando email');
    return false;
  }

  try {
    const isApproved = status === 'APPROVED';
    const subject = `Reembolso ${isApproved ? 'Aprobado' : 'Rechazado'}: ${reimbursement.type}`;
    
    const html = `
      <h2>Actualización de tu Reembolso</h2>
      
      <p>Hola ${reimbursement.profiles?.full_name || 'Empleado'},</p>
      
      <p>Tu reembolso ha sido <strong style="color: ${isApproved ? 'green' : 'red'};">
        ${isApproved ? 'APROBADO' : 'RECHAZADO'}
      </strong></p>
      
      <hr/>
      
      <h3>Detalles del Reembolso</h3>
      <ul>
        <li><strong>Tipo:</strong> ${reimbursement.type}</li>
        <li><strong>Monto:</strong> ${reimbursement.detected_amount || reimbursement.reported_amount}</li>
        <li><strong>Fecha del Gasto:</strong> ${reimbursement.gasto_date || 'N/A'}</li>
        <li><strong>Estado:</strong> ${status}</li>
      </ul>
      
      ${comment ? `
        <h3>Comentarios del Auditor</h3>
        <p style="background-color: #f5f5f5; padding: 10px; border-left: 3px solid #ccc;">
          ${comment}
        </p>
      ` : ''}
      
      <hr/>
      
      <p>
        <a href="${FRONTEND_URL}/reimbursements/${reimbursement.id}" style="background-color: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          Ver Detalles
        </a>
      </p>
      
      ${!isApproved ? `
        <p style="color: #666;">
          Si tienes dudas sobre esta decisión, por favor contacta a tu supervisor o al departamento de auditoría.
        </p>
      ` : ''}
      
      <p style="color: #666; font-size: 12px;">
        Este es un mensaje automático del Sistema de Auditoría de Reembolsos.
      </p>
    `;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: reimbursement.profiles?.email,
      subject,
      html
    });

    if (error) {
      console.error('[Notifications] Error enviando email:', error);
      return false;
    }

    console.log(`[Notifications] Email enviado a ${reimbursement.profiles?.email}:`, data.id);
    return true;

  } catch (error) {
    console.error('[Notifications] Error:', error);
    return false;
  }
}

/**
 * Envía reporte semanal a los auditores
 */
async function sendWeeklyReport(auditorsEmails, stats) {
  if (!resend) {
    console.warn('[Notifications] RESEND_API_KEY no configurada - saltando email');
    return false;
  }

  try {
    const subject = `Reporte Semanal de Reembolsos - Semana ${stats.week}`;
    
    const html = `
      <h2>Reporte Semanal de Reembolsos</h2>
      
      <p><strong>Período:</strong> ${stats.from} - ${stats.to}</p>
      
      <hr/>
      
      <h3>Resumen General</h3>
      <ul>
        <li><strong>Total de reembolsos:</strong> ${stats.total}</li>
        <li><strong>Monto total:</strong> ${stats.total_amount.toFixed(2)}</li>
        <li><strong>Aprobados:</strong> ${stats.approved} (${((stats.approved / stats.total) * 100).toFixed(1)}%)</li>
        <li><strong>Rechazados:</strong> ${stats.rejected} (${((stats.rejected / stats.total) * 100).toFixed(1)}%)</li>
        <li><strong>Pendientes:</strong> ${stats.pending}</li>
      </ul>
      
      <h3>Por Zona</h3>
      <table style="border-collapse: collapse; width: 100%;">
        <tr style="background-color: #f2f2f2;">
          <th style="border: 1px solid #ddd; padding: 8px;">Zona</th>
          <th style="border: 1px solid #ddd; padding: 8px;">Cantidad</th>
          <th style="border: 1px solid #ddd; padding: 8px;">Monto Total</th>
        </tr>
        ${Object.entries(stats.by_zone).map(([zone, data]) => `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${zone}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${data.count}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${data.total.toFixed(2)}</td>
          </tr>
        `).join('')}
      </table>
      
      <h3>Precisión de IA</h3>
      <ul>
        <li><strong>Coincidentes:</strong> ${stats.ai_coincide} (${((stats.ai_coincide / stats.total) * 100).toFixed(1)}%)</li>
        <li><strong>Dudosos:</strong> ${stats.ai_dudoso} (${((stats.ai_dudoso / stats.total) * 100).toFixed(1)}%)</li>
        <li><strong>No coincidentes:</strong> ${stats.ai_no_coincide} (${((stats.ai_no_coincide / stats.total) * 100).toFixed(1)}%)</li>
      </ul>
      
      <hr/>
      
      <p>
        <a href="${FRONTEND_URL}/reports" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          Ver Reporte Completo
        </a>
      </p>
      
      <p style="color: #666; font-size: 12px;">
        Este es un mensaje automático del Sistema de Auditoría de Reembolsos.
      </p>
    `;

    // Enviar a todos los auditores
    const promises = auditorsEmails.map(email =>
      resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject,
        html
      })
    );

    await Promise.all(promises);
    console.log(`[Notifications] Reporte semanal enviado a ${auditorsEmails.length} auditores`);
    return true;

  } catch (error) {
    console.error('[Notifications] Error:', error);
    return false;
  }
}

module.exports = {
  notifyAuditorPendingReimbursement,
  notifyEmployeeDecision,
  sendWeeklyReport
};
