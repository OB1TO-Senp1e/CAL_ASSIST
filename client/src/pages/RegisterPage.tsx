import { useNavigate, Link } from 'react-router-dom';
import { AuthCard } from '@/components/auth/AuthCard';
import { RegisterForm } from '@/components/auth/RegisterForm';

export function RegisterPage() {
  const navigate = useNavigate();

  return (
    <AuthCard
      eyebrow="Get started"
      title="Create your account"
      subtitle="CalAssist works on your time — it needs nothing from you until you ask it to plan."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
          <span className="mx-2 text-muted-foreground" aria-hidden>·</span>
          <Link to="/privacy" className="text-muted-foreground hover:underline">Privacy</Link>
          <span className="mx-1 text-muted-foreground" aria-hidden>·</span>
          <Link to="/terms" className="text-muted-foreground hover:underline">Terms</Link>
        </>
      }
    >
      <RegisterForm onSuccess={() => navigate('/', { replace: true })} />
      <p className="mt-3 text-2xs text-muted-foreground">
        By creating an account you agree to our{' '}
        <Link to="/terms" className="underline hover:text-foreground">Terms of Service</Link> and{' '}
        <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
      </p>
    </AuthCard>
  );
}
