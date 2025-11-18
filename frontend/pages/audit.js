import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/router';
import { auditReimbursement } from '../lib/supabase';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const SIDEBAR_ITEMS = [
  { id: 'profile', label: 'Mi Perfil', description: 'Datos de contacto y zona', icon: '👤' },
  { id: 'settings', label: 'Configuraciones', description: 'Preferencias del panel', icon: '⚙️' },
  { id: 'directory', label: 'Supervisores', description: 'Directorio y estados', icon: '🧑‍💼' },
  { id: 'support', label: 'Soporte', description: 'Ayuda y reportes', icon: '🆘' }
];

export default function AuditPage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [reimbursements, setReimbursements] = useState([]);
  const [filteredReimbursements, setFilteredReimbursements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReimb, setSelectedReimb] = useState(null);
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showObservationModal, setShowObservationModal] = useState(false);
  const [observationText, setObservationText] = useState('');
  const [showDashboard, setShowDashboard] = useState(true);
  const [activeSidebarTab, setActiveSidebarTab] = useState('profile');
  const [supervisorDirectory, setSupervisorDirectory] = useState([]);
  const [preferences, setPreferences] = useState({
    autoOpenDashboard: true,
    notifyOnPending: true,
    highlightFraud: true
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
  const [dateFilter, setDateFilter] = useState('all');
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    processing: 0,
    totalAmount: 0,
    monthlyData: [],
    supervisorStats: [],
    typeStats: [],
    topContributors: [],
    supervisorMonthlySubtotals: []
  });
  
  // Filtros
  const [filters, setFilters] = useState({
    status: 'all',
    type: 'all',
    dateRange: 'all',
    supervisor: 'all',
    startDate: '',
    endDate: ''
  });
  
  const router = useRouter();
  const sidebarMenu = useMemo(() => SIDEBAR_ITEMS, []);
  
  const togglePreference = useCallback((key) => {
    setPreferences((prev) => {
      const newPrefs = {
        ...prev,
        [key]: !prev[key]
      };
      // Guardar en localStorage
      localStorage.setItem('audit_preferences', JSON.stringify(newPrefs));
      
      // Mostrar notificación
      const notifications = document.createElement('div');
      notifications.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-bounce';
      notifications.innerHTML = `✅ Preferencia ${newPrefs[key] ? 'activada' : 'desactivada'}`;
      document.body.appendChild(notifications);
      setTimeout(() => notifications.remove(), 3000);
      
      return newPrefs;
    });
  }, []);

  const loadSupervisors = useCallback(async () => {
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
    }
  }, []);

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

      setProfile({
        ...profile,
        full_name: profileForm.full_name,
        zone: profileForm.zone,
        phone: profileForm.phone
      });
      
      setEditingProfile(false);
      
      // Notificación de éxito
      const notification = document.createElement('div');
      notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
      notification.innerHTML = '✅ Perfil actualizado correctamente';
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 3000);
      
    } catch (error) {
      console.error('Error updating profile:', error);
      
      // Notificación de error
      const notification = document.createElement('div');
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
      notification.innerHTML = '❌ Error al actualizar perfil';
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 3000);
    }
  }, [profile, profileForm]);

  // Cargar preferencias desde localStorage
  useEffect(() => {
    const savedPreferences = localStorage.getItem('audit_preferences');
    if (savedPreferences) {
      try {
        setPreferences(JSON.parse(savedPreferences));
      } catch (error) {
        console.error('Error parsing preferences:', error);
      }
    }
  }, []);

  // Inicializar profileForm cuando cargue el perfil
  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || '',
        zone: profile.zone || '',
        phone: profile.phone || ''
      });
    }
  }, [profile]);

  useEffect(() => {
    checkUser();
    loadSupervisors();
  }, [loadSupervisors]);

  useEffect(() => {
    if (reimbursements.length > 0) {
      applyFilters();
      calculateStats();
    }
  }, [reimbursements, filters]);

  async function checkUser() {
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

      if (!profileData || !['auditor', 'admin'].includes(profileData.role)) {
        alert('No tienes permisos para acceder a esta página. Serás redirigido al dashboard.');
        router.push('/dashboard');
        return;
      }

      setProfile(profileData);
      loadPendingReimbursements();
    } catch (error) {
      console.error('Error:', error);
      router.push('/login');
    }
  }

  async function loadPendingReimbursements() {
    try {
      console.log('Iniciando carga de reembolsos...');
      
      // Cargar TODOS los reembolsos para que el auditor pueda ver todo el historial
      const { data, error } = await supabase
        .from('reimbursements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error loading reimbursements:', error);
        throw error;
      }

      console.log('Reembolsos cargados:', data?.length || 0, data);
      
      // Cargar perfiles por separado
      if (data && data.length > 0) {
        const profileIds = [...new Set(data.map(r => r.profile_id).filter(Boolean))];
        console.log('Profile IDs a cargar:', profileIds);
        
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('*')
          .in('id', profileIds);
        
        if (profilesError) {
          console.error('Error cargando perfiles:', profilesError);
        } else {
          console.log('Perfiles cargados:', profilesData?.length || 0);
          
          // Mapear perfiles a los reembolsos
          const profilesMap = {};
          profilesData?.forEach(p => {
            profilesMap[p.id] = p;
          });
          
          data.forEach(r => {
            r.profiles = profilesMap[r.profile_id] || null;
          });
        }
      }
      
      setReimbursements(data || []);
      setFilteredReimbursements(data || []);
    } catch (error) {
      console.error('Error:', error);
      alert(`Error al cargar reembolsos: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    let filtered = [...reimbursements];

    // Filtro por estado
    if (filters.status !== 'all') {
      filtered = filtered.filter(r => r.status === filters.status);
    }

    // Filtro por tipo (transporte/boleta)
    if (filters.type !== 'all') {
      filtered = filtered.filter(r => r.type === filters.type);
    }

    // Filtro por supervisor
    if (filters.supervisor !== 'all') {
      filtered = filtered.filter(r => r.profile_id === filters.supervisor);
    }

    // Filtro por rango de fechas predefinido
    if (filters.dateRange !== 'all') {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      filtered = filtered.filter(r => {
        const createdDate = new Date(r.created_at);
        
        switch (filters.dateRange) {
          case 'today':
            return createdDate >= startOfDay;
          case 'week':
            const weekAgo = new Date(startOfDay);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return createdDate >= weekAgo;
          case 'month':
            const monthAgo = new Date(startOfDay);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return createdDate >= monthAgo;
          default:
            return true;
        }
      });
    }

    // Filtro por fechas personalizadas
    if (filters.startDate) {
      filtered = filtered.filter(r => new Date(r.created_at) >= new Date(filters.startDate));
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(r => new Date(r.created_at) <= endDate);
    }

    setFilteredReimbursements(filtered);
  }

  function handleFilterChange(filterName, value) {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  }

  function clearFilters() {
    setFilters({
      status: 'all',
      type: 'all',
      dateRange: 'all',
      supervisor: 'all',
      startDate: '',
      endDate: ''
    });
  }

  function calculateStats() {
    const safeAmount = (value) => Number(value) || 0;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Calcular totales del mes actual
    const monthlyReimbursements = reimbursements.filter(r => {
      const date = new Date(r.created_at);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });

    // Total de montos
    const totalAmount = monthlyReimbursements.reduce((sum, r) => sum + safeAmount(r.reported_amount), 0);

    // Datos mensuales de los últimos 6 meses
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(currentYear, currentMonth - i, 1);
      const monthName = targetDate.toLocaleDateString('es-ES', { month: 'short' });
      
      const monthReimbs = reimbursements.filter(r => {
        const date = new Date(r.created_at);
        return date.getMonth() === targetDate.getMonth() && 
               date.getFullYear() === targetDate.getFullYear();
      });

      monthlyData.push({
        month: monthName.charAt(0).toUpperCase() + monthName.slice(1),
        aprobados: monthReimbs.filter(r => r.status === 'APPROVED').length,
        rechazados: monthReimbs.filter(r => r.status === 'REJECTED').length,
        pendientes: monthReimbs.filter(r => r.status === 'PENDING_AUDIT').length,
        monto: monthReimbs.reduce((sum, r) => sum + safeAmount(r.reported_amount), 0)
      });
    }

    // Estadísticas por supervisor
    const supervisorMap = {};
    reimbursements.forEach(r => {
      const name = r.profiles?.full_name || 'Sin asignar';
      if (!supervisorMap[name]) {
        supervisorMap[name] = { name, total: 0, aprobados: 0, rechazados: 0, monto: 0 };
      }
      supervisorMap[name].total++;
      if (r.status === 'APPROVED') supervisorMap[name].aprobados++;
      if (r.status === 'REJECTED') supervisorMap[name].rechazados++;
      supervisorMap[name].monto += safeAmount(r.reported_amount);
    });

    // 🆕 Top Colaboradores (supervisores con mejor tasa de aprobación)
    const collaboratorMap = {};
    reimbursements.forEach((reimb) => {
      const name = reimb.profiles?.full_name || 'Sin asignar';
      if (!collaboratorMap[name]) {
        collaboratorMap[name] = { name, total: 0, approved: 0, rejected: 0, amount: 0 };
      }
      collaboratorMap[name].total += 1;
      if (reimb.status === 'APPROVED') {
        collaboratorMap[name].approved += 1;
      }
      if (reimb.status === 'REJECTED') {
        collaboratorMap[name].rejected += 1;
      }
      collaboratorMap[name].amount += safeAmount(reimb.reported_amount);
    });

    const topContributors = Object.values(collaboratorMap)
      .map((item) => ({
        ...item,
        approvalRate: item.total ? Math.round((item.approved / item.total) * 100) : 0
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // 🆕 Subtotales del mes actual por supervisor
    const supervisorMonthlyMap = {};
    monthlyReimbursements.forEach((reimb) => {
      const name = reimb.profiles?.full_name || 'Sin asignar';
      if (!supervisorMonthlyMap[name]) {
        supervisorMonthlyMap[name] = { 
          name, 
          total: 0, 
          aprobados: 0,
          pendientes: 0,
          rechazados: 0,
          monto: 0 
        };
      }
      supervisorMonthlyMap[name].total += 1;
      if (reimb.status === 'APPROVED') supervisorMonthlyMap[name].aprobados += 1;
      if (reimb.status === 'PENDING_AUDIT') supervisorMonthlyMap[name].pendientes += 1;
      if (reimb.status === 'REJECTED') supervisorMonthlyMap[name].rechazados += 1;
      supervisorMonthlyMap[name].monto += safeAmount(reimb.reported_amount);
    });

    const supervisorMonthlySubtotals = Object.values(supervisorMonthlyMap)
      .sort((a, b) => b.monto - a.monto);

    // Estadísticas por tipo
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
      pending: reimbursements.filter(r => r.status === 'PENDING_AUDIT').length,
      approved: reimbursements.filter(r => r.status === 'APPROVED').length,
      rejected: reimbursements.filter(r => r.status === 'REJECTED').length,
      processing: reimbursements.filter(r => r.status === 'PENDING_OCR').length,
      totalAmount: totalAmount,
      monthlyData: monthlyData,
      supervisorStats: Object.values(supervisorMap),
      typeStats: Object.values(typeAccumulator),
      topContributors: topContributors,
      supervisorMonthlySubtotals: supervisorMonthlySubtotals
    });
  }

  // Obtener lista única de supervisores con sus nombres
  const supervisorMap = {};
  reimbursements.forEach(r => {
    if (r.profile_id && r.profiles?.full_name) {
      supervisorMap[r.profile_id] = r.profiles.full_name;
    }
  });
  
  const supervisors = Object.values(supervisorMap);
  const supervisorIds = Object.keys(supervisorMap);
  
  console.log('Supervisor Map:', supervisorMap);
  console.log('Supervisors:', supervisors);

  const sidebarPanel = useMemo(() => {
    if (activeSidebarTab === 'profile') {
      if (editingProfile) {
        return (
          <div className="space-y-4">
            <p className="text-sm font-medium text-gray-900 mb-3">Editar Perfil</p>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Nombre completo</label>
                <input
                  type="text"
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="Juan Pérez"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Zona</label>
                <input
                  type="text"
                  value={profileForm.zone}
                  onChange={(e) => setProfileForm({ ...profileForm, zone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="Lima Centro"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="+51 999 999 999"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleProfileUpdate}
                  className="flex-1 bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 transition font-medium text-sm"
                >
                  💾 Guardar
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
                  className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition font-medium text-sm"
                >
                  ✕ Cancelar
                </button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-4 text-sm text-gray-700">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-900">Mi Perfil</p>
            <button
              onClick={() => setEditingProfile(true)}
              className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-200 transition"
            >
              ✏️ Editar
            </button>
          </div>
          
          <div>
            <p className="text-xs text-gray-500">Nombre</p>
            <p className="font-semibold text-gray-900">{profile?.full_name || 'Sin especificar'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Zona</p>
            <p className="font-semibold text-gray-900">{profile?.zone || 'Sin zona'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Email</p>
            <p className="font-mono text-gray-900 break-all text-xs">{profile?.email}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Teléfono</p>
            <p className="font-semibold text-gray-900">{profile?.phone || 'Sin registrar'}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-4 border-t">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs text-blue-600">Aprobados</p>
              <p className="text-xl font-bold text-blue-900">{stats.approved}</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3">
              <p className="text-xs text-yellow-600">Pendientes</p>
              <p className="text-xl font-bold text-yellow-900">{stats.pending}</p>
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
          id: 'notifyOnPending',
          label: 'Alertas pendientes',
          description: 'Notificar reembolsos nuevos',
          helper: 'Recibir alertas cuando hay nuevos reembolsos por auditar',
          icon: '🔔',
          color: 'from-purple-500 to-pink-500'
        },
        {
          id: 'highlightFraud',
          label: 'Alertas de fraude',
          description: 'Resaltar advertencias IA',
          helper: 'Destacar reembolsos con alertas de IA',
          icon: '⚠️',
          color: 'from-red-500 to-orange-500'
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

    if (activeSidebarTab === 'directory') {
      if (!supervisorDirectory.length) {
        return <p className="text-sm text-gray-500">No hay supervisores registrados.</p>;
      }

      return (
        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
          {supervisorDirectory.map((sup) => (
            <div key={sup.id} className="p-3 rounded-lg border border-gray-100 hover:border-indigo-200 transition">
              <p className="font-semibold text-gray-900">{sup.full_name}</p>
              <p className="text-xs text-gray-500">{sup.zone || 'Zona no asignada'}</p>
              <p className="text-xs text-gray-400 mt-1">{sup.email}</p>
            </div>
          ))}
        </div>
      );
    }

    if (activeSidebarTab === 'support') {
      const handleSendSupport = async () => {
        if (!supportForm.subject.trim() || !supportForm.message.trim()) {
          const notification = document.createElement('div');
          notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
          notification.innerHTML = '⚠️ Por favor completa el asunto y el mensaje';
          document.body.appendChild(notification);
          setTimeout(() => notification.remove(), 3000);
          return;
        }

        setSendingSupport(true);
        
        // Simular envío (aquí podrías integrar con un servicio de email o tickets)
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        notification.innerHTML = '✅ Tu mensaje fue enviado. Responderemos pronto.';
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
        
        setSupportForm({ subject: '', message: '', priority: 'normal' });
        setSendingSupport(false);
      };

      return (
        <div className="space-y-4 text-sm text-gray-700">
          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-xs font-medium text-blue-800 mb-1">📧 Contacto</p>
            <p className="text-sm text-blue-900">help@auditoria.co</p>
            <p className="text-xs font-medium text-blue-800 mt-2 mb-1">📞 Urgencias</p>
            <p className="text-sm text-blue-900">+51 999 111 222</p>
          </div>

          <div className="border-t pt-4">
            <p className="font-medium text-gray-900 mb-3">Enviar solicitud</p>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Asunto</label>
                <input
                  type="text"
                  value={supportForm.subject}
                  onChange={(e) => setSupportForm({ ...supportForm, subject: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="Problema con..."
                />
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Prioridad</label>
                <select
                  value={supportForm.priority}
                  onChange={(e) => setSupportForm({ ...supportForm, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="low">Baja</option>
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Mensaje</label>
                <textarea
                  value={supportForm.message}
                  onChange={(e) => setSupportForm({ ...supportForm, message: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 resize-none"
                  rows="4"
                  placeholder="Describe tu problema o consulta..."
                />
              </div>

              <button
                onClick={handleSendSupport}
                disabled={sendingSupport}
                className="w-full bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 transition font-medium text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {sendingSupport ? '📤 Enviando...' : '📨 Enviar Solicitud'}
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500 italic">
            💡 Tip: Adjunta capturas de pantalla por email para una respuesta más rápida.
          </p>
        </div>
      );
    }

    return null;
  }, [activeSidebarTab, profile, stats, supervisorDirectory, preferences, togglePreference, editingProfile, profileForm, supportForm, sendingSupport, handleProfileUpdate]);

  async function handleDecision(status) {
    if (!selectedReimb) return;

    if (!confirm(`¿Estás seguro de ${status === 'APPROVED' ? 'APROBAR' : 'RECHAZAR'} este reembolso?`)) {
      return;
    }

    setProcessing(true);

    try {
      await auditReimbursement(selectedReimb.id, status, comment);
      
      alert(`Reembolso ${status === 'APPROVED' ? 'aprobado' : 'rechazado'} exitosamente`);
      
      setSelectedReimb(null);
      setComment('');
      loadPendingReimbursements();
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  }

  async function handleRequestReview() {
    if (!observationText.trim()) {
      alert('Por favor escribe una observación');
      return;
    }

    setProcessing(true);
    try {
      // Agregar observación al campo de comentarios del auditor
      const { error } = await supabase
        .from('reimbursements')
        .update({
          auditor_comment: `[SOLICITUD DE REVISIÓN] ${observationText}\n\n${selectedReimb.auditor_comment || ''}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedReimb.id);

      if (error) throw error;

      alert('Solicitud de revisión enviada a los administradores');
      setShowObservationModal(false);
      setObservationText('');
      loadPendingReimbursements();
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  }

  const renderSidebar = (isMobile = false) => (
    <div className="flex h-full w-80 flex-col bg-white shadow-lg">
      <div className="flex items-center justify-between border-b px-6 py-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Auditor</p>
          <p className="text-lg font-semibold text-gray-900">Panel inteligente</p>
        </div>
        {isMobile && (
          <button
            onClick={() => setShowSidebar(false)}
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
                // No cerramos el sidebar al cambiar de tab
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Panel de Auditoría</h1>
              <p className="text-sm text-gray-600">Auditor: {profile?.full_name}</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowDashboard(!showDashboard)}
                className={`px-4 py-2 rounded transition-all duration-300 ${
                  showDashboard 
                    ? 'bg-blue-500 text-white shadow-lg transform scale-105' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {showDashboard ? '📊 Dashboard' : '📋 Reembolsos'}
              </button>
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200 flex items-center space-x-2 transition-all duration-300 hover:scale-105"
              >
                <span>☰</span>
                <span>Perfil</span>
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

      <div className="container mx-auto px-4 py-6">
        {/* Dashboard con estadísticas y gráficos */}
        {showDashboard ? (
          <div className="space-y-6 animate-fadeIn">
            {/* Tarjetas de estadísticas principales */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white transform transition-all duration-300 hover:scale-105 hover:shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-4xl">📊</div>
                  <div className="text-xs bg-white bg-opacity-20 px-3 py-1 rounded-full">Total</div>
                </div>
                <div className="text-4xl font-bold mb-2">{stats.total}</div>
                <div className="text-sm opacity-90">Reembolsos Totales</div>
              </div>

              <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl shadow-lg p-6 text-white transform transition-all duration-300 hover:scale-105 hover:shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-4xl">⏳</div>
                  <div className="text-xs bg-white bg-opacity-20 px-3 py-1 rounded-full">Pendientes</div>
                </div>
                <div className="text-4xl font-bold mb-2">{stats.pending}</div>
                <div className="text-sm opacity-90">Por Auditar</div>
              </div>

              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white transform transition-all duration-300 hover:scale-105 hover:shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-4xl">✅</div>
                  <div className="text-xs bg-white bg-opacity-20 px-3 py-1 rounded-full">Aprobados</div>
                </div>
                <div className="text-4xl font-bold mb-2">{stats.approved}</div>
                <div className="text-sm opacity-90">Reembolsos OK</div>
              </div>

              <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg p-6 text-white transform transition-all duration-300 hover:scale-105 hover:shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-4xl">❌</div>
                  <div className="text-xs bg-white bg-opacity-20 px-3 py-1 rounded-full">Rechazados</div>
                </div>
                <div className="text-4xl font-bold mb-2">{stats.rejected}</div>
                <div className="text-sm opacity-90">No Aprobados</div>
              </div>
            </div>

            {/* Monto total del mes */}
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl shadow-lg p-8 text-white transform transition-all duration-300 hover:scale-105">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm opacity-90 mb-2">💰 Monto Total del Mes</div>
                  <div className="text-5xl font-bold">S/ {stats.totalAmount.toFixed(2)}</div>
                  <div className="text-sm opacity-90 mt-2">
                    {new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                  </div>
                </div>
                <div className="text-6xl opacity-30">💵</div>
              </div>
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Gráfico de barras: Últimos 6 meses */}
              <div className="bg-white rounded-xl shadow-lg p-6 transform transition-all duration-300 hover:shadow-2xl">
                <h3 className="text-lg font-bold mb-4 text-gray-800">📈 Tendencia Últimos 6 Meses</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats.monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" stroke="#666" />
                    <YAxis stroke="#666" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                    />
                    <Legend />
                    <Bar dataKey="aprobados" fill="#10b981" name="Aprobados" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="rechazados" fill="#ef4444" name="Rechazados" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="pendientes" fill="#f59e0b" name="Pendientes" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Gráfico de línea: Montos por mes */}
              <div className="bg-white rounded-xl shadow-lg p-6 transform transition-all duration-300 hover:shadow-2xl">
                <h3 className="text-lg font-bold mb-4 text-gray-800">💵 Montos por Mes</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={stats.monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" stroke="#666" />
                    <YAxis stroke="#666" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                      formatter={(value) => `S/ ${value.toFixed(2)}`}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="monto" 
                      stroke="#8b5cf6" 
                      strokeWidth={3}
                      name="Monto Total"
                      dot={{ fill: '#8b5cf6', r: 6 }}
                      activeDot={{ r: 8 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Gráfico de pie: Por tipo */}
              <div className="bg-white rounded-xl shadow-lg p-6 transform transition-all duration-300 hover:shadow-2xl">
                <h3 className="text-lg font-bold mb-4 text-gray-800">🎯 Distribución por Tipo</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={stats.typeStats}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {stats.typeStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b'][index % 3]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  {stats.typeStats.map((stat, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-600">{stat.name}</div>
                      <div className="text-lg font-bold">{stat.value}</div>
                      <div className="text-xs text-gray-500">S/ {stat.monto.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Colaboradores con Tasa de Aprobación */}
              <div className="bg-white rounded-xl shadow-lg p-6 transform transition-all duration-300 hover:shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-800">⭐ Top Colaboradores</h3>
                  <div className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Por monto total</div>
                </div>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {stats.topContributors && stats.topContributors.length > 0 ? (
                    stats.topContributors.map((collab, idx) => (
                      <div key={idx} className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-4 transform transition-all duration-300 hover:scale-105 hover:shadow-md">
                        <div className="flex justify-between items-center mb-3">
                          <div>
                            <div className="font-bold text-gray-800 flex items-center gap-2">
                              {idx === 0 ? '🏆' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🎖️'}
                              {collab.name}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {collab.total} reembolsos totales
                            </div>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-sm font-bold ${
                            collab.approvalRate >= 80 ? 'bg-green-100 text-green-700' :
                            collab.approvalRate >= 60 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {collab.approvalRate}%
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="bg-white rounded p-2 text-center">
                            <div className="text-gray-500">Aprobados</div>
                            <div className="font-bold text-green-600">{collab.approved}</div>
                          </div>
                          <div className="bg-white rounded p-2 text-center">
                            <div className="text-gray-500">Rechazados</div>
                            <div className="font-bold text-red-600">{collab.rejected}</div>
                          </div>
                          <div className="bg-white rounded p-2 text-center">
                            <div className="text-gray-500">Monto Total</div>
                            <div className="font-bold text-blue-600">S/ {collab.amount.toFixed(0)}</div>
                          </div>
                        </div>
                        {/* Barra de progreso */}
                        <div className="mt-3 bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              collab.approvalRate >= 80 ? 'bg-green-500' :
                              collab.approvalRate >= 60 ? 'bg-yellow-500' :
                              'bg-red-500'
                            }`}
                            style={{ width: `${collab.approvalRate}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      <div className="text-4xl mb-2">📊</div>
                      <p>No hay datos disponibles</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 🆕 Subtotales del mes por supervisor */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-800">💰 Subtotales del Mes por Supervisor</h3>
                <div className="text-sm text-gray-500">
                  {new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                </div>
              </div>
              {stats.supervisorMonthlySubtotals && stats.supervisorMonthlySubtotals.length > 0 ? (
                <div className="space-y-4">
                  {stats.supervisorMonthlySubtotals.map((sup, idx) => (
                    <div key={idx} className="bg-gradient-to-r from-purple-50 via-blue-50 to-green-50 rounded-xl p-5 transform transition-all duration-300 hover:scale-102 hover:shadow-xl border border-gray-100">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl ${
                            idx === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' :
                            idx === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500' :
                            idx === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600' :
                            'bg-gradient-to-br from-blue-400 to-blue-600'
                          }`}>
                            {idx + 1}
                          </div>
                          <div>
                            <h4 className="font-bold text-lg text-gray-900">{sup.name}</h4>
                            <p className="text-sm text-gray-600">{sup.total} reembolsos este mes</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-500 mb-1">Monto Total</div>
                          <div className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                            S/ {sup.monto.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                          <div className="text-xs text-gray-500 mb-1">Aprobados</div>
                          <div className="text-2xl font-bold text-green-600">{sup.aprobados}</div>
                          <div className="text-xs text-gray-400 mt-1">
                            {sup.total > 0 ? ((sup.aprobados / sup.total) * 100).toFixed(0) : 0}%
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                          <div className="text-xs text-gray-500 mb-1">Pendientes</div>
                          <div className="text-2xl font-bold text-yellow-600">{sup.pendientes}</div>
                          <div className="text-xs text-gray-400 mt-1">
                            {sup.total > 0 ? ((sup.pendientes / sup.total) * 100).toFixed(0) : 0}%
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                          <div className="text-xs text-gray-500 mb-1">Rechazados</div>
                          <div className="text-2xl font-bold text-red-600">{sup.rechazados}</div>
                          <div className="text-xs text-gray-400 mt-1">
                            {sup.total > 0 ? ((sup.rechazados / sup.total) * 100).toFixed(0) : 0}%
                          </div>
                        </div>
                      </div>
                      {/* Barra de progreso visual */}
                      <div className="mt-4 h-3 bg-gray-200 rounded-full overflow-hidden flex">
                        {sup.aprobados > 0 && (
                          <div 
                            className="bg-green-500 h-full transition-all duration-500"
                            style={{ width: `${(sup.aprobados / sup.total) * 100}%` }}
                            title={`${sup.aprobados} aprobados`}
                          />
                        )}
                        {sup.pendientes > 0 && (
                          <div 
                            className="bg-yellow-500 h-full transition-all duration-500"
                            style={{ width: `${(sup.pendientes / sup.total) * 100}%` }}
                            title={`${sup.pendientes} pendientes`}
                          />
                        )}
                        {sup.rechazados > 0 && (
                          <div 
                            className="bg-red-500 h-full transition-all duration-500"
                            style={{ width: `${(sup.rechazados / sup.total) * 100}%` }}
                            title={`${sup.rechazados} rechazados`}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-12">
                  <div className="text-6xl mb-4">📊</div>
                  <p className="text-lg font-medium">No hay reembolsos en el mes actual</p>
                  <p className="text-sm mt-2">Los datos aparecerán cuando haya actividad</p>
                </div>
              )}
            </div>

            {/* Botón para ir a lista de reembolsos */}
            <div className="flex justify-center">
              <button
                onClick={() => setShowDashboard(false)}
                className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-8 py-4 rounded-xl shadow-lg font-semibold transform transition-all duration-300 hover:scale-110 hover:shadow-2xl"
              >
                📋 Ver Lista de Reembolsos
              </button>
            </div>
          </div>
        ) : (
          <div className="animate-fadeIn">
            {/* Filtros */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6 animate-fadeIn">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Filtros</h2>
            <div className="flex items-center gap-2">
              {/* Filtros rápidos */}
              <div className="flex gap-2 mr-4">
                <button
                  onClick={() => handleFilterChange('dateRange', 'week')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    filters.dateRange === 'week'
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  📅 Esta Semana
                </button>
                <button
                  onClick={() => handleFilterChange('dateRange', 'month')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    filters.dateRange === 'month'
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  📆 Este Mes
                </button>
              </div>
              <button
                onClick={clearFilters}
                className="text-sm text-blue-500 hover:text-blue-700 font-medium"
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* Filtro por estado */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              >
                <option value="all">Todos</option>
                <option value="PENDING_OCR">Procesando</option>
                <option value="PENDING_AUDIT">En Auditoría</option>
                <option value="APPROVED">Aprobados</option>
                <option value="REJECTED">Rechazados</option>
              </select>
            </div>

            {/* Filtro por tipo */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
              <select
                value={filters.type}
                onChange={(e) => handleFilterChange('type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              >
                <option value="all">Todos</option>
                <option value="TRANSPORTE">Transporte</option>
                <option value="BOLETA">Boleta</option>
              </select>
            </div>

            {/* Filtro por rango de fecha */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Período</label>
              <select
                value={filters.dateRange}
                onChange={(e) => handleFilterChange('dateRange', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              >
                <option value="all">Todo</option>
                <option value="today">Hoy</option>
                <option value="week">Última semana</option>
                <option value="month">Último mes</option>
              </select>
            </div>

            {/* Filtro por supervisor */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Supervisor</label>
              <select
                value={filters.supervisor}
                onChange={(e) => handleFilterChange('supervisor', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              >
                <option value="all">Todos ({Object.keys(supervisorMap).length})</option>
                {Object.entries(supervisorMap).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name || 'Sin nombre'}
                  </option>
                ))}
              </select>
            </div>

            {/* Fecha inicio */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Desde</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>

            {/* Fecha fin */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hasta</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>
          </div>

          {/* Estadísticas rápidas */}
          <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t">
            <div className="text-center">
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-2xl font-bold">{filteredReimbursements.length}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Pendientes</p>
              <p className="text-2xl font-bold text-yellow-600">
                {filteredReimbursements.filter(r => r.status === 'PENDING_AUDIT').length}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Aprobados</p>
              <p className="text-2xl font-bold text-green-600">
                {filteredReimbursements.filter(r => r.status === 'APPROVED').length}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Rechazados</p>
              <p className="text-2xl font-bold text-red-600">
                {filteredReimbursements.filter(r => r.status === 'REJECTED').length}
              </p>
            </div>
          </div>
        </div>

        {/* Contenido principal */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lista de reembolsos */}
          <div className={`${selectedReimb ? '' : 'lg:col-span-2'}`}>
            <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
              <h2 className="text-lg font-semibold">
                Reembolsos ({filteredReimbursements.length})
              </h2>
            </div>

            {filteredReimbursements.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No hay resultados
                </h3>
                <p className="text-gray-600">
                  No se encontraron reembolsos con los filtros aplicados
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredReimbursements.map((reimb) => (
                  <div
                    key={reimb.id}
                    onClick={() => setSelectedReimb(reimb)}
                    className={`bg-white rounded-lg shadow-sm p-4 cursor-pointer hover:shadow-md transition ${
                      selectedReimb?.id === reimb.id ? 'ring-2 ring-blue-500' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold">{reimb.profiles?.full_name}</h3>
                        <p className="text-sm text-gray-600">{reimb.profiles?.zone}</p>
                      </div>
                      <div className="flex flex-col items-end space-y-1">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          reimb.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                          reimb.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {reimb.status}
                        </span>
                        {reimb.receipt_type && (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            reimb.receipt_type.includes('NEGOTIATION') ? 'bg-red-100 text-red-800' :
                            reimb.receipt_type.includes('COMPLETED') || reimb.receipt_type.includes('ACCEPTED') ? 'bg-blue-100 text-blue-800' :
                            reimb.receipt_type === 'YAPE_TRANSACTION' ? 'bg-purple-100 text-purple-800' :
                            reimb.receipt_type === 'INVOICE' ? 'bg-gray-100 text-gray-800' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {reimb.receipt_type.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    </div>

                    {reimb.fraud_warnings && reimb.fraud_warnings.length > 0 && (
                      <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded">
                        <p className="text-xs font-semibold text-red-800">⚠️ Advertencias de Fraude:</p>
                        {reimb.fraud_warnings.slice(0, 2).map((warning, idx) => (
                          <p key={idx} className="text-xs text-red-700 mt-1">
                            • {warning.message}
                          </p>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div>
                        <p className="text-xs text-gray-500">Declarado</p>
                        <p className="font-bold">S/ {reimb.reported_amount}</p>
                      </div>
                      {reimb.detected_amount && (
                        <div>
                          <p className="text-xs text-gray-500">Detectado</p>
                          <p className="font-bold text-blue-600">S/ {reimb.detected_amount}</p>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t">
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-gray-500">
                          {reimb.type} • {new Date(reimb.created_at).toLocaleDateString()}
                        </p>
                        {reimb.ai_confidence && (
                          <p className="text-xs text-gray-600">
                            IA: {(reimb.ai_confidence * 100).toFixed(0)}%
                          </p>
                        )}
                      </div>
                      {reimb.operation_number && (
                        <p className="text-xs text-gray-500 mt-1">
                          Op: {reimb.operation_number}
                        </p>
                      )}
                    </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Panel de detalle y decisión */}
          {selectedReimb && (
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-lg p-6 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">Revisar Reembolso</h2>
                    <button
                      onClick={() => setSelectedReimb(null)}
                      className="text-gray-400 hover:text-gray-600 text-2xl"
                      title="Cerrar"
                    >
                      ×
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Info del empleado */}
                    <div className="border-b pb-4">
                      <h3 className="font-medium text-gray-700 mb-2">Empleado</h3>
                      <p className="text-sm"><span className="font-medium">Nombre:</span> {selectedReimb.profiles?.full_name}</p>
                      <p className="text-sm"><span className="font-medium">Email:</span> {selectedReimb.profiles?.email}</p>
                      <p className="text-sm"><span className="font-medium">Zona:</span> {selectedReimb.profiles?.zone}</p>
                    </div>

                    {/* Montos */}
                    <div className="border-b pb-4">
                      <h3 className="font-medium text-gray-700 mb-2">Montos</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-gray-500">Declarado</p>
                          <p className="text-2xl font-bold">S/ {selectedReimb.reported_amount}</p>
                        </div>
                        {selectedReimb.detected_amount && (
                          <div>
                            <p className="text-xs text-gray-500">Detectado (IA)</p>
                            <p className="text-2xl font-bold">S/ {selectedReimb.detected_amount}</p>
                          </div>
                        )}
                      </div>
                      {selectedReimb.detected_amount && (
                        <p className="text-sm text-gray-600 mt-2">
                          Diferencia: S/ {Math.abs(selectedReimb.reported_amount - selectedReimb.detected_amount).toFixed(2)}
                          ({((Math.abs(selectedReimb.reported_amount - selectedReimb.detected_amount) / selectedReimb.reported_amount) * 100).toFixed(2)}%)
                        </p>
                      )}
                    </div>

                    {/* Resultado IA */}
                    {selectedReimb.ai_result && (
                      <div className="border-b pb-4">
                        <h3 className="font-medium text-gray-700 mb-2">Análisis de IA</h3>
                        <p className={`text-lg font-semibold ${
                          selectedReimb.ai_result === 'COINCIDE' ? 'text-green-600' :
                          selectedReimb.ai_result.includes('NO VÁLIDO') || selectedReimb.ai_result.includes('FRAUDE') ? 'text-red-600' :
                          selectedReimb.ai_result === 'NO_COINCIDE' ? 'text-red-600' :
                          'text-orange-600'
                        }`}>
                          {selectedReimb.ai_result}
                        </p>
                        {selectedReimb.ai_confidence && (
                          <p className="text-sm text-gray-600 mt-1">
                            Confianza: {(selectedReimb.ai_confidence * 100).toFixed(1)}%
                          </p>
                        )}
                      </div>
                    )}

                    {/* Tipo de Recibo */}
                    {selectedReimb.receipt_type && (
                      <div className="border-b pb-4">
                        <h3 className="font-medium text-gray-700 mb-2">Tipo de Recibo</h3>
                        <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                          selectedReimb.receipt_type.includes('NEGOTIATION') ? 'bg-red-100 text-red-800' :
                          selectedReimb.receipt_type.includes('COMPLETED') || selectedReimb.receipt_type.includes('ACCEPTED') ? 'bg-green-100 text-green-800' :
                          selectedReimb.receipt_type === 'YAPE_TRANSACTION' ? 'bg-purple-100 text-purple-800' :
                          selectedReimb.receipt_type === 'INVOICE' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {selectedReimb.receipt_type.replace(/_/g, ' ')}
                        </span>
                        
                        {selectedReimb.operation_number && (
                          <div className="mt-2">
                            <p className="text-xs text-gray-500">Número de Operación</p>
                            <p className="text-sm font-mono">{selectedReimb.operation_number}</p>
                          </div>
                        )}
                        
                        {selectedReimb.receipt_date && (
                          <div className="mt-2">
                            <p className="text-xs text-gray-500">Fecha del Recibo</p>
                            <p className="text-sm">{new Date(selectedReimb.receipt_date).toLocaleDateString()}</p>
                          </div>
                        )}
                        
                        {selectedReimb.image_hash && (
                          <div className="mt-2">
                            <p className="text-xs text-gray-500">Hash de Imagen</p>
                            <p className="text-xs font-mono text-gray-600 truncate">{selectedReimb.image_hash}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Advertencias de Fraude */}
                    {selectedReimb.fraud_warnings && selectedReimb.fraud_warnings.length > 0 && (
                      <div className="border-b pb-4">
                        <h3 className="font-medium text-red-700 mb-2">⚠️ Advertencias de Fraude</h3>
                        <div className="space-y-2">
                          {selectedReimb.fraud_warnings.map((warning, idx) => (
                            <div key={idx} className={`p-3 rounded border ${
                              warning.severity === 'CRITICAL' ? 'bg-red-50 border-red-300' :
                              warning.severity === 'HIGH' ? 'bg-orange-50 border-orange-300' :
                              'bg-yellow-50 border-yellow-300'
                            }`}>
                              <div className="flex items-start">
                                <span className={`text-xs font-bold px-2 py-1 rounded mr-2 ${
                                  warning.severity === 'CRITICAL' ? 'bg-red-200 text-red-800' :
                                  warning.severity === 'HIGH' ? 'bg-orange-200 text-orange-800' :
                                  'bg-yellow-200 text-yellow-800'
                                }`}>
                                  {warning.severity}
                                </span>
                                <div className="flex-1">
                                  <p className="text-sm font-semibold text-gray-800">{warning.type}</p>
                                  <p className="text-sm text-gray-700 mt-1">{warning.message}</p>
                                  {warning.reason && (
                                    <p className="text-xs text-gray-600 mt-1">Razón: {warning.reason}</p>
                                  )}
                                  {warning.details && (
                                    <div className="text-xs text-gray-600 mt-1">
                                      {Object.entries(warning.details).map(([key, value]) => (
                                        <p key={key}>• {key}: {JSON.stringify(value)}</p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Evidencias */}
                    <div className="border-b pb-4">
                      <h3 className="font-medium text-gray-700 mb-2">Evidencias</h3>
                      <a
                        href={`/reimbursements/${selectedReimb.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-700 text-sm inline-block"
                      >
                        Ver todas las evidencias (nueva pestaña) →
                      </a>
                    </div>

                    {/* Comentario */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Comentario (opcional)
                      </label>
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        rows="3"
                        placeholder="Agregar observaciones..."
                      />
                    </div>
                    {/* Botones de decisión */}
                    {(selectedReimb.status === 'PENDING_AUDIT' || profile?.role === 'admin') ? (
                      <div className="grid grid-cols-2 gap-4 pt-4">
                        <button
                          onClick={() => handleDecision('REJECTED')}
                          disabled={processing}
                          className="bg-red-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-red-600 disabled:bg-gray-300 transition"
                        >
                          {processing ? 'Procesando...' : '❌ Rechazar'}
                        </button>
                        <button
                          onClick={() => handleDecision('APPROVED')}
                          disabled={processing}
                          className="bg-green-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-600 disabled:bg-gray-300 transition"
                        >
                          {processing ? 'Procesando...' : '✓ Aprobar'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                          <p className="text-sm text-yellow-800 mb-2">
                            ⚠️ Este reembolso ya fue auditado.
                          </p>
                          <p className="text-xs text-yellow-700">
                            Si encuentras algo incorrecto, puedes solicitar una revisión a los administradores.
                          </p>
                        </div>
                        <button
                          onClick={() => setShowObservationModal(true)}
                          className="w-full bg-orange-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-orange-600 transition"
                        >
                          📝 Solicitar Revisión
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          )}
        </div>
  
        {/* Panel lateral de perfil */}
        {showSidebar && (
          <>
            {/* Overlay oscuro */}
            <div 
              className="fixed inset-0 bg-black bg-opacity-50 z-40"
              onClick={() => setShowSidebar(false)}
            ></div>
            
            {/* Sidebar - Movido a la IZQUIERDA */}
            <div className="fixed left-0 top-0 h-full z-50 animate-slideIn">
              {renderSidebar(true)}
            </div>
          </>
        )}

        {/* Modal de Observación */}
        {showObservationModal && (
          <>
            {/* Overlay */}
            <div 
              className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
              onClick={() => setShowObservationModal(false)}
            >
              <div 
                className="bg-white rounded-lg p-6 max-w-lg w-full mx-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold">Solicitar Revisión</h2>
                  <button
                    onClick={() => setShowObservationModal(false)}
                    className="text-gray-400 hover:text-gray-600 text-2xl"
                  >
                    ×
                  </button>
                </div>

                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-2">
                    Explica por qué consideras que este reembolso necesita una nueva revisión:
                  </p>
                  <p className="text-xs text-gray-500 mb-4">
                    Los administradores recibirán tu solicitud y podrán habilitar la auditoría.
                  </p>
                  
                  <textarea
                    value={observationText}
                    onChange={(e) => setObservationText(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                    rows="5"
                    placeholder="Ej: La imagen muestra un monto diferente al detectado, se requiere revisión manual..."
                  />
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setShowObservationModal(false);
                      setObservationText('');
                    }}
                    className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-300"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleRequestReview}
                    disabled={processing || !observationText.trim()}
                    className="flex-1 bg-orange-500 text-white py-2 px-4 rounded-lg hover:bg-orange-600 disabled:bg-gray-300"
                  >
                    {processing ? 'Enviando...' : 'Enviar Solicitud'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
  )}
