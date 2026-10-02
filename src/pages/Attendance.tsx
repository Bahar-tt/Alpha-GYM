import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FeatureLockedScreen from '../components/FeatureLockedScreen';
import { apiGet } from '../services/api';
import { Fingerprint, Wifi, Users, Activity, RefreshCw } from 'lucide-react';

interface Scan {
  id: number;
  member_id: number;
  member_name: string;
  member_code: string;
  scan_type: string;
  scan_time: string;
}

interface Stats {
  total_members: number;
  today_scans: number;
  active_members: number;
  expired_members: number;
}

function formatTime(timeStr: string): string {
  try {
    const d = new Date(timeStr.replace(' ', 'T'));
    return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return timeStr;
  }
}

export default function Attendance() {
  const { hasFeature } = useAuth();
  const navigate = useNavigate();
  const [scans, setScans] = useState<Scan[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAntenna, setShowAntenna] = useState(false);

  useEffect(() => {
    if (!hasFeature('attendance')) return;
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [hasFeature]);

  const fetchData = async () => {
    try {
      const [scansRes, statsRes] = await Promise.all([
        apiGet<Scan[]>('/attendance/today'),
        apiGet<Stats>('/attendance/stats'),
      ]);
      if (scansRes.data) {
        setScans(scansRes.data);
        if (scansRes.data.length > 0) {
          setShowAntenna(true);
          setTimeout(() => setShowAntenna(false), 3000);
        }
      }
      if (statsRes.data) setStats(statsRes.data);
    } catch (err) {
      console.error('Attendance fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!hasFeature('attendance')) {
    return (
      <FeatureLockedScreen
        icon={Fingerprint}
        title="حضور و غیاب هوشمند با اسکنر انگشت"
        description="کنترل دقیق ورود و خروج اعضا با یک لمس انگشت"
        onBack={() => navigate('/dashboard')}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {showAntenna && (
        <div className="fixed top-6 left-6 z-50 animate-bounce">
          <div className="bg-emerald-500/20 border border-emerald-500/40 rounded-full p-4">
            <Wifi className="text-emerald-400" size={32} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Fingerprint className="text-gold-400" size={26} />
          حضور و غیاب با اسکنر انگشت
        </h1>
        <button onClick={fetchData} className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-gold-400">
          <RefreshCw size={20} />
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="glass-card p-4 text-center">
            <Users className="text-gold-400 mx-auto mb-2" size={24} />
            <p className="text-2xl font-bold text-white">{stats.total_members}</p>
            <p className="text-xs text-gray-500">کل اعضا</p>
          </div>
          <div className="glass-card p-4 text-center">
            <Activity className="text-emerald-400 mx-auto mb-2" size={24} />
            <p className="text-2xl font-bold text-white">{stats.today_scans}</p>
            <p className="text-xs text-gray-500">اسکن امروز</p>
          </div>
          <div className="glass-card p-4 text-center">
            <Users className="text-blue-400 mx-auto mb-2" size={24} />
            <p className="text-2xl font-bold text-white">{stats.active_members}</p>
            <p className="text-xs text-gray-500">اعضای فعال</p>
          </div>
          <div className="glass-card p-4 text-center">
            <Users className="text-red-400 mx-auto mb-2" size={24} />
            <p className="text-2xl font-bold text-white">{stats.expired_members}</p>
            <p className="text-xs text-gray-500">اعضای منقضی</p>
          </div>
        </div>
      )}

      <div className="glass-card p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">اسکن‌های امروز</h3>
        {loading ? (
          <p className="text-gray-500 text-center py-8">در حال بارگذاری...</p>
        ) : scans.length === 0 ? (
          <div className="text-center py-8">
            <Fingerprint className="text-gray-600 mx-auto mb-3" size={48} />
            <p className="text-gray-500">هنوز اسکنی ثبت نشده</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {scans.map((scan) => (
              <div key={scan.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gold-500/10 flex items-center justify-center">
                    <Fingerprint className="text-gold-400" size={20} />
                  </div>
                  <div>
                    <p className="text-white text-sm">{scan.member_name}</p>
                    <p className="text-gray-500 text-xs" dir="ltr">{scan.member_code}</p>
                  </div>
                </div>
                <div className="text-left">
                  <p className="text-gray-400 text-xs">{formatTime(scan.scan_time)}</p>
                  <p className="text-gray-600 text-xs">{scan.scan_type === 'check_in' ? 'ورود' : 'خروج'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
