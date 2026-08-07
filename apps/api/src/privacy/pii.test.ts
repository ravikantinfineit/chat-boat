import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blindIndex, decryptPii, encryptPii, normalise } from './pii.util';

const SECRET = 'test-secret-for-unit-tests-only';

test('encryption round-trips', () => {
  const encrypted = encryptPii('+91 98765 43210', SECRET);

  assert.notEqual(encrypted, '+91 98765 43210');
  assert.equal(decryptPii(encrypted, SECRET), '+91 98765 43210');
});

test('encryption is randomised, so two identical values do not look alike', () => {
  // This is exactly why the blind index has to exist: a WHERE on the ciphertext
  // could never match.
  assert.notEqual(encryptPii('same', SECRET), encryptPii('same', SECRET));
});

test('values written before encryption are still readable', () => {
  assert.equal(decryptPii('Ravi Kumar', SECRET), 'Ravi Kumar');
});

test('a value encrypted under another key is reported, not shown raw', () => {
  const foreign = encryptPii('secret', 'a-different-app-secret');

  assert.match(decryptPii(foreign, SECRET), /unreadable/);
});

/**
 * The property erasure depends on. One person writes their number three ways
 * across three conversations; all three must produce one index entry, or
 * "delete everything about me" deletes a third of it.
 */
test('one Indian mobile written every common way gives one fingerprint', () => {
  const spellings = [
    '9876543210',
    '98765 43210',
    '098765 43210',
    '09876543210',
    '+91 98765 43210',
    '+919876543210',
    '91-98765-43210',
  ];

  const fingerprints = new Set(spellings.map((s) => blindIndex(s, SECRET, 'phone')));

  assert.equal(fingerprints.size, 1, `expected one fingerprint, got ${fingerprints.size}`);
});

test('two different people never share a fingerprint', () => {
  assert.notEqual(blindIndex('9876543210', SECRET, 'phone'), blindIndex('9876543211', SECRET, 'phone'));
});

test('a foreign number beginning 91 or 0 is left intact', () => {
  // 91 followed by something other than ten digits is not an Indian country
  // code, and stripping it would merge two unrelated people.
  assert.equal(normalise('+9112345', 'phone'), '9112345');
  assert.equal(normalise('012345678901234', 'phone'), '012345678901234');
});

test('email fingerprints ignore case and surrounding space', () => {
  assert.equal(
    blindIndex('  Customer@Example.COM ', SECRET, 'email'),
    blindIndex('customer@example.com', SECRET, 'email'),
  );
});

test('the fingerprint is keyed, so it is not a reversible hash of the number', () => {
  assert.notEqual(
    blindIndex('9876543210', SECRET, 'phone'),
    blindIndex('9876543210', 'another-secret', 'phone'),
  );
  // And a phone fingerprint never collides with an email one for the same text.
  assert.notEqual(blindIndex('x@y.com', SECRET, 'phone'), blindIndex('x@y.com', SECRET, 'email'));
});
