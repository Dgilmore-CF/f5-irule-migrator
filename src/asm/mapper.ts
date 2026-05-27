/**
 * Map a parsed F5 ASM {@link PolicyModel} to Cloudflare WAF, Rate Limiting,
 * Bot Management, IP Lists, and Snippet/Access/DLP recommendations.
 */

import type {
  BotDefenseConfig,
  BruteForceConfig,
  CsrfConfig,
  DataGuardConfig,
  GeoEntry,
  IpEntry,
  IpIntelConfig,
  LoginEnforcementConfig,
  PolicyModel,
  ResponsePageSpec,
  SessionTrackingConfig,
  SignatureEntry,
  SignatureSet,
  UrlSpec,
} from './policy.js';
import { parsePolicy } from './policy.js';
import type { ConversionResult, ConvertedRule, CoverageStats } from '../shared/types.js';
import {
  buildBotApiCall,
  buildBotTerraform,
  buildCsrfSnippet,
  buildIpListApiCall,
  buildIpListTerraform,
  buildManagedRulesetApiCall,
  buildManagedRulesetTerraform,
  buildRateLimitApiCall,
  buildRateLimitTerraform,
  buildSessionTrackingSnippet,
  buildWafCustomRuleApiCall,
  buildWafCustomRuleTerraform,
} from './generators/api.js';
import { buildAsmDashboardSteps, buildDlpDashboardSteps } from './generators/dashboard.js';
import { cfStringLiteral } from '../shared/escape.js';

export function convertAsm(xml: string): ConversionResult {
  const model = parsePolicy(xml);
  const results: ConvertedRule[] = [];

  // ---- META ----
  results.push(buildMetaInfo(model));

  // ---- Managed Rulesets (signatures) ----
  if (model.signatureSets.length > 0 || model.signatures.length > 0) {
    results.push(
      buildManagedRulesetRule(model.signatureSets, model.signatures, model.meta.enforcementMode),
    );
  }

  // ---- Disallowed URLs -> WAF block rules ----
  if (model.disallowedUrls.length > 0) {
    results.push(buildDisallowedUrlsRule(model.disallowedUrls, model.meta.enforcementMode));
  }

  // ---- Allowed URLs (positive security) -> WAF block "not in" rule ----
  if (model.allowedUrls.length > 0) {
    results.push(buildAllowedUrlsRule(model.allowedUrls, model.meta.enforcementMode));
  }

  // ---- Disallowed file types ----
  if (model.disallowedFileTypes.length > 0) {
    results.push(
      buildDisallowedFileTypesRule(model.disallowedFileTypes, model.meta.enforcementMode),
    );
  }
  if (model.allowedFileTypes.length > 0) {
    results.push(buildAllowedFileTypesRule(model.allowedFileTypes, model.meta.enforcementMode));
  }

  // ---- Allowed HTTP methods ----
  if (model.allowedMethods.length > 0) {
    results.push(buildAllowedMethodsRule(model.allowedMethods, model.meta.enforcementMode));
  }

  // ---- IP exceptions ----
  if (model.ipExceptions.length > 0) {
    results.push(...buildIpExceptionRules(model.ipExceptions, model.meta.enforcementMode));
  }

  // ---- IP intelligence ----
  if (model.ipIntelligence && model.ipIntelligence.enabled) {
    results.push(buildIpIntelRule(model.ipIntelligence, model.meta.enforcementMode));
  }

  // ---- Geolocation ----
  if (model.geolocations.length > 0) {
    results.push(buildGeoRule(model.geolocations, model.meta.enforcementMode));
  }

  // ---- Bot defense ----
  if (model.botDefense && model.botDefense.enabled) {
    results.push(buildBotRule(model.botDefense, model.meta.enforcementMode));
  }

  // ---- Brute force prevention -> Rate Limiting ----
  if (model.bruteForce && model.bruteForce.enabled) {
    results.push(buildBruteForceRule(model.bruteForce, model.meta.enforcementMode));
  }

  // ---- CSRF -> Snippet + WAF helper rule ----
  if (model.csrf && model.csrf.enabled) {
    results.push(buildCsrfRule(model.csrf, model.meta.enforcementMode));
  }

  // ---- Login Enforcement -> Cloudflare Access (gated) ----
  if (model.loginEnforcement && model.loginEnforcement.enabled) {
    results.push(buildLoginEnforcementRule(model.loginEnforcement));
  }

  // ---- Session tracking -> Snippet ----
  if (model.sessionTracking && model.sessionTracking.enabled) {
    results.push(buildSessionTrackingRule(model.sessionTracking));
  }

  // ---- Data Guard (DLP) -> Cloudflare DLP (gated) ----
  if (model.dataGuard && model.dataGuard.enabled) {
    results.push(buildDataGuardRule(model.dataGuard));
  }

  // ---- Response pages ----
  if (model.responsePages.length > 0) {
    results.push(buildResponsePagesRule(model.responsePages));
  }

  // ---- Parameter validation (best-effort) ----
  if (model.parameters.length > 0) {
    results.push(buildParameterRule(model.parameters));
  }

  // ---- Header inspection (best-effort) ----
  if (model.headers.length > 0) {
    results.push(buildHeaderInspectionRule(model.headers));
  }

  // ---- Cookie protection (signed cookies) ----
  if (model.cookies.some((c) => c.signed)) {
    results.push(buildCookieSnippetRule(model));
  }

  const coverage = computeCoverage(results);
  return {
    source: 'asm',
    generatedAt: new Date().toISOString(),
    results,
    coverage,
  };
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function actionForMode(
  mode: 'transparent' | 'blocking',
  preferred: 'block' | 'managed_challenge' = 'block',
): string {
  return mode === 'transparent' ? 'log' : preferred;
}

function buildMetaInfo(model: PolicyModel): ConvertedRule {
  const stats = [
    `Signatures: ${model.signatures.length}`,
    `Signature sets: ${model.signatureSets.length}`,
    `Allowed URLs: ${model.allowedUrls.length}`,
    `Disallowed URLs: ${model.disallowedUrls.length}`,
    `Allowed methods: ${model.allowedMethods.length}`,
    `IP exceptions: ${model.ipExceptions.length}`,
    `Geo entries: ${model.geolocations.length}`,
    `Bot defense: ${model.botDefense?.enabled ? 'enabled' : 'off'}`,
    `Brute force: ${model.bruteForce?.enabled ? 'enabled' : 'off'}`,
    `CSRF: ${model.csrf?.enabled ? 'enabled' : 'off'}`,
    `Login enforcement: ${model.loginEnforcement?.enabled ? 'enabled' : 'off'}`,
    `Session tracking: ${model.sessionTracking?.enabled ? 'enabled' : 'off'}`,
    `Data Guard: ${model.dataGuard?.enabled ? 'enabled' : 'off'}`,
  ].join(' · ');

  return {
    type: 'Managed Ruleset',
    name: `Policy: ${model.meta.name}`,
    original: stats,
    guiSteps: [
      `Enforcement mode in source policy: <strong>${model.meta.enforcementMode}</strong>.`,
      `When the source policy is <em>transparent</em>, all generated WAF actions are emitted as <strong>log</strong> to mirror the F5 behavior.`,
      `Review the per-category cards below; each maps to a distinct Cloudflare surface.`,
    ],
    notes: [
      {
        severity: 'info',
        text: `Policy "${model.meta.name}" parsed successfully. Enforcement mode: ${model.meta.enforcementMode}.`,
      },
    ],
  };
}

function buildManagedRulesetRule(
  sets: SignatureSet[],
  sigs: SignatureEntry[],
  mode: 'transparent' | 'blocking',
): ConvertedRule {
  const enabledSets = sets.filter((s) => s.enabled).map((s) => s.name);
  return {
    type: 'Managed Ruleset',
    name: `Enable Cloudflare managed WAF rulesets (replaces ${sets.length} signature sets, ${sigs.length} explicit signatures)`,
    original: [
      ...sets.map((s) => `  signature_set: ${s.name} (${s.enabled ? 'on' : 'off'})`),
      ...sigs
        .slice(0, 8)
        .map((s) => `  signature: ${s.id}${s.name ? ` "${s.name}"` : ''} → ${s.action}`),
      sigs.length > 8 ? `  ... and ${sigs.length - 8} more signatures` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    guiSteps: buildAsmDashboardSteps('managed-ruleset', { enabledSets, mode }),
    apiCall: buildManagedRulesetApiCall(mode),
    terraform: buildManagedRulesetTerraform(mode),
    notes: [
      {
        severity: 'warn',
        text: 'F5 attack signatures do not map 1:1 to Cloudflare managed-rule IDs. Enable the Cloudflare Managed Ruleset and OWASP Core Ruleset, then tune individual rule overrides as you observe traffic. Track F5-specific custom signatures separately as WAF Custom Rules.',
      },
    ],
  };
}

function buildDisallowedUrlsRule(urls: UrlSpec[], mode: 'transparent' | 'blocking'): ConvertedRule {
  const expression = urls
    .map((u) => urlExpression(u))
    .filter(Boolean)
    .map((e) => `(${e})`)
    .join(' or ');
  const action = actionForMode(mode);
  return {
    type: 'WAF Custom Rule',
    name: `Block ${urls.length} disallowed URL patterns`,
    original: urls
      .map((u) => `  disallowed_url: ${u.pattern}${u.methods ? ` (${u.methods.join(',')})` : ''}`)
      .join('\n'),
    expression,
    guiSteps: buildAsmDashboardSteps('waf-custom', { expression, action }),
    apiCall: buildWafCustomRuleApiCall(
      expression,
      action,
      'asm_disallowed_urls',
      'Disallowed URLs (migrated from F5 ASM)',
    ),
    terraform: buildWafCustomRuleTerraform(expression, action, 'asm_disallowed_urls'),
  };
}

function buildAllowedUrlsRule(urls: UrlSpec[], mode: 'transparent' | 'blocking'): ConvertedRule {
  const allowExpr = urls
    .map((u) => urlExpression(u))
    .filter(Boolean)
    .map((e) => `(${e})`)
    .join(' or ');
  const expression = `not (${allowExpr})`;
  const action = actionForMode(mode);
  return {
    type: 'WAF Custom Rule',
    name: `Positive security — block traffic outside allowed URL set (${urls.length} patterns)`,
    original: urls.map((u) => `  allowed_url: ${u.pattern}`).join('\n'),
    expression,
    guiSteps: buildAsmDashboardSteps('waf-custom', { expression, action }),
    apiCall: buildWafCustomRuleApiCall(
      expression,
      action,
      'asm_allowed_urls',
      'Positive-security allowed URLs',
    ),
    terraform: buildWafCustomRuleTerraform(expression, action, 'asm_allowed_urls'),
    notes: [
      {
        severity: 'warn',
        text: 'Positive-security models (allow-list URLs) are aggressive. Validate the expression covers every legitimate path — including static assets, health checks, and Cloudflare-injected paths — before enabling the block action.',
      },
    ],
  };
}

function urlExpression(u: UrlSpec): string {
  let body: string;
  if (u.pattern.endsWith('*')) {
    const prefix = u.pattern.replace(/\*$/, '');
    body = `starts_with(http.request.uri.path, "${cfStringLiteral(prefix)}")`;
  } else if (u.pattern.includes('*')) {
    const re = u.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    body = `http.request.uri.path matches "^${cfStringLiteral(re)}$"`;
  } else {
    body = `http.request.uri.path eq "${cfStringLiteral(u.pattern)}"`;
  }
  if (u.methods?.length) {
    const methods = u.methods.map((m) => `"${m.toUpperCase()}"`).join(' ');
    body = `(${body}) and (http.request.method in {${methods}})`;
  }
  return body;
}

function buildDisallowedFileTypesRule(
  types: string[],
  mode: 'transparent' | 'blocking',
): ConvertedRule {
  const list = types.map((t) => `"${cfStringLiteral(t.toLowerCase())}"`).join(' ');
  const expression = `lower(http.request.uri.path.extension) in {${list}}`;
  const action = actionForMode(mode);
  return {
    type: 'WAF Custom Rule',
    name: `Block ${types.length} disallowed file types`,
    original: `disallowed_file_types: ${types.join(', ')}`,
    expression,
    guiSteps: buildAsmDashboardSteps('waf-custom', { expression, action }),
    apiCall: buildWafCustomRuleApiCall(
      expression,
      action,
      'asm_disallowed_filetypes',
      'Disallowed file types',
    ),
    terraform: buildWafCustomRuleTerraform(expression, action, 'asm_disallowed_filetypes'),
  };
}

function buildAllowedFileTypesRule(
  types: string[],
  mode: 'transparent' | 'blocking',
): ConvertedRule {
  const list = types.map((t) => `"${cfStringLiteral(t.toLowerCase())}"`).join(' ');
  // Only enforce on requests that target a file with a recognizable extension.
  const expression = `len(http.request.uri.path.extension) gt 0 and not (lower(http.request.uri.path.extension) in {${list}})`;
  const action = actionForMode(mode);
  return {
    type: 'WAF Custom Rule',
    name: `Allow-list ${types.length} file types — block all others`,
    original: `allowed_file_types: ${types.join(', ')}`,
    expression,
    guiSteps: buildAsmDashboardSteps('waf-custom', { expression, action }),
    apiCall: buildWafCustomRuleApiCall(
      expression,
      action,
      'asm_allowed_filetypes',
      'Allowed file types only',
    ),
    terraform: buildWafCustomRuleTerraform(expression, action, 'asm_allowed_filetypes'),
  };
}

function buildAllowedMethodsRule(
  methods: string[],
  mode: 'transparent' | 'blocking',
): ConvertedRule {
  const list = methods.map((m) => `"${m.toUpperCase()}"`).join(' ');
  const expression = `not (http.request.method in {${list}})`;
  const action = actionForMode(mode);
  return {
    type: 'WAF Custom Rule',
    name: `Block HTTP methods outside allowed set (${methods.join(', ')})`,
    original: `allowed_methods: ${methods.join(', ')}`,
    expression,
    guiSteps: buildAsmDashboardSteps('waf-custom', { expression, action }),
    apiCall: buildWafCustomRuleApiCall(
      expression,
      action,
      'asm_allowed_methods',
      'Allowed HTTP methods',
    ),
    terraform: buildWafCustomRuleTerraform(expression, action, 'asm_allowed_methods'),
  };
}

function buildIpExceptionRules(ips: IpEntry[], mode: 'transparent' | 'blocking'): ConvertedRule[] {
  const blocks = ips.filter((i) => i.action === 'block').map((i) => i.cidr);
  const allows = ips.filter((i) => i.action === 'allow').map((i) => i.cidr);
  const out: ConvertedRule[] = [];

  if (blocks.length > 0) {
    const listName = 'asm_ip_blocklist';
    const action = actionForMode(mode);
    out.push({
      type: 'IP List',
      name: `Block ${blocks.length} IPs/CIDRs`,
      original: blocks.map((b) => `  block: ${b}`).join('\n'),
      expression: `ip.src in $${listName}`,
      guiSteps: buildAsmDashboardSteps('ip-list', {
        listName,
        action,
        count: blocks.length,
        kind: 'block',
      }),
      apiCall: buildIpListApiCall(listName, blocks, action, 'block'),
      terraform: buildIpListTerraform(listName, blocks, action, 'block'),
    });
  }
  if (allows.length > 0) {
    const listName = 'asm_ip_allowlist';
    out.push({
      type: 'IP List',
      name: `Allow-list (skip WAF) for ${allows.length} IPs/CIDRs`,
      original: allows.map((b) => `  allow: ${b}`).join('\n'),
      expression: `ip.src in $${listName}`,
      guiSteps: buildAsmDashboardSteps('ip-list', {
        listName,
        action: 'skip',
        count: allows.length,
        kind: 'allow',
      }),
      apiCall: buildIpListApiCall(listName, allows, 'skip', 'allow'),
      terraform: buildIpListTerraform(listName, allows, 'skip', 'allow'),
      notes: [
        {
          severity: 'info',
          text: 'For "allow" IPs, configure a WAF Custom Rule with action "Skip" to bypass remaining WAF checks. This is closer to F5 ASM trust list semantics.',
        },
      ],
    });
  }
  return out;
}

function buildIpIntelRule(cfg: IpIntelConfig, mode: 'transparent' | 'blocking'): ConvertedRule {
  const expression = 'cf.threat_score gt 30';
  const action = actionForMode(mode, 'managed_challenge');
  return {
    type: 'WAF Custom Rule',
    name: `IP Intelligence — challenge/block based on Cloudflare threat score`,
    original: cfg.categories.map((c) => `  ${c.name} → ${c.action}`).join('\n'),
    expression,
    guiSteps: buildAsmDashboardSteps('waf-custom', { expression, action }),
    apiCall: buildWafCustomRuleApiCall(
      expression,
      action,
      'asm_ip_intel',
      'IP Intelligence (migrated from F5 ASM)',
    ),
    terraform: buildWafCustomRuleTerraform(expression, action, 'asm_ip_intel'),
    notes: [
      {
        severity: 'info',
        text: 'Cloudflare uses a unified threat score (0–100) rather than discrete F5 IP intelligence categories. Threshold 30 is a balanced starting point — increase to reduce false positives, decrease for stricter enforcement.',
      },
    ],
  };
}

function buildGeoRule(geo: GeoEntry[], mode: 'transparent' | 'blocking'): ConvertedRule {
  const blocked = geo
    .filter((g) => g.action === 'block')
    .map((g) => `"${g.country.toUpperCase()}"`);
  const allowed = geo
    .filter((g) => g.action === 'allow')
    .map((g) => `"${g.country.toUpperCase()}"`);
  const action = actionForMode(mode);

  let expression: string;
  if (blocked.length > 0 && allowed.length === 0) {
    expression = `ip.geoip.country in {${blocked.join(' ')}}`;
  } else if (allowed.length > 0 && blocked.length === 0) {
    expression = `not (ip.geoip.country in {${allowed.join(' ')}})`;
  } else {
    expression = `ip.geoip.country in {${blocked.join(' ')}}`;
  }

  return {
    type: 'WAF Custom Rule',
    name: `Geolocation enforcement (${geo.length} countries)`,
    original: geo.map((g) => `  ${g.country} → ${g.action}`).join('\n'),
    expression,
    guiSteps: buildAsmDashboardSteps('waf-custom', { expression, action }),
    apiCall: buildWafCustomRuleApiCall(
      expression,
      action,
      'asm_geo',
      'Geolocation enforcement (migrated from F5 ASM)',
    ),
    terraform: buildWafCustomRuleTerraform(expression, action, 'asm_geo'),
  };
}

function buildBotRule(cfg: BotDefenseConfig, mode: 'transparent' | 'blocking'): ConvertedRule {
  const threshold =
    cfg.mitigationLevel === 'strict' ? 30 : cfg.mitigationLevel === 'standard' ? 15 : 5;
  const expression = `cf.bot_management.score lt ${threshold} and not cf.bot_management.verified_bot`;
  const action = actionForMode(mode, 'managed_challenge');
  return {
    type: 'Bot Management',
    name: `Bot defense (${cfg.mitigationLevel ?? 'standard'}) → cf.bot_management.score lt ${threshold}`,
    original: `bot_defense: enabled=${cfg.enabled}, level=${cfg.mitigationLevel ?? 'unknown'}`,
    expression,
    guiSteps: buildAsmDashboardSteps('bot', { mode, threshold }),
    apiCall: buildBotApiCall(expression, action),
    terraform: buildBotTerraform(expression, action),
    notes: [
      {
        severity: 'gated',
        text: 'Bot Management requires a Cloudflare Enterprise plan (or Business with the Bot Management add-on). Without it, use Super Bot Fight Mode in the dashboard — it offers similar coverage with fewer tunables.',
      },
    ],
  };
}

function buildBruteForceRule(
  cfg: BruteForceConfig,
  mode: 'transparent' | 'blocking',
): ConvertedRule {
  const loginPath = cfg.loginUrl ?? '/login';
  const expression = `http.request.method eq "POST" and http.request.uri.path eq "${cfStringLiteral(loginPath)}"`;
  const threshold = cfg.maxFailedLogins ?? 5;
  const period = cfg.failedLoginIntervalSec ?? 60;
  const action = actionForMode(mode, 'managed_challenge');
  return {
    type: 'Rate Limiting',
    name: `Brute-force prevention on ${loginPath} (${threshold} req / ${period}s)`,
    original: `brute_force: login_url=${loginPath}, max_failed_logins=${threshold}, interval=${period}s`,
    expression,
    guiSteps: buildAsmDashboardSteps('rate-limit', { loginPath, threshold, period, action }),
    apiCall: buildRateLimitApiCall(expression, action, threshold, period, 'asm_brute_force'),
    terraform: buildRateLimitTerraform(expression, action, threshold, period, 'asm_brute_force'),
    notes: [
      {
        severity: 'info',
        text: 'Cloudflare Rate Limiting counts all matching requests by default. To approximate F5\'s "failed logins" semantics, use the `response.status_code` characteristic (Enterprise) to only count 401/403 responses, or implement the failure-counter in a Snippet.',
      },
    ],
  };
}

function buildCsrfRule(cfg: CsrfConfig, mode: 'transparent' | 'blocking'): ConvertedRule {
  const paths = cfg.urls ?? ['/*'];
  const pathExpr = paths
    .map((p) =>
      p.endsWith('*')
        ? `starts_with(http.request.uri.path, "${cfStringLiteral(p.replace(/\*$/, ''))}")`
        : `http.request.uri.path eq "${cfStringLiteral(p)}"`,
    )
    .map((e) => `(${e})`)
    .join(' or ');
  // First line of defense: same-origin referer check.
  const expression = `(${pathExpr}) and http.request.method in {"POST" "PUT" "PATCH" "DELETE"} and (not any(http.request.headers["referer"][*] contains http.host))`;
  const action = actionForMode(mode);

  return {
    type: 'Snippet',
    name: 'CSRF protection (referer guard + token snippet)',
    original: `csrf: enabled=${cfg.enabled}, urls=${paths.join(', ')}`,
    expression,
    guiSteps: buildAsmDashboardSteps('csrf', { expression, action }),
    apiCall: buildCsrfSnippet(paths),
    terraform: buildWafCustomRuleTerraform(expression, action, 'asm_csrf_referer'),
    notes: [
      {
        severity: 'warn',
        text: 'Referer/Origin checks block obvious CSRF but do not replace synchronizer-token validation. The accompanying Snippet provides a starting point for double-submit cookie + HMAC token verification — adapt it to your auth model.',
      },
    ],
  };
}

function buildLoginEnforcementRule(cfg: LoginEnforcementConfig): ConvertedRule {
  const paths = cfg.authenticatedUrls ?? [];
  return {
    type: 'Zero Trust (Gated)',
    name: 'Login enforcement → Cloudflare Access self-hosted app',
    original: `login_enforcement: login_url=${cfg.loginUrl ?? '(none)'}, authenticated_urls=${paths.join(', ')}`,
    guiSteps: buildAsmDashboardSteps('access', { paths, loginUrl: cfg.loginUrl }),
    notes: [
      {
        severity: 'gated',
        text: 'Login enforcement maps to a Cloudflare Access self-hosted application. This requires Cloudflare Zero Trust. Configure your identity provider, create an Access application covering the authenticated URLs, and write an Access policy that requires identity (e.g., emails ending in @yourdomain.com).',
      },
    ],
  };
}

function buildSessionTrackingRule(cfg: SessionTrackingConfig): ConvertedRule {
  return {
    type: 'Snippet',
    name: 'Session tracking (HMAC-signed cookie)',
    original: `session_tracking: track_by=${cfg.trackBy ?? 'session_cookie'}`,
    apiCall: buildSessionTrackingSnippet(cfg.trackBy ?? 'session_cookie'),
    guiSteps: buildAsmDashboardSteps('snippet'),
    notes: [
      {
        severity: 'warn',
        text: 'F5 session tracking has no native Cloudflare equivalent. The Snippet template signs a session cookie with HMAC and verifies it on subsequent requests — store the secret in Wrangler vars/secrets.',
      },
    ],
  };
}

function buildDataGuardRule(cfg: DataGuardConfig): ConvertedRule {
  const patterns = [...cfg.patterns, ...(cfg.customPatterns?.map((p) => p.name) ?? [])];
  return {
    type: 'Zero Trust (Gated)',
    name: `DLP — ${patterns.length} sensitive-data patterns`,
    original: patterns.map((p) => `  pattern: ${p}`).join('\n'),
    guiSteps: buildDlpDashboardSteps(patterns),
    notes: [
      {
        severity: 'gated',
        text: 'F5 DataGuard maps to Cloudflare DLP, which is part of Cloudflare Zero Trust. Configure DLP profiles (Built-in: PCI, US SSN, etc.) and apply them through Gateway HTTP policies. Pattern names like "credit_card" and "us_ssn" exist as Cloudflare built-in detectors.',
      },
    ],
  };
}

function buildResponsePagesRule(pages: ResponsePageSpec[]): ConvertedRule {
  return {
    type: 'WAF Custom Rule',
    name: `Custom response page (${pages.length} pages in source policy)`,
    original: pages
      .map(
        (p) =>
          `  type=${p.type ?? 'default'} status=${p.statusCode ?? 'n/a'}: ${p.body?.substring(0, 60) ?? ''}`,
      )
      .join('\n'),
    guiSteps: [
      'Open <strong>Rules</strong> → <strong>Custom Error Responses</strong>.',
      'Create a new response and paste the body content (HTML/JSON).',
      'Edit each blocking WAF rule and set the <strong>custom_response</strong> action_parameters to reference the new template.',
      'Click <strong>Deploy</strong>.',
    ],
    notes: [
      {
        severity: 'info',
        text: 'Cloudflare custom response pages are scoped per rule. Re-use the same template across multiple WAF rules for a uniform UX.',
      },
    ],
  };
}

function buildParameterRule(params: PolicyModel['parameters']): ConvertedRule {
  const examples = params
    .slice(0, 6)
    .map(
      (p) =>
        `  ${p.name}${p.regex ? ` matches ${p.regex}` : ''}${p.maxLength ? ` (max ${p.maxLength})` : ''}`,
    )
    .join('\n');
  return {
    type: 'Snippet',
    name: `Parameter validation (${params.length} parameters)`,
    original: examples,
    guiSteps: [
      'Open <strong>Rules</strong> → <strong>Snippets</strong> and create a new snippet.',
      'Use <code>URL().searchParams</code> and <code>request.formData()</code> to inspect parameters.',
      'For each parameter, reject the request (return 400) if the value violates the rule.',
      'For JSON/XML body inspection beyond ~1 MB, consider Workers instead of Snippets.',
    ],
    apiCall: buildCsrfSnippet([], 'parameter-validation'),
    notes: [
      {
        severity: 'warn',
        text: 'Cloudflare WAF Custom Rules can reference URL query parameters via http.request.uri.query, but full-body parameter inspection (JSON/XML schemas, regex per field) is best done in a Snippet/Worker. Body scanning has size limits — verify against your largest legitimate requests.',
      },
    ],
  };
}

function buildHeaderInspectionRule(headers: PolicyModel['headers']): ConvertedRule {
  const blockHeaders = headers.filter((h) => h.action === 'block');
  if (blockHeaders.length === 0) {
    return {
      type: 'WAF Custom Rule',
      name: 'Header inspection (informational)',
      original: headers.map((h) => `  ${h.name} → ${h.action}`).join('\n'),
      guiSteps: buildAsmDashboardSteps('waf-custom', { expression: 'true', action: 'log' }),
      notes: [
        {
          severity: 'info',
          text: 'Header inspection rules in ASM were allow-only; nothing to convert into a blocking rule.',
        },
      ],
    };
  }
  const expression = blockHeaders
    .map((h) => `len(http.request.headers["${cfStringLiteral(h.name.toLowerCase())}"]) gt 0`)
    .map((e) => `(${e})`)
    .join(' or ');
  return {
    type: 'WAF Custom Rule',
    name: `Block requests containing ${blockHeaders.length} prohibited headers`,
    original: blockHeaders.map((h) => `  block_header: ${h.name}`).join('\n'),
    expression,
    guiSteps: buildAsmDashboardSteps('waf-custom', { expression, action: 'block' }),
    apiCall: buildWafCustomRuleApiCall(
      expression,
      'block',
      'asm_header_block',
      'Blocked headers (migrated from F5 ASM)',
    ),
    terraform: buildWafCustomRuleTerraform(expression, 'block', 'asm_header_block'),
  };
}

function buildCookieSnippetRule(model: PolicyModel): ConvertedRule {
  const signed = model.cookies.filter((c) => c.signed);
  return {
    type: 'Snippet',
    name: `Cookie signing for ${signed.length} cookie(s)`,
    original: signed.map((c) => `  signed_cookie: ${c.name}`).join('\n'),
    guiSteps: buildAsmDashboardSteps('snippet'),
    apiCall: buildSessionTrackingSnippet('cookie-sign'),
    notes: [
      {
        severity: 'warn',
        text: 'F5 ASM can sign cookies before sending them to the client. Replicate this in a Snippet that HMACs the cookie value with a secret pulled from Wrangler env vars, and verifies the signature on inbound requests. Set HttpOnly/Secure flags in the Set-Cookie header.',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

function computeCoverage(results: ConvertedRule[]): CoverageStats {
  let converted = 0;
  let review = 0;
  let snippets = 0;
  let zeroTrust = 0;
  for (const r of results) {
    if (r.type === 'Snippet') {
      snippets++;
      continue;
    }
    if (r.type === 'Zero Trust (Gated)') {
      zeroTrust++;
      continue;
    }
    converted++;
    if (r.notes?.some((n) => n.severity === 'warn')) {
      review++;
    }
  }
  return { converted, review, snippets, zeroTrust };
}
