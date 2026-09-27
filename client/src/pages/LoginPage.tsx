import { LoginForm } from '@/components/auth/LoginForm';
import { Link } from 'react-router-dom';

export function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/20">
            <span className="text-2xl font-bold">C</span>
          </div>
          <p className="page-eyebrow mb-2">Make room for what matters</p>
          <h1 className="text-3xl font-bold tracking-tight">Welcome to CalAssist</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your personal time, planning, and focus companion.</p>
        </div>
        <div className="surface-card p-6 sm:p-8">
          <LoginForm />
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Want to explore the system?{' '}
          <Link className="font-medium text-primary hover:underline" to="/architecture">
            View the architecture
          </Link>
        </p>
      </div>
    </div>
  );
}
