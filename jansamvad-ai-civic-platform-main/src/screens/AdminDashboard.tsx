import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, Clock, RefreshCw, AlertCircle } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { useStore } from '@/lib/store';
import { useI18n } from '@/lib/i18n';
import { apiGetPendingRequests, apiApproveRequest, apiRejectRequest, type AccessRequestDto } from '@/lib/api';

export default function AdminDashboard() {
  const { currentUser, toast } = useStore();
  const { t } = useI18n();
  const [requests, setRequests] = useState<AccessRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [activeNav, setActiveNav] = useState('requests');

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

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleApprove = async (userId: number) => {
    setActionLoading(userId);
    try {
      await apiApproveRequest(userId);
      setRequests((prev) => prev.filter((r) => r.id !== userId));
      toast(t('admin.approved'), 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve';
      toast(message, 'warning');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (userId: number) => {
    setActionLoading(userId);
    try {
      await apiRejectRequest(userId);
      setRequests((prev) => prev.filter((r) => r.id !== userId));
      toast(t('admin.rejected'), 'info');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject';
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
  ];

  return (
    <DashboardLayout
      navItems={navItems}
      activeNav={activeNav}
      onNavChange={setActiveNav}
      title={t('admin.title')}
      subtitle={t('admin.subtitle')}
      role="admin"
    >
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
            Refresh
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
    </DashboardLayout>
  );
}
