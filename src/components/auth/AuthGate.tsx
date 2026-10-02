import { useAuth } from '@/context/AuthContext';
import { AuthScreen } from './AuthScreen';
import { ProgressProvider } from '@/context/ProgressContext';
import App from '@/App';

export function AuthGate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-loading" role="status">Restoring your session…</div>;
  if (!user) return <AuthScreen />;
  return <ProgressProvider key={user.id} user={user}><App /></ProgressProvider>;
}
