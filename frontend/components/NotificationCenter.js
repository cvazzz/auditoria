import { useEffect } from 'react';

const ICONS = {
  success: '✅',
  error: '⛔',
  warning: '⚠️',
  info: 'ℹ️'
};

const TYPE_STYLES = {
  success: 'bg-green-50 border-green-200 text-green-900',
  error: 'bg-red-50 border-red-200 text-red-900',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-900',
  info: 'bg-blue-50 border-blue-200 text-blue-900'
};

export default function NotificationCenter({ notification, onClose }) {
  useEffect(() => {
    if (!notification) return;

    const timer = setTimeout(() => {
      if (onClose) onClose();
    }, notification.duration || 3200);

    return () => clearTimeout(timer);
  }, [notification, onClose]);

  if (!notification) return null;

  const { type = 'info', title, message } = notification;
  const icon = ICONS[type] || ICONS.info;
  const styles = TYPE_STYLES[type] || TYPE_STYLES.info;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative z-10 w-full max-w-md rounded-2xl border shadow-2xl p-6 backdrop-blur-sm ${styles}`}
      >
        <div className="flex items-start space-x-3">
          <div className="text-3xl" aria-hidden="true">
            {icon}
          </div>
          <div className="flex-1">
            {title && (
              <p className="text-lg font-semibold leading-tight">
                {title}
              </p>
            )}
            {message && (
              <p className="mt-1 text-sm leading-relaxed">
                {message}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar notificación"
            className="text-xl leading-none text-current hover:opacity-70"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
