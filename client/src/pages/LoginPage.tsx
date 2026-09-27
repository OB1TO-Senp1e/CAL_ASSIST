import { useNavigate, useLocation, Link } from 'react-router-dom';
import { AuthCard } from '@/components/auth/AuthCard';
import { LoginForm } from '@/components/auth/LoginForm';

interface FromState {
  from?: { pathname: string; search?: string };
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // Return the user to wherever RequireAuth bounced them from.
  const from = (location.state as FromState | null)?.from;
  const destination = from ? `${from.pathname}${from.search ?? ''}` : '/';

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
    </AuthCard>
  );
}
