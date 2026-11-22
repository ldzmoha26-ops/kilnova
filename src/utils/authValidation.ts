export type AuthMode = 'login' | 'register';
export type UserRole = 'operator' | 'supervisor';

export interface AuthFormValues {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface AuthFormErrors {
  fullName?: string;
  email?: string;
  password?: string;
}

export interface AuthenticatedUser {
  fullName: string;
  email: string;
  role: UserRole;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateAuthForm(mode: AuthMode, values: AuthFormValues): AuthFormErrors {
  const errors: AuthFormErrors = {};

  if (mode === 'register' && values.fullName.trim().length < 2) {
    errors.fullName = 'Enter your full name (at least 2 characters).';
  }

  const trimmedEmail = values.email.trim();
  if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
    errors.email = 'Enter a valid work email address.';
  }

  if (values.password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }

  return errors;
}

export function deriveDisplayNameFromEmail(email: string): string {
  const localPart = email.trim().split('@')[0] ?? 'Engineer';
  const cleaned = localPart
    .replace(/[._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
  return cleaned || 'Kiln Engineer';
}
