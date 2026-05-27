import { describe, expect, it } from 'vitest';
import {
  andAll,
  buildCondition,
  buildDynamicTarget,
  cfField,
  orAll,
  translateOp,
} from '../../src/shared/expression.js';

describe('cfField', () => {
  it('maps F5 HTTP::uri to http.request.uri (includes query string)', () => {
    // The original parser had a subtle bug here: it folded HTTP::uri into the
    // path-only field. F5 HTTP::uri includes the query string, so it should
    // map to http.request.uri, not http.request.uri.path.
    expect(cfField('uri')).toBe('http.request.uri');
    expect(cfField('path')).toBe('http.request.uri.path');
  });

  it('maps host, method, query, client_ip correctly', () => {
    expect(cfField('host')).toBe('http.host');
    expect(cfField('method')).toBe('http.request.method');
    expect(cfField('query')).toBe('http.request.uri.query');
    expect(cfField('client_ip')).toBe('ip.src');
  });

  it('produces lower-cased header lookups', () => {
    expect(cfField('header', 'X-Forwarded-For')).toBe('http.request.headers["x-forwarded-for"][0]');
  });

  it('produces case-preserved cookie lookups', () => {
    expect(cfField('cookie', 'JSESSIONID')).toBe('http.cookie["JSESSIONID"]');
  });
});

describe('buildCondition', () => {
  it('emits starts_with as a function call', () => {
    const expr = buildCondition({ field: 'path', op: 'starts_with', value: '/api' });
    expect(expr).toBe('starts_with(http.request.uri.path, "/api")');
  });

  it('emits contains as an infix operator', () => {
    const expr = buildCondition({ field: 'host', op: 'contains', value: 'example.com' });
    expect(expr).toBe('http.host contains "example.com"');
  });

  it('wraps negated conditions with not()', () => {
    const expr = buildCondition({
      field: 'path',
      op: 'starts_with',
      value: '/admin',
      negate: true,
    });
    expect(expr).toBe('not (starts_with(http.request.uri.path, "/admin"))');
  });

  it('emits "in" with brace-grouped values', () => {
    const expr = buildCondition({
      field: 'method',
      op: 'in',
      value: ['GET', 'POST', 'PUT'],
    });
    expect(expr).toBe('http.request.method in {"GET" "POST" "PUT"}');
  });

  it('escapes embedded quotes in string literals', () => {
    const expr = buildCondition({ field: 'path', op: 'eq', value: '/a"b' });
    expect(expr).toBe('http.request.uri.path eq "/a\\"b"');
  });
});

describe('buildDynamicTarget', () => {
  it('returns a literal target for static strings', () => {
    expect(buildDynamicTarget('https://example.com/x')).toEqual({
      kind: 'literal',
      value: 'https://example.com/x',
    });
  });

  it('emits concat() when HTTP::uri is present', () => {
    const result = buildDynamicTarget('https://api.example.com/v2[HTTP::uri]');
    expect(result.kind).toBe('expression');
    expect(result.value).toBe('concat("https://api.example.com/v2", http.request.uri)');
  });

  it('handles host substitutions', () => {
    const result = buildDynamicTarget('https://[HTTP::host]/secure[HTTP::uri]');
    expect(result.kind).toBe('expression');
    expect(result.value).toBe('concat("https://", http.host, "/secure", http.request.uri)');
  });

  it('quotes literal segments containing special characters', () => {
    const result = buildDynamicTarget('https://x.com/[HTTP::path]?q=1');
    expect(result.kind).toBe('expression');
    expect(result.value).toContain('http.request.uri.path');
    expect(result.value).toContain('?q=1');
  });
});

describe('andAll / orAll', () => {
  it('returns "true" for empty input', () => {
    expect(andAll([])).toBe('true');
    expect(orAll([])).toBe('true');
  });

  it('returns the single expression for arrays of length 1', () => {
    expect(andAll(['x'])).toBe('x');
  });

  it('wraps each operand in parens for clarity', () => {
    expect(andAll(['a', 'b'])).toBe('(a) and (b)');
    expect(orAll(['a', 'b'])).toBe('(a) or (b)');
  });
});

describe('translateOp', () => {
  it('maps not_starts_with to negated starts_with', () => {
    expect(translateOp('not_starts_with')).toEqual({ op: 'starts_with', negate: true });
  });

  it('handles common synonyms', () => {
    expect(translateOp('equals')).toEqual({ op: 'eq', negate: false });
    expect(translateOp('not_equal')).toEqual({ op: 'ne', negate: false });
    expect(translateOp('matches_regex')).toEqual({ op: 'matches', negate: false });
  });

  it('falls back to eq for unknown operators', () => {
    expect(translateOp('weird_op')).toEqual({ op: 'eq', negate: false });
  });
});
