import { useState, type FormEvent } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';

type Mode = 'signin' | 'signup';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setMessage(null);
    setPassword('');
    setConfirmPassword('');
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setMessage({ kind: 'error', text: 'Enter a valid email address.' });
      return;
    }
    if (password.length < 6) {
      setMessage({ kind: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setMessage({ kind: 'error', text: 'The passwords do not match.' });
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        const result = await signUp(normalizedEmail, password, fullName);
        if (result.confirmationRequired) {
          setMessage({ kind: 'success', text: 'Check your email for a confirmation link, then come back here to sign in.' });
          setMode('signin');
          setPassword('');
          setConfirmPassword('');
        }
      } else {
        await signIn(normalizedEmail, password);
      }
    } catch (error) {
      setMessage({ kind: 'error', text: friendlyAuthError(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <Card className="auth-card">
        <CardBody>
          <div className="brand auth-brand">
            <div className="brand-mark" aria-hidden="true">DS</div>
            <div><strong>DSA Command Center</strong><span>Progress that follows you</span></div>
          </div>
          <h1>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
          <p className="muted">Sign in to keep your DSA progress synced across devices.</p>
          <div className="auth-tabs" role="tablist" aria-label="Account action">
            <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'active' : ''} onClick={() => switchMode('signin')}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')}>Create account</button>
          </div>
          <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
            {mode === 'signup' && (
              <label htmlFor="auth-name">Name <span className="muted">(optional)</span>
                <input id="auth-name" className="field" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </label>
            )}
            <label htmlFor="auth-email">Email
              <input id="auth-email" className="field" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label htmlFor="auth-password">Password
              <span className="password-field">
                <input id="auth-password" className="field" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required value={password} onChange={(event) => setPassword(event.target.value)} />
                <button type="button" className="text-btn password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button>
              </span>
            </label>
            {mode === 'signup' && <label htmlFor="auth-confirm-password">Confirm password
              <input id="auth-confirm-password" className="field" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </label>}
            {message && <p className={`auth-message ${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
            <button type="submit" className="primary-btn auth-submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}

function friendlyAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('invalid login credentials')) return 'Email or password is incorrect.';
  if (message.includes('already registered') || message.includes('user already exists')) return 'This email may already have an account. Try signing in.';
  if (message.includes('password should be') || message.includes('weak password')) return 'Choose a stronger password and try again.';
  if (message.includes('email not confirmed')) return 'Confirm your email from the link we sent, then sign in.';
  if (message.includes('fetch') || message.includes('network')) return 'Could not reach the sign-in service. Check your connection and try again.';
  return 'We could not complete that request. Check your details and try again.';
}
