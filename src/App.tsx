import { useStore } from '@/lib/store';
import LoginScreen from '@/screens/LoginScreen';
import CitizenDashboard from '@/screens/CitizenDashboard';
import AuthorityDashboard from '@/screens/AuthorityDashboard';
import WorkforceDashboard from '@/screens/WorkforceDashboard';
import InfluencerDashboard from '@/screens/InfluencerDashboard';
import AdminDashboard from '@/screens/AdminDashboard';
import ToastContainer from '@/components/ui/Toast';

function App() {
  const { currentUser, authStatus } = useStore();

  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!currentUser || authStatus === 'unauthenticated' || authStatus === 'pending' || authStatus === 'rejected') {
    return (
      <>
        <LoginScreen />
        <ToastContainer />
      </>
    );
  }

  return (
    <>
      {currentUser.role === 'citizen' && <CitizenDashboard />}
      {currentUser.role === 'authority' && <AuthorityDashboard />}
      {currentUser.role === 'workforce' && <WorkforceDashboard />}
      {currentUser.role === 'influencer' && <InfluencerDashboard />}
      {currentUser.role === 'admin' && <AdminDashboard />}
      <ToastContainer />
    </>
  );
}

export default App;
