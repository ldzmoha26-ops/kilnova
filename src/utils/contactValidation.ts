export interface ContactFormInput {
  fullName: string;
  email: string;
  subject: string;
  message: string;
}

export interface ContactFormErrors {
  fullName?: string;
  email?: string;
  subject?: string;
  message?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactForm(input: ContactFormInput): ContactFormErrors {
  const errors: ContactFormErrors = {};

  if (input.fullName.trim().length < 2) {
    errors.fullName = 'Please enter your full name.';
  }

  if (!EMAIL_PATTERN.test(input.email.trim())) {
    errors.email = 'Please enter a valid email address.';
  }

  if (input.subject.trim().length < 3) {
    errors.subject = 'Please provide a brief subject for your inquiry.';
  }

  if (input.message.trim().length < 12) {
    errors.message = 'Please enter a message of at least 12 characters.';
  }

  return errors;
}
