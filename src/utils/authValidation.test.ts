import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveDisplayNameFromEmail, validateAuthForm } from './authValidation';

test('validateAuthForm rejects empty login fields with explicit messages', () => {
  const errors = validateAuthForm('login', {
    fullName: '',
    email: '',
    password: '',
    role: 'operator',
  });
  assert.ok(errors.email);
  assert.ok(errors.password);
  assert.equal(errors.fullName, undefined);
});

test('validateAuthForm requires fullName during registration', () => {
  const errors = validateAuthForm('register', {
    fullName: 'A',
    email: 'operator@kilnova.io',
    password: 'kiln-secure-password',
    role: 'supervisor',
  });
  assert.ok(errors.fullName);
  assert.equal(errors.email, undefined);
  assert.equal(errors.password, undefined);
});

test('validateAuthForm passes valid login and registration payloads', () => {
  const loginErrors = validateAuthForm('login', {
    fullName: '',
    email: 'ops.lead@kilnova.io',
    password: 'Password123!',
    role: 'operator',
  });
  assert.deepEqual(loginErrors, {});

  const registerErrors = validateAuthForm('register', {
    fullName: 'Nadia Mansouri',
    email: 'nadia.mansouri@kilnova.io',
    password: 'Password123!',
    role: 'supervisor',
  });
  assert.deepEqual(registerErrors, {});
});

test('deriveDisplayNameFromEmail formats dotted email prefixes cleanly', () => {
  assert.equal(deriveDisplayNameFromEmail('karim.benali@plant.io'), 'Karim Benali');
  assert.equal(deriveDisplayNameFromEmail('supervisor_01@plant.io'), 'Supervisor 01');
});
