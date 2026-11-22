import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContactForm } from './contactValidation';

test('validateContactForm rejects empty or malformed fields with explicit error messages', () => {
  const errors = validateContactForm({
    fullName: 'A',
    email: 'invalid-email',
    subject: 'Hi',
    message: 'Too short',
  });

  assert.ok(errors.fullName);
  assert.ok(errors.email);
  assert.ok(errors.subject);
  assert.ok(errors.message);
});

test('validateContactForm passes a complete valid contact inquiry', () => {
  const errors = validateContactForm({
    fullName: 'Karim Benali',
    email: 'k.benali@cement-ops.example',
    subject: 'Rotary Kiln Thermal Monitoring Inquiry',
    message: 'Interested in evaluating KILNOVA for our Line 01 rotary kiln monitoring workflow.',
  });

  assert.deepEqual(errors, {});
});
