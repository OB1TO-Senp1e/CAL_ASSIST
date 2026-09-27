import { useState } from 'react';
import { AlertCircle, Check, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/AuthContext';
import { authErrorMessage } from '@/services/auth';

type Field = 'name' | 'email' | 'password';
type Errors = Partial<Record<Field, string>>;

const MIN_PASSWORD = 8;

/**
 * Create-account form. The real endpoint is POST /auth/register
 * (`{ email, password, name? }`); the backend has no email-verification step yet,
 * so the confirmation copy is explicit about that rather than implying a flow
 * that does not exist.
 */
export function RegisterForm({ onSuccess }: { onSuccess?: () => void }) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const longEnough = password.length >= MIN_PASSWORD;

  function validate(): boolean {
    const next: Errors = {};
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = 'That does not look like an email address.';
    if (!password) next.password = 'Choose a password.';
    else if (!longEnough) next.password = `Use at least ${MIN_PASSWORD} characters.`;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await register(email.trim(), password, name.trim() || undefined);
      onSuccess?.();
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {formError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="register-name">
          Name <span className="font-normal text-subtle-foreground">(optional)</span>
        </Label>
        <Input
          id="register-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          placeholder="Alex Rivera"
          disabled={submitting}
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="register-email">Email</Label>
        <Input
          id="register-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={Boolean(errors.email)}
          disabled={submitting}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="register-password">Password</Label>
        <div className="relative">
          <Input
            id="register-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD} characters`}
            aria-invalid={Boolean(errors.password)}
            className="pr-9"
            disabled={submitting}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 grid w-8 place-items-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
        {errors.password ? (
          <p className="text-xs text-destructive">{errors.password}</p>
        ) : (
          password.length > 0 && (
            <p className={`flex items-center gap-1 text-xs ${longEnough ? 'text-success' : 'text-muted-foreground'}`}>
              {longEnough && <Check className="size-3" />}
              {longEnough ? 'Long enough' : `${MIN_PASSWORD - password.length} more character${MIN_PASSWORD - password.length === 1 ? '' : 's'}`}
            </p>
          )
        )}
      </div>

      <Button type="submit" disabled={submitting} className="w-full justify-center">
        {submitting ? (
          <>
            <Spinner className="size-3.5" />
            Creating account…
          </>
        ) : (
          'Create account'
        )}
      </Button>

      <p className="text-xs text-muted-foreground">
        This creates a local account immediately — there is no email verification step yet.
      </p>
    </form>
  );
}
