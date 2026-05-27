import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePolicy } from '../../src/asm/policy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

describe('ASM PolicyModel parser', () => {
  it('parses a minimal policy', () => {
    const m = parsePolicy(fixture('minimal.xml'));
    expect(m.meta.name).toBe('minimal-policy');
    expect(m.meta.enforcementMode).toBe('blocking');
    expect(m.signatureSets).toHaveLength(1);
    expect(m.signatureSets[0]).toMatchObject({ name: 'OWASP Top Ten', enabled: true });
  });

  it('parses the kitchen-sink policy', () => {
    const m = parsePolicy(fixture('kitchen-sink.xml'));

    expect(m.meta.name).toBe('kitchen-sink');
    expect(m.signatures).toHaveLength(3);
    expect(m.signatures.find((s) => s.action === 'alarm')).toBeDefined();

    expect(m.signatureSets).toHaveLength(2);

    expect(m.allowedUrls).toHaveLength(2);
    expect(m.allowedUrls[0]?.methods).toEqual(['GET', 'POST']);
    expect(m.disallowedUrls).toHaveLength(1);

    expect(m.allowedFileTypes).toEqual(['jpg', 'png', 'pdf']);
    expect(m.disallowedFileTypes).toEqual(['exe', 'bat']);

    expect(m.allowedMethods).toEqual(['GET', 'POST', 'PUT', 'DELETE']);

    expect(m.parameters).toHaveLength(2);
    expect(m.parameters[0]?.regex).toBe('^[A-Za-z0-9_]+$');

    expect(m.headers).toHaveLength(1);
    expect(m.headers[0]?.action).toBe('block');

    expect(m.cookies[0]?.signed).toBe(true);

    expect(m.ipIntelligence?.enabled).toBe(true);
    expect(m.ipIntelligence?.categories).toHaveLength(3);

    expect(m.geolocations).toHaveLength(3);
    expect(m.geolocations.every((g) => g.action === 'block')).toBe(true);

    expect(m.ipExceptions).toHaveLength(2);

    expect(m.botDefense?.mitigationLevel).toBe('strict');

    expect(m.bruteForce?.loginUrl).toBe('/login');
    expect(m.bruteForce?.maxFailedLogins).toBe(5);

    expect(m.csrf?.urls).toEqual(['/account/*', '/transfer']);

    expect(m.loginEnforcement?.authenticatedUrls).toEqual(['/account/*']);
    expect(m.sessionTracking?.trackBy).toBe('session_cookie');

    expect(m.dataGuard?.patterns).toEqual(['credit_card', 'us_ssn']);
    expect(m.dataGuard?.customPatterns).toHaveLength(1);

    expect(m.responsePages[0]?.statusCode).toBe(403);
  });

  it('normalizes "transparent" enforcement mode', () => {
    const m = parsePolicy(fixture('transparent.xml'));
    expect(m.meta.enforcementMode).toBe('transparent');
  });

  it('returns an empty policy on garbage input', () => {
    const m = parsePolicy('not actually xml');
    expect(m.signatures).toEqual([]);
    expect(m.geolocations).toEqual([]);
  });
});
