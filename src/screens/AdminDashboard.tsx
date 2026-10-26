import { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldCheck, CircleCheck as CheckCircle2, Circle as XCircle, Clock, RefreshCw, CircleAlert as AlertCircle, Users, Building2, HardHat, Megaphone } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { useStore } from '@/lib/store';
import { useI18n } from '@/lib/i18n';
import { apiGetPendingRequests, apiApproveRequest, apiRejectRequest, type AccessRequestDto } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import CitizenDashboard from '@/screens/CitizenDashboard';
import AuthorityDashboard from '@/screens/AuthorityDashboard';
import WorkforceDashboard from '@/screens/WorkforceDashboard';
import InfluencerDashboard from '@/screens/InfluencerDashboard';

const ADMIN_SECTIONS = ['requests', 'preview-citizen', 'preview-authority', 'preview-workforce', 'preview-influencer'] as const;
type AdminSection = (typeof ADMIN_SECTIONS)[number];

function readHashSection(): AdminSection {
  const h = window.location.hash.replace(/^#/, '');
  return (ADMIN_SECTIONS as readonly string[]).includes(h) ? (h as AdminSection) : 'requests';
}

export default function AdminDashboard() {
  const { currentUser, toast } = useStore();
  const { t } = useI18n();
  const [requests, setRequests] = useState<AccessRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<AdminSection>(readHashSection);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGetPendingRequests();
      setRequests(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('admin.loadError');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadRequestsRef = useRef(loadRequests);
  loadRequestsRef.current = loadRequests;

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // Realtime: refetch pending requests whenever a profiles row changes (signup/approve/reject).
  useEffect(() => {
    let active = true;
    const channel = supabase
      .channel('profiles-pending-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          if (active) loadRequestsRef.current();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Refetch when the tab regains focus, so cross-tab changes are picked up quickly.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadRequestsRef.current();
    };
    const onFocus = () => loadRequestsRef.current();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    const onHash = () => setActiveNav(readHashSection());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (window.location.hash.replace(/^#/, '') !== activeNav) {
      window.location.hash = activeNav;
    }
  }, [activeNav]);

  const handleApprove = async (userId: string) => {
    setActionLoading(userId);
    try {
      await apiApproveRequest(userId);
      setRequests((prev) => prev.filter((r) => r.id !== userId));
      toast(t('admin.approved'), 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('admin.failApprove');
      toast(message, 'warning');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (userId: string) => {
    setActionLoading(userId);
    try {
      await apiRejectRequest(userId);
      setRequests((prev) => prev.filter((r) => r.id !== userId));
      toast(t('admin.rejected'), 'info');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('admin.failReject');
      toast(message, 'warning');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (iso: string): string => {
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  const roleDisplay: Record<string, string> = {
    CITIZEN: t('role.citizen'),
    MUNICIPAL_AUTHORITY: t('role.authority'),
    FIELD_WORKFORCE: t('role.workforce'),
    INFLUENCER_REPORTER: t('role.influencer'),
  };

  const navItems = [
    { id: 'requests', label: t('admin.pendingRequests'), icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'preview-citizen', label: t('role.citizen'), icon: <Users className="w-4 h-4" /> },
    { id: 'preview-authority', label: t('role.authority'), icon: <Building2 className="w-4 h-4" /> },
    { id: 'preview-workforce', label: t('role.workforce'), icon: <HardHat className="w-4 h-4" /> },
    { id: 'preview-influencer', label: t('role.influencer'), icon: <Megaphone className="w-4 h-4" /> },
  ];

  const sectionTitles: Record<AdminSection, string> = {
    'requests': t('admin.title'),
    'preview-citizen': t('role.citizen'),
    'preview-authority': t('role.authority'),
    'preview-workforce': t('role.workforce'),
    'preview-influencer': t('role.influencer'),
  };
  const sectionSubtitles: Record<AdminSection, string> = {
    'requests': t('admin.subtitle'),
    'preview-citizen': t('role.portal', { label: t('role.citizen') }),
    'preview-authority': t('role.portal', { label: t('role.authority') }),
    'preview-workforce': t('role.portal', { label: t('role.workforce') }),
    'preview-influencer': t('role.portal', { label: t('role.influencer') }),
  };

  return (
    <DashboardLayout
      navItems={navItems}
      activeNav={activeNav}
      onNavChange={(id) => setActiveNav(id as AdminSection)}
      title={sectionTitles[activeNav]}
      subtitle={sectionSubtitles[activeNav]}
      role="admin"
    >
      {activeNav === 'preview-citizen' && <CitizenDashboard embedded />}
      {activeNav === 'preview-authority' && <AuthorityDashboard embedded />}
      {activeNav === 'preview-workforce' && <WorkforceDashboard embedded />}
      {activeNav === 'preview-influencer' && <InfluencerDashboard embedded />}
      {activeNav === 'requests' && (
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
          <div className="p-3 bg-slate-100 rounded-lg">
            <Clock className="w-6 h-6 text-slate-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{loading ? '—' : requests.length}</p>
            <p className="text-sm text-gray-500">{t('admin.totalRequests')}</p>
          </div>
          <button
            onClick={loadRequests}
            disabled={loading}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('admin.refresh')}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-4 bg-rose-50 border border-rose-200 rounded-xl">
            <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
            <span className="ml-2 text-sm text-gray-500">{t('admin.loading')}</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && requests.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">{t('admin.noRequests')}</p>
          </div>
        )}

        {/* Requests table */}
        {!loading && !error && requests.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left font-semibold text-gray-700 px-4 py-3">{t('admin.name')}</th>
                    <th className="text-left font-semibold text-gray-700 px-4 py-3 hidden sm:table-cell">{t('admin.email')}</th>
                    <th className="text-left font-semibold text-gray-700 px-4 py-3 hidden md:table-cell">{t('admin.mobile')}</th>
                    <th className="text-left font-semibold text-gray-700 px-4 py-3">{t('admin.requestedRole')}</th>
                    <th className="text-left font-semibold text-gray-700 px-4 py-3 hidden lg:table-cell">{t('admin.submittedOn')}</th>
                    <th className="text-right font-semibold text-gray-700 px-4 py-3">{t('admin.action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requests.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{req.fullName}</td>
                      <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{req.email}</td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{req.mobileNumber}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                          {roleDisplay[req.requestedRole || ''] || req.requestedRole || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{formatDate(req.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleApprove(req.id)}
                            disabled={actionLoading === req.id}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {t('admin.approve')}
                          </button>
                          <button
                            onClick={() => handleReject(req.id)}
                            disabled={actionLoading === req.id}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-rose-500 rounded-lg hover:bg-rose-600 disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            {t('admin.reject')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      )}
    </DashboardLayout>
  );
}
