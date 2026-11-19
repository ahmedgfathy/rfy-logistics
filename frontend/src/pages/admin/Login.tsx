import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, LogIn } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { BrandMark } from '../../components/layout/Logo';
import { Input } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';

export function Login() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/auth/login', { email, password });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'session'] });
      navigate('/admin', { replace: true });
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-steel-50 px-4 py-12">
      <div className="absolute inset-0 bg-grid opacity-50" aria-hidden="true" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark className="h-11 w-auto max-w-[8rem]" />
          <div>
            <p className="text-lg font-extrabold text-navy-800">RFY Operations</p>
            <p className="text-xs text-steel-500">Staff access only</p>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-steel-200 bg-white p-7 shadow-lift">
          <h1 className="text-xl font-extrabold text-navy-800">Sign in</h1>
          <p className="mt-1 text-sm text-steel-500">Use your operations account to continue.</p>

          {error ? (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          ) : null}

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="field-label">Email</span>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                dir="ltr"
                required
              />
            </label>
            <label className="block">
              <span className="field-label">Password</span>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                dir="ltr"
                required
                minLength={8}
              />
            </label>
          </div>

          <Button type="submit" disabled={busy} className="mt-6 w-full" icon={<LogIn className="h-4 w-4" aria-hidden="true" />}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>

          <p className="mt-5 rounded-lg bg-steel-50 px-3 py-2 text-[0.72rem] leading-relaxed text-steel-500">
            Credentials are seeded from <code className="font-mono">ADMIN_EMAIL</code> and <code className="font-mono">ADMIN_PASSWORD</code> in your
            <code className="font-mono"> .env</code>. Change them before going live.
          </p>
        </form>
      </div>
    </div>
  );
}
