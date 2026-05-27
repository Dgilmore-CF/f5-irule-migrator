/**
 * curl + Terraform generators for ASM conversion results.
 */

import { hclString, tfIdent } from '../../shared/escape.js';

const ZONE = '{zone_id}';
const ACCOUNT = '{account_id}';
const TOKEN = '{api_token}';

function curl(phase: string, scope: 'zones' | 'accounts'): string {
  const root = scope === 'zones' ? `zones/${ZONE}` : `accounts/${ACCOUNT}`;
  return `curl -X PUT "https://api.cloudflare.com/client/v4/${root}/rulesets/phases/${phase}/entrypoint" \\
  -H "Authorization: Bearer ${TOKEN}" \\
  -H "Content-Type: application/json" \\
  --data '`;
}

// ---------------------------------------------------------------------------
// Managed ruleset (Cloudflare Managed + OWASP Core)
// ---------------------------------------------------------------------------

export function buildManagedRulesetApiCall(mode: 'transparent' | 'blocking'): string {
  const overrides =
    mode === 'transparent'
      ? { categories: [{ category: 'wordpress', action: 'log' }], action: 'log' }
      : {};
  const body = {
    rules: [
      {
        action: 'execute',
        expression: 'true',
        description: 'Execute Cloudflare Managed Ruleset',
        action_parameters: {
          id: 'efb7b8c949ac4650a09736fc376e9aee',
          ...overrides,
        },
      },
      {
        action: 'execute',
        expression: 'true',
        description: 'Execute OWASP Core Ruleset',
        action_parameters: {
          id: '4814384a9e5d4991b9815dcfc25d2f1f',
          ...overrides,
        },
      },
    ],
  };
  return curl('http_request_firewall_managed', 'zones') + JSON.stringify(body, null, 2) + "'";
}

export function buildManagedRulesetTerraform(mode: 'transparent' | 'blocking'): string {
  const overrideBlock =
    mode === 'transparent'
      ? `
    action_parameters {
      overrides {
        action = "log"
      }
    }`
      : '';
  return `resource "cloudflare_ruleset" "asm_managed_waf" {
  zone_id = var.zone_id
  name    = "asm_managed_waf"
  kind    = "zone"
  phase   = "http_request_firewall_managed"

  rules {
    action      = "execute"
    expression  = "true"
    description = "Cloudflare Managed Ruleset (migrated from F5 ASM signatures)"
    enabled     = true${overrideBlock}

    action_parameters {
      id = "efb7b8c949ac4650a09736fc376e9aee"
    }
  }

  rules {
    action      = "execute"
    expression  = "true"
    description = "OWASP Core Ruleset (migrated from F5 ASM signatures)"
    enabled     = true${overrideBlock}

    action_parameters {
      id = "4814384a9e5d4991b9815dcfc25d2f1f"
    }
  }
}`;
}

// ---------------------------------------------------------------------------
// WAF Custom Rule
// ---------------------------------------------------------------------------

export function buildWafCustomRuleApiCall(
  expression: string,
  action: string,
  description: string,
  longDescription?: string,
): string {
  const body = {
    rules: [
      {
        expression,
        action,
        description: longDescription ?? description,
      },
    ],
  };
  return curl('http_request_firewall_custom', 'zones') + JSON.stringify(body, null, 2) + "'";
}

export function buildWafCustomRuleTerraform(
  expression: string,
  action: string,
  ident: string,
): string {
  const safeIdent = tfIdent(ident);
  return `resource "cloudflare_ruleset" "${safeIdent}" {
  zone_id = var.zone_id
  name    = "${safeIdent}"
  kind    = "zone"
  phase   = "http_request_firewall_custom"

  rules {
    action      = "${action}"
    expression  = "${hclString(expression)}"
    description = "Migrated from F5 ASM"
    enabled     = true
  }
}`;
}

// ---------------------------------------------------------------------------
// IP List
// ---------------------------------------------------------------------------

export function buildIpListApiCall(
  listName: string,
  ips: string[],
  action: string,
  kind: 'block' | 'allow',
): string {
  const body = {
    rules: [
      {
        expression: `ip.src in $${listName}`,
        action,
        description: `IP ${kind}-list migrated from F5 ASM`,
        ...(action === 'skip' ? { action_parameters: { ruleset: 'current', rulesets: [] } } : {}),
      },
    ],
  };
  const wafCall =
    curl('http_request_firewall_custom', 'zones') + JSON.stringify(body, null, 2) + "'";
  const listBody = {
    name: listName,
    kind: 'ip',
    description: `IP ${kind}-list migrated from F5 ASM`,
  };
  const listCreate = `curl -X POST "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/rules/lists" \\
  -H "Authorization: Bearer ${TOKEN}" \\
  -H "Content-Type: application/json" \\
  --data '${JSON.stringify(listBody, null, 2)}'

# Then bulk-add items:
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/rules/lists/{list_id}/items" \\
  -H "Authorization: Bearer ${TOKEN}" \\
  -H "Content-Type: application/json" \\
  --data '${JSON.stringify(
    ips.map((ip) => ({ ip })),
    null,
    2,
  )}'`;
  return `# 1. Create the list:
${listCreate}

# 2. Add a WAF Custom Rule referencing the list:
${wafCall}`;
}

export function buildIpListTerraform(
  listName: string,
  ips: string[],
  action: string,
  kind: 'block' | 'allow',
): string {
  const safeIdent = tfIdent(listName);
  const items = ips
    .map(
      (ip) => `  item {
    value {
      ip = "${hclString(ip)}"
    }
  }`,
    )
    .join('\n');
  const skipParams =
    action === 'skip'
      ? `
    action_parameters {
      ruleset = "current"
    }`
      : '';
  return `resource "cloudflare_list" "${safeIdent}" {
  account_id  = var.account_id
  name        = "${safeIdent}"
  kind        = "ip"
  description = "IP ${kind}-list migrated from F5 ASM"

${items}
}

resource "cloudflare_ruleset" "${safeIdent}_rule" {
  zone_id = var.zone_id
  name    = "${safeIdent}_rule"
  kind    = "zone"
  phase   = "http_request_firewall_custom"

  rules {
    action      = "${action}"
    expression  = "ip.src in $${listName}"
    description = "IP ${kind}-list match (migrated from F5 ASM)"
    enabled     = true${skipParams}
  }
}`;
}

// ---------------------------------------------------------------------------
// Bot Management
// ---------------------------------------------------------------------------

export function buildBotApiCall(expression: string, action: string): string {
  const body = {
    rules: [
      {
        expression,
        action,
        description: 'Bot defense (migrated from F5 ASM)',
      },
    ],
  };
  return curl('http_request_firewall_custom', 'zones') + JSON.stringify(body, null, 2) + "'";
}

export function buildBotTerraform(expression: string, action: string): string {
  return `resource "cloudflare_ruleset" "asm_bot_defense" {
  zone_id = var.zone_id
  name    = "asm_bot_defense"
  kind    = "zone"
  phase   = "http_request_firewall_custom"

  rules {
    action      = "${action}"
    expression  = "${hclString(expression)}"
    description = "Bot defense (migrated from F5 ASM)"
    enabled     = true
  }
}`;
}

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

export function buildRateLimitApiCall(
  expression: string,
  action: string,
  threshold: number,
  period: number,
  description: string,
): string {
  const body = {
    rules: [
      {
        expression,
        action,
        description,
        ratelimit: {
          characteristics: ['ip.src'],
          period,
          requests_per_period: threshold,
          mitigation_timeout: 600,
        },
      },
    ],
  };
  return curl('http_ratelimit', 'zones') + JSON.stringify(body, null, 2) + "'";
}

export function buildRateLimitTerraform(
  expression: string,
  action: string,
  threshold: number,
  period: number,
  ident: string,
): string {
  const safeIdent = tfIdent(ident);
  return `resource "cloudflare_ruleset" "${safeIdent}" {
  zone_id = var.zone_id
  name    = "${safeIdent}"
  kind    = "zone"
  phase   = "http_ratelimit"

  rules {
    action      = "${action}"
    expression  = "${hclString(expression)}"
    description = "Brute-force prevention (migrated from F5 ASM)"
    enabled     = true

    ratelimit {
      characteristics     = ["ip.src"]
      period              = ${period}
      requests_per_period = ${threshold}
      mitigation_timeout  = 600
    }
  }
}`;
}

// ---------------------------------------------------------------------------
// Snippets (CSRF, session tracking, etc.)
// ---------------------------------------------------------------------------

export function buildCsrfSnippet(
  paths: string[],
  kind: 'csrf' | 'parameter-validation' = 'csrf',
): string {
  if (kind === 'parameter-validation') {
    return `// Cloudflare Snippet — parameter validation (migrated from F5 ASM)
//
// This snippet inspects URL query parameters and POST form fields against a
// declarative schema. Extend SCHEMA with your real per-parameter rules.

const SCHEMA = {
  // 'username': { maxLength: 64, pattern: /^[A-Za-z0-9_.-]+$/ },
  // 'amount':   { type: 'number', min: 0, max: 1_000_000 },
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    for (const [key, raw] of url.searchParams) {
      const violation = validate(key, raw, SCHEMA[key]);
      if (violation) return reject(violation);
    }

    if (request.method === 'POST' && request.headers.get('content-type')?.includes('form')) {
      const cloned = request.clone();
      const form = await cloned.formData();
      for (const [key, value] of form) {
        const violation = validate(key, String(value), SCHEMA[key]);
        if (violation) return reject(violation);
      }
    }

    return fetch(request);
  },
};

function validate(name, value, rule) {
  if (!rule) return null;
  if (rule.maxLength && value.length > rule.maxLength) {
    return \`Parameter "\${name}" exceeds maxLength=\${rule.maxLength}\`;
  }
  if (rule.pattern && !rule.pattern.test(value)) {
    return \`Parameter "\${name}" failed pattern validation\`;
  }
  if (rule.type === 'number' && Number.isNaN(Number(value))) {
    return \`Parameter "\${name}" must be numeric\`;
  }
  return null;
}

function reject(reason) {
  return new Response(JSON.stringify({ error: reason }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
}
`;
  }
  const pathList = paths.length ? paths.map((p) => `'${p}'`).join(', ') : "'/*'";
  return `// Cloudflare Snippet — CSRF protection (migrated from F5 ASM)
//
// Strategy: double-submit cookie with HMAC. The token is set on safe (GET)
// responses and validated on state-changing requests (POST/PUT/PATCH/DELETE).
//
// Replace SECRET with a value read from Wrangler env / Snippet config.

const SECRET = 'replace-with-secret-from-wrangler-secrets';
const COOKIE = 'csrf';
const HEADER = 'x-csrf-token';
const PROTECTED_PATHS = [${pathList}];
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const needsProtection = PROTECTED_PATHS.some((p) =>
      p.endsWith('*') ? url.pathname.startsWith(p.slice(0, -1)) : url.pathname === p,
    );

    if (needsProtection && UNSAFE_METHODS.has(request.method)) {
      const cookieToken = readCookie(request.headers.get('cookie') || '', COOKIE);
      const headerToken = request.headers.get(HEADER);
      if (!cookieToken || !headerToken || !(await constantTimeEqual(cookieToken, headerToken))) {
        return new Response('CSRF token missing or invalid', { status: 403 });
      }
      if (!(await verifyHmac(cookieToken, SECRET))) {
        return new Response('CSRF token signature invalid', { status: 403 });
      }
    }

    const response = await fetch(request);
    if (request.method === 'GET' && needsProtection) {
      const token = await signToken(SECRET);
      const newRes = new Response(response.body, response);
      newRes.headers.append('set-cookie', \`\${COOKIE}=\${token}; Path=/; Secure; HttpOnly; SameSite=Strict\`);
      return newRes;
    }
    return response;
  },
};

function readCookie(header, name) {
  const m = new RegExp('(?:^|; )' + name + '=([^;]+)').exec(header);
  return m ? decodeURIComponent(m[1]) : null;
}

async function signToken(secret) {
  const nonce = crypto.randomUUID();
  const sig = await hmac(secret, nonce);
  return \`\${nonce}.\${sig}\`;
}

async function verifyHmac(token, secret) {
  const [nonce, sig] = token.split('.');
  if (!nonce || !sig) return false;
  const expected = await hmac(secret, nonce);
  return constantTimeEqual(sig, expected);
}

async function hmac(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
`;
}

export function buildSessionTrackingSnippet(kind: string): string {
  return `// Cloudflare Snippet — session tracking (migrated from F5 ASM ${kind})
//
// Issues a signed session cookie on first visit and validates it on each
// subsequent request. Move SECRET to a Wrangler secret in production.

const SECRET = 'replace-with-wrangler-secret';
const COOKIE = 'cf_session';
const TTL_SECONDS = 60 * 60 * 24; // 24 hours

export default {
  async fetch(request) {
    const cookieHeader = request.headers.get('cookie') || '';
    const sid = readCookie(cookieHeader, COOKIE);
    const valid = sid ? await verify(sid, SECRET) : null;

    const response = await fetch(request);
    if (!valid) {
      const newSid = await issue(SECRET);
      const newRes = new Response(response.body, response);
      newRes.headers.append(
        'set-cookie',
        \`\${COOKIE}=\${newSid}; Path=/; Max-Age=\${TTL_SECONDS}; Secure; HttpOnly; SameSite=Lax\`,
      );
      return newRes;
    }
    return response;
  },
};

function readCookie(header, name) {
  const m = new RegExp('(?:^|; )' + name + '=([^;]+)').exec(header);
  return m ? decodeURIComponent(m[1]) : null;
}

async function issue(secret) {
  const nonce = crypto.randomUUID();
  const expiresAt = Date.now() + 1000 * ${24 * 60 * 60};
  const payload = \`\${nonce}.\${expiresAt}\`;
  const sig = await hmac(secret, payload);
  return \`\${payload}.\${sig}\`;
}

async function verify(token, secret) {
  const [nonce, exp, sig] = token.split('.');
  if (!nonce || !exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  const expected = await hmac(secret, \`\${nonce}.\${exp}\`);
  let diff = 0;
  if (expected.length !== sig.length) return false;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function hmac(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
`;
}
