import { useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { AuthCard } from '@/components/auth/AuthCard';
import { LoginForm } from '@/components/auth/LoginForm';
import { useAuth } from '@/contexts/AuthContext';

interface FromState {
  from?: { pathname: string; search?: string };
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // Return the user to wherever RequireAuth bounced them from.
  const from = (location.state as FromState | null)?.from;
  const destination = from ? `${from.pathname}${from.search ?? ''}` : '/';
  const { loginWithToken } = useAuth();

  useEffect(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get('access_token');
    if (!token) return;

    window.history.replaceState({}, document.title, `${location.pathname}${location.search}`);
    loginWithToken(token)
      .then(() => navigate(destination, { replace: true }))
      .catch(() => navigate('/login', { replace: true }));
  }, [location.hash, location.pathname, location.search, loginWithToken, navigate, destination]);

  return (
    <AuthCard
      eyebrow="Welcome back"
      title="Sign in to CalAssist"
      subtitle="Your plan, your commitments and your assistant, exactly where you left them."
      footer={
        <>
          No account yet?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <LoginForm onSuccess={() => navigate(destination, { replace: true })} />
      <a
        href="/auth/google"
        className="mt-4 flex h-10 items-center justify-center rounded-md border border-border bg-background text-sm font-medium hover:bg-muted"
      >
        Continue with Google
      </a>
    </AuthCard>
  );
}
