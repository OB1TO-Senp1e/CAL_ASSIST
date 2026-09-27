import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          className="field-control w-full px-3.5 py-2.5 text-sm"
          required
        />
      </div>
      
      <div>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="Enter your password"
          className="field-control w-full px-3.5 py-2.5 text-sm"
          required
        />
      </div>
      
      <Button type="submit" disabled={loading} className="mt-2 w-full justify-center rounded-xl py-2.5 shadow-lg shadow-primary/15">
        {loading ? 'Signing in...' : 'Sign In'}
      </Button>
    </form>
  );
}
