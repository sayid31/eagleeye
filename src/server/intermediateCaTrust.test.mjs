import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';
import {
  extractPemCertificates,
  installIntermediateCaTrust,
  readIntermediateCertificates,
  INTERMEDIATE_CA_DIR,
} from './intermediateCaTrust.mjs';

const BUNDLED_DIR = path.resolve(INTERMEDIATE_CA_DIR);

test('extractPemCertificates keeps certificates and drops private keys', () => {
  const text = [
    '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----',
    '-----BEGIN PRIVATE KEY-----\nSECRET\n-----END PRIVATE KEY-----',
    '-----BEGIN CERTIFICATE-----\nBBBB\n-----END CERTIFICATE-----',
  ].join('\n');
  const certs = extractPemCertificates(text);
  assert.equal(certs.length, 2);
  assert.ok(certs.every((c) => !c.includes('SECRET')));
  assert.deepEqual(extractPemCertificates(''), []);
});

test('readIntermediateCertificates returns [] for a missing directory', () => {
  assert.deepEqual(readIntermediateCertificates(path.join(os.tmpdir(), 'gev-no-such-ca-dir')), []);
});

test('the bundled intermediates (Pasuruan DigiCert G2, Malang GeoTrust G1) are unexpired CA certificates', () => {
  const parsed = readIntermediateCertificates(BUNDLED_DIR).map((pem) => new X509Certificate(pem));
  const subjects = parsed.map((x509) => x509.subject).join('\n');
  assert.match(subjects, /DigiCert Global G2 TLS RSA SHA256 2020 CA1/);
  assert.match(subjects, /GeoTrust TLS RSA CA G1/);
  for (const x509 of parsed) {
    assert.equal(x509.ca, true, x509.subject);
    assert.ok(new Date(x509.validTo) > new Date(), `${x509.subject} must not be expired`);
  }
});

test('installIntermediateCaTrust appends only missing certs and is idempotent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-ca-'));
  const pem = '-----BEGIN CERTIFICATE-----\nZZZZ\n-----END CERTIFICATE-----';
  fs.writeFileSync(path.join(dir, 'x.crt'), pem);
  let store = ['existing'];
  const fake = {
    getCACertificates: () => store,
    setDefaultCACertificates: (list) => { store = list; },
  };
  assert.equal(installIntermediateCaTrust({ dir, tlsModule: fake }), 1);
  assert.deepEqual(store, ['existing', pem]);
  assert.equal(installIntermediateCaTrust({ dir, tlsModule: fake }), 0);
  assert.equal(store.length, 2);
  fs.rmSync(dir, { recursive: true });
});

test('installIntermediateCaTrust warns instead of throwing on an old Node', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-ca-'));
  fs.writeFileSync(path.join(dir, 'x.crt'), '-----BEGIN CERTIFICATE-----\nZZZZ\n-----END CERTIFICATE-----');
  const warnings = [];
  const added = installIntermediateCaTrust({ dir, tlsModule: {}, warn: (m) => warnings.push(m) });
  assert.equal(added, 0);
  assert.equal(warnings.length, 1);
  fs.rmSync(dir, { recursive: true });
});

test('installing the bundled intermediate adds it to the real default CA list', () => {
  const before = tls.getCACertificates('default').length;
  const added = installIntermediateCaTrust({ dir: BUNDLED_DIR });
  assert.equal(tls.getCACertificates('default').length, before + added);
  assert.equal(installIntermediateCaTrust({ dir: BUNDLED_DIR }), 0);
});
