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
        </>
      }
    >
      <RegisterForm onSuccess={() => navigate('/', { replace: true })} />
    </AuthCard>
  );
}
