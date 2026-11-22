import { useEffect, useState, type FormEvent } from 'react';
import { LogIn, X } from 'lucide-react';
import { signInWithGoogle } from '../lib/firebase';
import {
  deriveDisplayNameFromEmail,
  validateAuthForm,
  type AuthenticatedUser,
  type AuthFormErrors,
  type AuthMode,
  type UserRole,
} from '../utils/authValidation';

interface AuthModalProps {
  open: boolean;
  initialRole?: UserRole;
  onClose: () => void;
  onAuthenticated: (user: AuthenticatedUser) => void;
}

export function AuthModal({
  open,
  initialRole = 'operator',
  onClose,
  onAuthenticated,
}: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(initialRole);
  const [errors, setErrors] = useState<AuthFormErrors>({});
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRole(initialRole);
      setErrors({});
      setGoogleError(null);
    }
  }, [open, initialRole]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleGoogleSignIn = async () => {
    setGoogleBusy(true);
    setGoogleError(null);
    try {
      const cred = await signInWithGoogle();
      const gUser = cred.user;
      onAuthenticated({
        fullName:
          gUser.displayName || deriveDisplayNameFromEmail(gUser.email || 'engineer@kilnova.local'),
        email: gUser.email || 'engineer@kilnova.local',
        role,
      });
    } catch (err) {
      setGoogleError(
        err instanceof Error ? err.message : 'Google sign-in popup was cancelled or blocked.'
      );
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const validation = validateAuthForm(mode, { fullName, email, password, role });
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    const resolvedName =
      mode === 'register' ? fullName.trim() : deriveDisplayNameFromEmail(email);

    onAuthenticated({
      fullName: resolvedName,
      email: email.trim(),
      role,
    });
    setFullName('');
    setPassword('');
    setErrors({});
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-[#0B0C0D]/72 backdrop-blur-sm transition-opacity"
      />

      <div className="relative z-10 w-full max-w-md rounded-xl border border-[#CBD5E1] bg-white p-6 sm:p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] font-medium tracking-[0.14em] uppercase text-[#1D64D8]">
              Kilnova Access
            </p>
            <h2
              id="auth-modal-title"
              className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.02em] text-[#0B0C0D]"
            >
              {mode === 'login' ? 'Sign in to Kilnova' : 'Create platform account'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close login and register dialog"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#CBD5E1] text-[#475569] transition-colors hover:border-[#0B0C0D] hover:text-[#0B0C0D] focus-visible:outline-2 focus-visible:outline-[#1D64D8] cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Google Sign-In for Firestore RAG persistence */}
        <div className="mt-5">
          <button
            type="button"
            disabled={googleBusy}
            onClick={handleGoogleSignIn}
            className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-[#1D64D8] bg-[#EFF6FF] px-4 py-2 text-xs font-semibold text-[#0B4EA2] transition-colors hover:bg-[#1D64D8] hover:text-white disabled:opacity-60 cursor-pointer"
          >
            <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {googleBusy ? 'Connecting to Google...' : 'Continue with Google (Sync RAG Docs)'}
            </span>
          </button>
          {googleError && (
            <p role="alert" className="mt-1.5 text-xs font-medium text-[#DC2626]">
              {googleError}
            </p>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Authentication mode"
          className="mt-5 grid grid-cols-2 gap-1 rounded-lg border border-[#D4DCE7] bg-[#F1F5F9] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            onClick={() => {
              setMode('login');
              setErrors({});
            }}
            className={`min-h-[38px] rounded-md text-xs font-medium tracking-[0.03em] transition-colors cursor-pointer ${
              mode === 'login'
                ? 'bg-[#0B0C0D] text-white font-semibold'
                : 'text-[#475569] hover:text-[#0B0C0D]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            onClick={() => {
              setMode('register');
              setErrors({});
            }}
            className={`min-h-[38px] rounded-md text-xs font-medium tracking-[0.03em] transition-colors cursor-pointer ${
              mode === 'register'
                ? 'bg-[#0B0C0D] text-white font-semibold'
                : 'text-[#475569] hover:text-[#0B0C0D]'
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-[#334155]">Workspace Role</legend>
            <div className="grid grid-cols-2 gap-2.5">
              {(['operator', 'supervisor'] as const).map((option) => {
                const selected = role === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setRole(option)}
                    className={`min-h-[42px] rounded-lg border px-3.5 py-2 text-xs font-medium capitalize tracking-[0.03em] transition-colors cursor-pointer ${
                      selected
                        ? 'border-[#1D64D8] bg-[#EFF6FF] text-[#0B4EA2] font-semibold'
                        : 'border-[#CBD5E1] bg-white text-[#475569] hover:border-[#0B0C0D] hover:text-[#0B0C0D]'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {mode === 'register' && (
            <div>
              <label
                htmlFor="auth-fullname"
                className="mb-1.5 block text-xs font-medium text-[#1E293B]"
              >
                Full Name
              </label>
              <input
                id="auth-fullname"
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: undefined }));
                }}
                placeholder="Karim Benali"
                autoComplete="name"
                className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2.5 text-sm text-[#0B0C0D] placeholder:text-[#94A3B8] focus:border-[#1D64D8] focus:outline-none"
              />
              {errors.fullName && (
                <p role="alert" className="mt-1.5 text-xs font-medium text-[#0B4EA2]">
                  {errors.fullName}
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="mb-1.5 block text-xs font-medium text-[#1E293B]">
              Work Email
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
              }}
              placeholder="name@plant-domain.example"
              autoComplete="email"
              className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2.5 text-sm text-[#0B0C0D] placeholder:text-[#94A3B8] focus:border-[#1D64D8] focus:outline-none"
            />
            {errors.email && (
              <p role="alert" className="mt-1.5 text-xs font-medium text-[#0B4EA2]">
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="auth-password"
              className="mb-1.5 block text-xs font-medium text-[#1E293B]"
            >
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              placeholder="Minimum 8 characters"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2.5 text-sm text-[#0B0C0D] placeholder:text-[#94A3B8] focus:border-[#1D64D8] focus:outline-none"
            />
            {errors.password && (
              <p role="alert" className="mt-1.5 text-xs font-medium text-[#0B4EA2]">
                {errors.password}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="mt-2 inline-flex min-h-[46px] w-full items-center justify-center rounded-lg bg-[#1D64D8] px-6 py-3 text-sm font-semibold tracking-[0.02em] text-white transition-colors hover:bg-[#0B4EA2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D64D8] cursor-pointer"
          >
            {mode === 'login' ? 'Continue to Workspace' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
