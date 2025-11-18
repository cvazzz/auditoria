import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/router';
import ReimbursementCard from '../components/ReimbursementCard';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import NotificationCenter from '../components/NotificationCenter';

const createInitialSupervisorStats = () => ({
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  processing: 0,
  totalAmount: 0,
  monthlyData: [],
  typeStats: []
});

const PIE_COLORS = ['#3b82f6', '#10b981', '#6366f1'];

const SIDEBAR_ITEMS = [
  { id: 'profile', label: 'Mi Perfil', description: 'Datos de contacto y zona', icon: '👤' },
  { id: 'settings', label: 'Configuraciones', description: 'Preferencias del panel', icon: '⚙️' },
  { id: 'statistics', label: 'Estadísticas', description: 'Resumen de actividad', icon: '�' },
  { id: 'support', label: 'Soporte', description: 'Ayuda y reportes', icon: '🆘' }
];

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [reimbursements, setReimbursements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all'); // 🆕 Filtro temporal
  const [showSupervisorDashboard, setShowSupervisorDashboard] = useState(false);
  const [stats, setStats] = useState(() => createInitialSupervisorStats());
  const [notification, setNotification] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState('profile');
  const [supervisorDirectory, setSupervisorDirectory] = useState([]);
  const [preferences, setPreferences] = useState({
    autoOpenDashboard: true,
    notifyDecisions: true,
    highlightCollaborators: true
  });
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    zone: '',
    phone: ''
  });
  const [supportForm, setSupportForm] = useState({
    subject: '',
    message: '',
    priority: 'normal'
  });
  const [sendingSupport, setSendingSupport] = useState(false);
  const router = useRouter();
  const sidebarMenu = useMemo(() => SIDEBAR_ITEMS, []);
  const showNotification = useCallback((payload) => {
    if (!payload) return;
    setNotification({
      id: Date.now(),
      duration: 3200,
      type: 'info',
      ...payload
    });
  }, []);
  const isSupervisor = profile?.role === 'supervisor';
  const canSeeSidebar = isSupervisor || profile?.role === 'admin';
  const togglePreference = useCallback((key) => {
    setPreferences((prev) => {
      const newPrefs = {
        ...prev,
        [key]: !prev[key]
      };
      // Guardar en localStorage
      localStorage.setItem('dashboard_preferences', JSON.stringify(newPrefs));
      
      showNotification({
        type: 'success',
        title: 'Preferencia actualizada',
        message: `${key === 'autoOpenDashboard' ? 'Vista por defecto' : key === 'notifyDecisions' ? 'Notificaciones' : 'Destacar colaboradores'} ${newPrefs[key] ? 'activado' : 'desactivado'}`
      });
      
      return newPrefs;
    });
  }, [showNotification]);

  useEffect(() => {
    // Cargar preferencias desde localStorage
    const savedPrefs = localStorage.getItem('dashboard_preferences');
    if (savedPrefs) {
      try {
        setPreferences(JSON.parse(savedPrefs));
      } catch (error) {
        console.error('Error loading preferences:', error);
      }
    }
  }, []);

  useEffect(() => {
    // Aplicar preferencia de autoOpenDashboard
    if (profile && preferences.autoOpenDashboard && isSupervisor) {
      setShowSupervisorDashboard(true);
    }
  }, [profile, preferences.autoOpenDashboard, isSupervisor]);

  const handleProfileUpdate = useCallback(async () => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profileForm.full_name,
          zone: profileForm.zone,
          phone: profileForm.phone
        })
        .eq('id', profile.id);

      if (error) throw error;

      setProfile({ ...profile, ...profileForm });
      setEditingProfile(false);
      showNotification({
        type: 'success',
        title: 'Perfil actualizado',
        message: 'Tus datos se han guardado correctamente'
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      showNotification({
        type: 'error',
        title: 'Error al actualizar',
        message: error.message
      });
    }
  }, [profileForm, profile, showNotification]);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || '',
        zone: profile.zone || '',
        phone: profile.phone || ''
      });
    }
  }, [profile]);

  const checkUser = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push('/login');
        return;
      }

      setUser(session.user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      const normalizedRole = profileData?.role?.toLowerCase?.();

      if (normalizedRole === 'auditor') {
        showNotification({
          type: 'warning',
          title: 'Panel de auditoría',
          message: 'Los auditores deben continuar en el panel especializado.'
        });
        router.push('/audit');
        return;
      }

      setProfile(profileData ? { ...profileData, role: normalizedRole } : null);
      setLoading(false);
    } catch (error) {
      console.error('Error:', error);
      router.push('/login');
    }
  }, [router, showNotification]);

  const loadReimbursements = useCallback(async () => {
    if (!profile) return;

    try {
      let query = supabase
        .from('reimbursements')
        .select('*, profiles(*)');

      if (profile.role !== 'auditor' && profile.role !== 'admin') {
        query = query.eq('profile_id', profile.id);
      }

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      let filtered = data || [];

      // 🆕 Aplicar filtro temporal
      if (dateFilter !== 'all') {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        filtered = filtered.filter(r => {
          const createdDate = new Date(r.created_at);
          
          if (dateFilter === 'week') {
            const weekAgo = new Date(startOfDay);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return createdDate >= weekAgo;
          } else if (dateFilter === 'month') {
            const monthAgo = new Date(startOfDay);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return createdDate >= monthAgo;
          }
          return true;
        });
      }

      setReimbursements(filtered);
    } catch (error) {
      console.error('Error loading reimbursements:', error);
      showNotification({
        type: 'error',
        title: 'No se pudieron cargar los reembolsos',
        message: error.message
      });
    }
  }, [profile, filter, dateFilter, showNotification]);

  const calculateStats = useCallback(() => {
    if (!isSupervisor) {
      setStats(createInitialSupervisorStats());
      return;
    }

    const safeAmount = (value) => Number(value) || 0;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(currentYear, currentMonth - i, 1);
      const monthLabel = targetDate.toLocaleDateString('es-ES', { month: 'short' });
      const monthItems = reimbursements.filter((r) => {
        const created = new Date(r.created_at);
        return (
          created.getMonth() === targetDate.getMonth() &&
          created.getFullYear() === targetDate.getFullYear()
        );
      });

      monthlyData.push({
        month: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
        aprobados: monthItems.filter((r) => r.status === 'APPROVED').length,
        rechazados: monthItems.filter((r) => r.status === 'REJECTED').length,
        pendientes: monthItems.filter((r) => r.status === 'PENDING_AUDIT').length,
        monto: monthItems.reduce((sum, r) => sum + safeAmount(r.reported_amount), 0)
      });
    }

    const currentMonthAmount = reimbursements
      .filter((r) => {
        const created = new Date(r.created_at);
        return created.getMonth() === currentMonth && created.getFullYear() === currentYear;
      })
      .reduce((sum, r) => sum + safeAmount(r.reported_amount), 0);

    const typeAccumulator = {
      TRANSPORTE: { name: 'Transporte', value: 0, monto: 0 },
      BOLETA: { name: 'Boleta', value: 0, monto: 0 },
      OTROS: { name: 'Otros', value: 0, monto: 0 }
    };

    reimbursements.forEach((reimb) => {
      const key = ['TRANSPORTE', 'BOLETA'].includes(reimb.type) ? reimb.type : 'OTROS';
      typeAccumulator[key].value += 1;
      typeAccumulator[key].monto += safeAmount(reimb.reported_amount);
    });

    setStats({
      total: reimbursements.length,
      pending: reimbursements.filter((r) => r.status === 'PENDING_AUDIT').length,
      approved: reimbursements.filter((r) => r.status === 'APPROVED').length,
      rejected: reimbursements.filter((r) => r.status === 'REJECTED').length,
      processing: reimbursements.filter((r) => r.status === 'PENDING_OCR').length,
      totalAmount: currentMonthAmount,
      monthlyData,
      typeStats: Object.values(typeAccumulator)
    });
  }, [isSupervisor, reimbursements]);

  const loadSupervisors = useCallback(async () => {
    if (!canSeeSidebar) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, zone, email, role')
        .eq('role', 'supervisor')
        .order('full_name', { ascending: true });

      if (error) throw error;

      setSupervisorDirectory(data || []);
    } catch (error) {
      console.error('Error loading supervisors:', error);
      showNotification({
        type: 'error',
        title: 'Directorio no disponible',
        message: error.message
      });
    }
  }, [canSeeSidebar, showNotification]);

  useEffect(() => {
    checkUser();
  }, [checkUser]);

  useEffect(() => {
    if (profile) {
      loadReimbursements();
    }
  }, [profile, filter, loadReimbursements]);

  useEffect(() => {
    setShowSupervisorDashboard(isSupervisor);
  }, [isSupervisor]);

  useEffect(() => {
    calculateStats();
  }, [calculateStats]);

  useEffect(() => {
    loadSupervisors();
  }, [loadSupervisors]);

  const sidebarPanel = useMemo(() => {
    if (!canSeeSidebar) return null;

    if (activeSidebarTab === 'profile') {
      if (editingProfile) {
        return (
          <div className="space-y-4 animate-fadeIn">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4 rounded-xl shadow-lg">
              <p className="text-sm font-medium">✏️ Modo Edición</p>
              <p className="text-xs opacity-90 mt-1">Actualiza tu información personal</p>
            </div>
            
            <div className="space-y-4">
              <div className="group">
                <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span className="text-lg">👤</span> Nombre completo
                </label>
                <input
                  type="text"
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all group-hover:border-gray-300"
                  placeholder="Juan Pérez"
                />
              </div>

              <div className="group">
                <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span className="text-lg">📍</span> Zona
                </label>
                <input
                  type="text"
                  value={profileForm.zone}
                  onChange={(e) => setProfileForm({ ...profileForm, zone: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all group-hover:border-gray-300"
                  placeholder="Lima Centro"
                />
              </div>

              <div className="group">
                <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span className="text-lg">📱</span> Teléfono
                </label>
                <input
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all group-hover:border-gray-300"
                  placeholder="+51 999 999 999"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleProfileUpdate}
                  className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-3 rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all font-semibold text-sm shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  💾 Guardar Cambios
                </button>
                <button
                  onClick={() => {
                    setEditingProfile(false);
                    setProfileForm({
                      full_name: profile?.full_name || '',
                      zone: profile?.zone || '',
                      phone: profile?.phone || ''
                    });
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 px-4 py-3 rounded-xl hover:bg-gray-300 transition-all font-semibold text-sm"
                >
                  ✕ Cancelar
                </button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-4 animate-fadeIn">
          {/* Header con avatar y botón editar */}
          <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-3xl shadow-lg">
                👤
              </div>
              <button
                onClick={() => setEditingProfile(true)}
                className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-xl hover:bg-white/30 transition-all text-sm font-medium border border-white/30"
              >
                ✏️ Editar
              </button>
            </div>
            <h3 className="text-xl font-bold">{profile?.full_name || 'Sin nombre'}</h3>
            <p className="text-sm opacity-90">{profile?.zone || 'Sin zona asignada'}</p>
          </div>

          {/* Info Cards */}
          <div className="grid gap-3">
            <div className="bg-white border-2 border-gray-100 rounded-xl p-4 hover:shadow-md transition-all">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-2">
                <span>📧</span> Email
              </p>
              <p className="font-semibold text-gray-900 text-sm break-all">{profile?.email}</p>
            </div>
            
            <div className="bg-white border-2 border-gray-100 rounded-xl p-4 hover:shadow-md transition-all">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-2">
                <span>📱</span> Teléfono
              </p>
              <p className="font-semibold text-gray-900">{profile?.phone || 'Sin registrar'}</p>
            </div>

            <div className="bg-white border-2 border-gray-100 rounded-xl p-4 hover:shadow-md transition-all">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-2">
                <span>🆔</span> DNI
              </p>
              <p className="font-semibold text-gray-900">{profile?.dni || 'No disponible'}</p>
            </div>
          </div>

          {/* Stats rápidos */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white shadow-lg">
              <p className="text-xs opacity-90 mb-1">✅ Aprobados</p>
              <p className="text-3xl font-bold">{stats.approved}</p>
            </div>
            <div className="bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl p-4 text-white shadow-lg">
              <p className="text-xs opacity-90 mb-1">⏳ Pendientes</p>
              <p className="text-3xl font-bold">{stats.pending}</p>
            </div>
          </div>
        </div>
      );
    }

    if (activeSidebarTab === 'settings') {
      const toggles = [
        {
          id: 'autoOpenDashboard',
          label: 'Panel automático',
          description: 'Abrir insights al iniciar',
          helper: 'Muestra la vista analítica al iniciar sesión',
          icon: '🚀',
          color: 'from-blue-500 to-cyan-500'
        },
        {
          id: 'notifyDecisions',
          label: 'Alertas de decisiones',
          description: 'Notificaciones de auditoría',
          helper: 'Mostrar notificaciones cada vez que un auditor tome acción',
          icon: '🔔',
          color: 'from-purple-500 to-pink-500'
        },
        {
          id: 'highlightCollaborators',
          label: 'Destacar colaboradores',
          description: 'Resaltar más activos',
          helper: 'Resaltar en el listado a los más activos',
          icon: '⭐',
          color: 'from-yellow-500 to-orange-500'
        }
      ];

      return (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4 rounded-xl shadow-lg mb-4">
            <p className="text-sm font-medium">⚙️ Personaliza tu experiencia</p>
            <p className="text-xs opacity-90 mt-1">Ajusta las preferencias según tus necesidades</p>
          </div>

          {toggles.map((toggle) => (
            <div key={toggle.id} className="group">
              <div className={`bg-white border-2 rounded-xl p-4 transition-all ${
                preferences[toggle.id] 
                  ? 'border-indigo-300 shadow-lg shadow-indigo-100' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${toggle.color} flex items-center justify-center text-2xl shadow-lg flex-shrink-0`}>
                    {toggle.icon}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-gray-900 text-sm">{toggle.label}</h4>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={preferences[toggle.id]}
                          onChange={() => togglePreference(toggle.id)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-indigo-500 peer-checked:to-purple-600"></div>
                      </label>
                    </div>
                    <p className="text-xs text-gray-600 mb-1">{toggle.description}</p>
                    <p className="text-xs text-gray-400">{toggle.helper}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="mt-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
            <p className="text-xs text-blue-800 flex items-center gap-2">
              <span className="text-lg">💡</span>
              <span><strong>Tip:</strong> Tus preferencias se guardan automáticamente</span>
            </p>
          </div>
        </div>
      );
    }

    if (activeSidebarTab === 'statistics') {
      const approvalRate = stats.total > 0 ? ((stats.approved / stats.total) * 100).toFixed(1) : 0;
      const thisMonth = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

      return (
        <div className="space-y-4 animate-fadeIn">
          {/* Header mes actual */}
          <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white p-5 rounded-xl shadow-lg">
            <p className="text-xs opacity-90 mb-1">📊 Estadísticas de</p>
            <p className="text-lg font-bold capitalize">{thisMonth}</p>
          </div>

          {/* Contador total */}
          <div className="bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-xl p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-90 mb-1">Total Reembolsos</p>
                <p className="text-4xl font-bold">{stats.total}</p>
              </div>
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-3xl backdrop-blur-sm">
                📈
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-white/30">
              <p className="text-xs opacity-90">Monto total</p>
              <p className="text-xl font-bold">S/ {stats.totalAmount?.toFixed(0) || '0'}</p>
            </div>
          </div>

          {/* Grid de estados */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border-2 border-blue-200 rounded-xl p-4 hover:shadow-lg transition-all">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-xs text-gray-600">Aprobados</p>
              <p className="text-2xl font-bold text-blue-600">{stats.approved}</p>
            </div>

            <div className="bg-white border-2 border-yellow-200 rounded-xl p-4 hover:shadow-lg transition-all">
              <div className="text-3xl mb-2">⏳</div>
              <p className="text-xs text-gray-600">Pendientes</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            </div>

            <div className="bg-white border-2 border-red-200 rounded-xl p-4 hover:shadow-lg transition-all">
              <div className="text-3xl mb-2">❌</div>
              <p className="text-xs text-gray-600">Rechazados</p>
              <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
            </div>

            <div className="bg-white border-2 border-purple-200 rounded-xl p-4 hover:shadow-lg transition-all">
              <div className="text-3xl mb-2">🔄</div>
              <p className="text-xs text-gray-600">En proceso</p>
              <p className="text-2xl font-bold text-purple-600">{stats.processing || 0}</p>
            </div>
          </div>

          {/* Tasa de aprobación con barra animada */}
          <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-900">Tasa de Aprobación</p>
              <p className="text-2xl font-bold text-indigo-600">{approvalRate}%</p>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 h-full rounded-full transition-all duration-1000 ease-out shadow-lg"
                style={{ width: `${approvalRate}%` }}
              >
                <div className="w-full h-full bg-white/30 animate-pulse"></div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {approvalRate >= 80 ? '🎉 Excelente desempeño' : approvalRate >= 60 ? '👍 Buen rendimiento' : '⚠️ Mejorable'}
            </p>
          </div>

          {/* Info adicional */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4">
            <p className="text-xs text-blue-800 flex items-center gap-2">
              <span className="text-lg">💡</span>
              <span>Actualización en tiempo real</span>
            </p>
          </div>
        </div>
      );
    }

    if (activeSidebarTab === 'support') {
      const handleSendSupport = async () => {
        if (!supportForm.subject.trim() || !supportForm.message.trim()) {
          showNotification({
            type: 'error',
            title: 'Campos incompletos',
            message: 'Por favor completa el asunto y el mensaje'
          });
          return;
        }

        setSendingSupport(true);
        
        // Simular envío (aquí podrías integrar con un servicio de email o tickets)
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        showNotification({
          type: 'success',
          title: 'Solicitud enviada',
          message: 'Tu mensaje fue enviado. Responderemos pronto.'
        });
        
        setSupportForm({ subject: '', message: '', priority: 'normal' });
        setSendingSupport(false);
      };

      return (
        <div className="space-y-4 animate-fadeIn">
          {/* Header de contacto */}
          <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white p-5 rounded-xl shadow-lg">
            <p className="text-lg font-bold mb-3">🆘 Centro de Soporte</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3 bg-white/20 backdrop-blur-sm rounded-lg p-3">
                <span className="text-2xl">📧</span>
                <div>
                  <p className="text-xs opacity-90">Email</p>
                  <p className="font-semibold">help@auditoria.co</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white/20 backdrop-blur-sm rounded-lg p-3">
                <span className="text-2xl">📞</span>
                <div>
                  <p className="text-xs opacity-90">Urgencias</p>
                  <p className="font-semibold">+51 999 111 222</p>
                </div>
              </div>
            </div>
          </div>

          {/* Formulario de solicitud */}
          <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
            <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-xl">📝</span>
              Nueva Solicitud
            </h4>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Asunto</label>
                <input
                  type="text"
                  value={supportForm.subject}
                  onChange={(e) => setSupportForm({ ...supportForm, subject: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  placeholder="Ej: Problema al aprobar reembolso"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Prioridad</label>
                <select
                  value={supportForm.priority}
                  onChange={(e) => setSupportForm({ ...supportForm, priority: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                >
                  <option value="low">🟢 Baja - Consulta general</option>
                  <option value="normal">🟡 Normal - Requiere atención</option>
                  <option value="high">🟠 Alta - Urgente</option>
                  <option value="urgent">🔴 Crítica - Bloqueo total</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Mensaje</label>
                <textarea
                  value={supportForm.message}
                  onChange={(e) => setSupportForm({ ...supportForm, message: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none transition-all"
                  rows="5"
                  placeholder="Describe tu problema o consulta con el mayor detalle posible..."
                />
              </div>

              <button
                onClick={handleSendSupport}
                disabled={sendingSupport}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-6 py-4 rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                {sendingSupport ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">⏳</span> Enviando...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    📨 Enviar Solicitud
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Tips y tiempo de respuesta */}
          <div className="space-y-3">
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
              <p className="text-xs text-blue-800 flex items-center gap-2">
                <span className="text-lg">⏱️</span>
                <span><strong>Tiempo de respuesta:</strong> Menos de 2 horas</span>
              </p>
            </div>
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
              <p className="text-xs text-green-800 flex items-center gap-2">
                <span className="text-lg">💡</span>
                <span><strong>Tip:</strong> Adjunta capturas de pantalla por email para respuesta más rápida</span>
              </p>
            </div>
          </div>
        </div>
      );
    }

    return null;
  }, [activeSidebarTab, canSeeSidebar, profile, stats, supervisorDirectory, preferences, togglePreference, editingProfile, profileForm, supportForm, sendingSupport, handleProfileUpdate, showNotification]);

  const renderSidebar = (isMobile = false) => (
    <div className="flex h-full w-80 flex-col bg-white shadow-lg">
      <div className="flex items-center justify-between border-b px-6 py-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Supervisor</p>
          <p className="text-lg font-semibold text-gray-900">Panel inteligente</p>
        </div>
        {isMobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-2xl text-gray-400 hover:text-gray-600"
            aria-label="Cerrar menú"
          >
            ×
          </button>
        )}
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Tabs de navegación */}
        <nav className="flex border-b border-gray-200 px-2 py-2 bg-white">
          {sidebarMenu.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveSidebarTab(item.id);
                if (isMobile) setSidebarOpen(false);
              }}
              className={`flex-1 flex flex-col items-center justify-center px-2 py-3 rounded-lg transition-all ${
                activeSidebarTab === item.id
                  ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg transform scale-105'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className={`text-2xl mb-1 ${activeSidebarTab === item.id ? 'animate-bounce' : ''}`}>{item.icon}</span>
              <span className="text-xs font-medium">{item.label.split(' ')[item.label.split(' ').length - 1]}</span>
            </button>
          ))}
        </nav>
        
        {/* Panel de contenido con scroll */}
        <div className="flex-1 overflow-y-auto px-6 py-6 bg-gradient-to-br from-gray-50 to-white">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <span className="text-2xl">{sidebarMenu.find(item => item.id === activeSidebarTab)?.icon}</span>
              {sidebarMenu.find(item => item.id === activeSidebarTab)?.label}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {sidebarMenu.find(item => item.id === activeSidebarTab)?.description}
            </p>
          </div>
          <div className="border-t border-gray-200 pt-4">
            {sidebarPanel}
          </div>
        </div>
      </div>
    </div>
  );

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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex min-h-screen">
        {canSeeSidebar && (
          <aside className="hidden lg:flex lg:flex-shrink-0">
            {renderSidebar()}
          </aside>
        )}
        <div className="flex-1 flex flex-col">
          <nav className="bg-white shadow-sm">
            <div className="container mx-auto px-4 py-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  {canSeeSidebar && (
                    <button
                      onClick={() => setSidebarOpen(true)}
                      className="lg:hidden rounded-full border border-gray-200 p-2 text-gray-600"
                      aria-label="Abrir menú"
                    >
                      ☰
                    </button>
                  )}
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                    <p className="text-sm text-gray-600">{profile?.full_name} - {profile?.zone}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  {isSupervisor && (
                    <button
                      onClick={() => setShowSupervisorDashboard(!showSupervisorDashboard)}
                      className={`px-4 py-2 rounded transition-all duration-300 ${
                        showSupervisorDashboard
                          ? 'bg-indigo-500 text-white shadow-lg transform scale-105'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {showSupervisorDashboard ? '📋 Reembolsos' : '📊 Insights'}
                    </button>
                  )}
                  {profile?.role === 'admin' && (
                    <button
                      onClick={() => router.push('/audit')}
                      className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                    >
                      Auditoría
                    </button>
                  )}
                  {profile && profile.role !== 'auditor' && (
                    <button
                      onClick={() => router.push('/reimbursements/new')}
                      className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                    >
                      + Nuevo
                    </button>
                  )}
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

          <div className="container mx-auto px-4 py-8 flex-1 w-full">
        {isSupervisor && showSupervisorDashboard ? (
          <div className="space-y-6 animate-fadeIn">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <p className="text-sm text-gray-500">Total gestionados</p>
                <p className="text-4xl font-bold text-gray-900 mt-2">{stats.total}</p>
                <p className="text-xs text-gray-400 mt-1">Todos los estados</p>
              </div>
              <div className="bg-blue-50 p-5 rounded-2xl shadow-sm border border-blue-100">
                <p className="text-sm text-blue-600">Procesando</p>
                <p className="text-4xl font-bold text-blue-900 mt-2">{stats.processing}</p>
                <p className="text-xs text-blue-500 mt-1">Pendientes de OCR</p>
              </div>
              <div className="bg-yellow-50 p-5 rounded-2xl shadow-sm border border-yellow-100">
                <p className="text-sm text-yellow-700">En auditoría</p>
                <p className="text-4xl font-bold text-yellow-900 mt-2">{stats.pending}</p>
                <p className="text-xs text-yellow-600 mt-1">Esperando decisión</p>
              </div>
              <div className="bg-green-50 p-5 rounded-2xl shadow-sm border border-green-100">
                <p className="text-sm text-green-700">Aprobados</p>
                <p className="text-4xl font-bold text-green-900 mt-2">{stats.approved}</p>
                <p className="text-xs text-green-600 mt-1">Cerrados correctamente</p>
              </div>
              <div className="bg-red-50 p-5 rounded-2xl shadow-sm border border-red-100">
                <p className="text-sm text-red-700">Rechazados</p>
                <p className="text-4xl font-bold text-red-900 mt-2">{stats.rejected}</p>
                <p className="text-xs text-red-600 mt-1">Con incidencias</p>
              </div>
            </div>

            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-2xl p-8 shadow-lg">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div>
                  <p className="uppercase text-xs tracking-widest text-indigo-100">Monto auditado este mes</p>
                  <p className="text-5xl font-bold mt-2">S/ {stats.totalAmount.toFixed(2)}</p>
                  <p className="text-sm text-indigo-100 mt-2">
                    {new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <div className="bg-white bg-opacity-15 px-6 py-4 rounded-xl">
                  <p className="text-sm text-indigo-100">Aprobados vs Rechazados</p>
                  <p className="text-3xl font-semibold">
                    {stats.total ? Math.round((stats.approved / stats.total) * 100) : 0}%
                    <span className="text-sm ml-2 font-normal">de éxito</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">📈 Tendencia últimos 6 meses</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats.monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                    <XAxis dataKey="month" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', borderColor: '#e2e8f0' }} />
                    <Legend />
                    <Bar dataKey="aprobados" name="Aprobados" fill="#10b981" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="rechazados" name="Rechazados" fill="#ef4444" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="pendientes" name="Pendientes" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">💵 Evolución de montos</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={stats.monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                    <XAxis dataKey="month" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      formatter={(value) => `S/ ${Number(value).toFixed(2)}`}
                      contentStyle={{ borderRadius: '12px', borderColor: '#e2e8f0' }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="monto"
                      stroke="#6366f1"
                      strokeWidth={3}
                      dot={{ r: 5, strokeWidth: 2 }}
                      activeDot={{ r: 7 }}
                      name="Monto total"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">🎯 Distribución por tipo</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={stats.typeStats}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {stats.typeStats.map((entry, index) => (
                        <Cell key={`slice-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${value} solicitudes`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {stats.typeStats.map((type) => (
                    <div key={type.name} className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">{type.name}</p>
                      <p className="text-lg font-semibold text-gray-900">{type.value}</p>
                      <p className="text-xs text-gray-500">S/ {type.monto.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => setShowSupervisorDashboard(false)}
                className="bg-gray-900 text-white px-8 py-3 rounded-xl shadow hover:shadow-lg transition"
              >
                📋 Ver listado de reembolsos
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
              <div className="flex flex-col space-y-4">
                {/* Filtros rápidos temporales */}
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">Filtros rápidos:</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDateFilter('all')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        dateFilter === 'all'
                          ? 'bg-purple-500 text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      🗓️ Todos
                    </button>
                    <button
                      onClick={() => setDateFilter('week')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        dateFilter === 'week'
                          ? 'bg-blue-500 text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      📅 Esta Semana
                    </button>
                    <button
                      onClick={() => setDateFilter('month')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        dateFilter === 'month'
                          ? 'bg-green-500 text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      📆 Este Mes
                    </button>
                  </div>
                </div>
                
                {/* Filtro por estado */}
                <div className="flex items-center space-x-4">
                  <span className="font-medium text-gray-700">Filtrar por estado:</span>
                  <div className="flex space-x-2">
                    {[
                      { value: 'all', label: 'Todos' },
                      { value: 'PENDING_OCR', label: 'Procesando' },
                      { value: 'PENDING_AUDIT', label: 'En Auditoría' },
                      { value: 'APPROVED', label: 'Aprobados' },
                      { value: 'REJECTED', label: 'Rechazados' }
                    ].map((filterOption) => (
                      <button
                        key={filterOption.value}
                        onClick={() => setFilter(filterOption.value)}
                        className={`px-4 py-2 rounded ${
                          filter === filterOption.value
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {filterOption.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="text-sm text-gray-600 mb-1">Total</div>
                <div className="text-3xl font-bold text-gray-900">
                  {reimbursements.length}
                </div>
              </div>
              
              <div className="bg-blue-50 p-6 rounded-lg shadow-sm">
                <div className="text-sm text-blue-600 mb-1">Procesando</div>
                <div className="text-3xl font-bold text-blue-900">
                  {reimbursements.filter(r => r.status === 'PENDING_OCR').length}
                </div>
              </div>
              
              <div className="bg-yellow-50 p-6 rounded-lg shadow-sm">
                <div className="text-sm text-yellow-600 mb-1">En Auditoría</div>
                <div className="text-3xl font-bold text-yellow-900">
                  {reimbursements.filter(r => r.status === 'PENDING_AUDIT').length}
                </div>
              </div>
              
              <div className="bg-green-50 p-6 rounded-lg shadow-sm">
                <div className="text-sm text-green-600 mb-1">Aprobados</div>
                <div className="text-3xl font-bold text-green-900">
                  {reimbursements.filter(r => r.status === 'APPROVED').length}
                </div>
              </div>
            </div>

            {/* Reimbursements List */}
            {reimbursements.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <div className="text-6xl mb-4">📋</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No hay reembolsos
                </h3>
                <p className="text-gray-600 mb-6">
                  {filter === 'all' 
                    ? 'Aún no has creado ningún reembolso'
                    : `No hay reembolsos con estado: ${filter}`
                  }
                </p>
                {filter === 'all' && (
                  <button
                    onClick={() => router.push('/reimbursements/new')}
                    className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
                  >
                    Crear Primer Reembolso
                  </button>
                )}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reimbursements.map((reimb) => (
                  <ReimbursementCard key={reimb.id} reimbursement={reimb} />
                ))}
              </div>
            )}
          </>
        )}
        </div>
      </div>

      {canSeeSidebar && sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0 max-w-full">
            {renderSidebar(true)}
          </div>
        </div>
      )}

      <NotificationCenter
        notification={notification}
        onClose={() => setNotification(null)}
      />
      </div>
    </div>
  );
}
