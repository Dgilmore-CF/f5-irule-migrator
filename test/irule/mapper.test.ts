import { describe, expect, it } from 'vitest';
import { convertIRule, translateIRuleCondition } from '../../src/irule/mapper.js';

describe('translateIRuleCondition', () => {
  it('translates [HTTP::uri] starts_with "/api"', () => {
    const expr = translateIRuleCondition('[HTTP::uri] starts_with "/api"');
    // HTTP::uri includes the query string, so the rules-language target
    // should be http.request.uri, not http.request.uri.path.
    expect(expr).toBe('starts_with(http.request.uri, "/api")');
  });

  it('translates [HTTP::path] starts_with "/api"', () => {
    const expr = translateIRuleCondition('[HTTP::path] starts_with "/api"');
    expect(expr).toBe('starts_with(http.request.uri.path, "/api")');
  });

  it('translates [HTTP::host] eq', () => {
    const expr = translateIRuleCondition('[HTTP::host] eq "www.example.com"');
    expect(expr).toBe('http.host eq "www.example.com"');
  });

  it('translates [HTTP::header "X-Foo"] contains', () => {
    const expr = translateIRuleCondition('[HTTP::header "X-Foo"] contains "bar"');
    expect(expr).toBe('http.request.headers["x-foo"][0] contains "bar"');
  });

  it('translates compound AND conditions', () => {
    const expr = translateIRuleCondition(
      '[HTTP::uri] starts_with "/api" && [HTTP::method] eq "POST"',
    );
    expect(expr).toBe(
      '(starts_with(http.request.uri, "/api")) and (http.request.method eq "POST")',
    );
  });

  it('translates compound OR conditions', () => {
    const expr = translateIRuleCondition(
      '[HTTP::uri] starts_with "/api" || [HTTP::uri] starts_with "/v2"',
    );
    expect(expr).toBe(
      '(starts_with(http.request.uri, "/api")) or (starts_with(http.request.uri, "/v2"))',
    );
  });

  it('translates not (...) negation', () => {
    const expr = translateIRuleCondition('not ([HTTP::uri] starts_with "/x")');
    expect(expr).toBe('not (starts_with(http.request.uri, "/x"))');
  });

  it('translates [HTTP::header exists ...]', () => {
    const expr = translateIRuleCondition('[HTTP::header exists "Authorization"]');
    expect(expr).toBe('len(http.request.headers["authorization"]) gt 0');
  });

  it('returns unparsed marker for unknown shapes', () => {
    const expr = translateIRuleCondition('some weird tcl expression here');
    expect(expr).toContain('__unparsed_condition__');
  });
});

describe('convertIRule end-to-end', () => {
  it('emits a Single Redirect with dynamic concat() expression', () => {
    const result = convertIRule(`
      when HTTP_REQUEST {
        if { [HTTP::uri] starts_with "/api/v1" } {
          HTTP::redirect "https://api.example.com/v2[HTTP::uri]"
        }
      }
    `);
    const r = result.results.find((x) => x.type === 'Single Redirect');
    expect(r).toBeDefined();
    expect(r?.expression).toBe('starts_with(http.request.uri, "/api/v1")');
    // The API call body should reference the dynamic expression rather than
    // emitting the raw [HTTP::uri] substitution as a literal string.
    expect(r?.apiCall).toContain('concat(');
    expect(r?.apiCall).toContain('http.request.uri');
  });

  it('classifies HTTP_RESPONSE header inserts as Response Header Transform', () => {
    const result = convertIRule(`
      when HTTP_RESPONSE {
        HTTP::header insert "Strict-Transport-Security" "max-age=31536000"
      }
    `);
    const r = result.results.find((x) => x.type === 'Response Header Transform');
    expect(r).toBeDefined();
    expect(r?.name).toContain('Strict-Transport-Security');
  });

  it('classifies HTTP_REQUEST header inserts as Request Header Transform', () => {
    const result = convertIRule(`
      when HTTP_REQUEST {
        HTTP::header insert "X-Forwarded-Proto" "https"
      }
    `);
    const r = result.results.find((x) => x.type === 'Request Header Transform');
    expect(r).toBeDefined();
  });

  it('produces an Origin Rule for `pool` directives with warn note about pool name', () => {
    const result = convertIRule(`
      when HTTP_REQUEST {
        if { [HTTP::uri] starts_with "/api" } {
          pool api_backend_pool
        }
      }
    `);
    const r = result.results.find((x) => x.type === 'Origin Rule');
    expect(r).toBeDefined();
    expect(r?.notes?.some((n) => n.severity === 'warn')).toBe(true);
    expect(r?.expression).toBe('starts_with(http.request.uri, "/api")');
  });

  it('classifies LB_SELECTED event as Snippet candidate', () => {
    const result = convertIRule(`when LB_SELECTED { persist uie [HTTP::cookie "JSESSIONID"] }`);
    const r = result.results.find((x) => x.type === 'Snippet');
    expect(r).toBeDefined();
  });

  it('classifies HTTP::respond as Snippet (no declarative equivalent)', () => {
    const result = convertIRule(`when HTTP_REQUEST { HTTP::respond 403 content "denied" }`);
    expect(result.results.some((x) => x.type === 'Snippet')).toBe(true);
  });

  it('computes coverage stats', () => {
    const result = convertIRule(`
      when HTTP_REQUEST {
        HTTP::header insert "X-Foo" "bar"
        if { [HTTP::uri] starts_with "/x" } { pool p }
        set client_ip [IP::client_addr]
      }
    `);
    expect(result.coverage.converted).toBeGreaterThan(0);
    expect(result.coverage.snippets).toBeGreaterThan(0);
  });

  it('default redirect status is 302, not 301', () => {
    // F5 HTTP::redirect does not specify a status code. Defaulting to 302
    // avoids accidentally setting permanent client/CDN caches during a migration.
    const result = convertIRule(`when HTTP_REQUEST { HTTP::redirect "https://x.example/" }`);
    const r = result.results.find((x) => x.type === 'Single Redirect');
    expect(r?.apiCall).toContain('302');
    expect(r?.apiCall).not.toContain('301');
  });

  it('emits valid JSON in the curl --data payload', () => {
    const result = convertIRule(`when HTTP_REQUEST { HTTP::redirect "https://x.example/" }`);
    const r = result.results.find((x) => x.type === 'Single Redirect');
    expect(r?.apiCall).toBeDefined();
    const m = /--data\s+'([\s\S]+)'$/.exec(r!.apiCall!);
    expect(m).not.toBeNull();
    expect(() => JSON.parse(m![1]!)).not.toThrow();
  });
});
