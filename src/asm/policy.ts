/**
 * F5 ASM policy model — a normalized intermediate representation produced by
 * parsing the (varied) F5 ASM policy XML exports.
 *
 * F5's ASM XML schema has evolved across BIG-IP versions and the policy
 * editor exposes a "compact" and "complete" export. We aim to be permissive:
 * each field is optional and defaults to a sensible empty value, and the
 * parser tries multiple element paths before giving up.
 */

import { XMLParser } from 'fast-xml-parser';

export interface UrlSpec {
  /** Path or wildcard pattern, e.g. `/api/*`. */
  pattern: string;
  /** Optional protocol filter. */
  protocol?: 'http' | 'https';
  /** Optional method filter. */
  methods?: string[];
}

export interface ParameterSpec {
  name: string;
  type?: 'static' | 'dynamic' | 'json' | 'xml';
  required?: boolean;
  regex?: string;
  maxLength?: number;
}

export interface HeaderSpec {
  name: string;
  required?: boolean;
  regex?: string;
  action?: 'allow' | 'block';
}

export interface CookieSpec {
  name: string;
  signed?: boolean;
  httpOnly?: boolean;
  secure?: boolean;
}

export interface IpEntry {
  cidr: string;
  action: 'allow' | 'block' | 'log';
  note?: string;
}

export interface GeoEntry {
  country: string;
  action: 'allow' | 'block' | 'log';
}

export interface SignatureEntry {
  id: string;
  name?: string;
  enabled: boolean;
  action: 'block' | 'alarm' | 'learn' | 'log' | 'transparent';
}

export interface SignatureSet {
  name: string;
  enabled: boolean;
}

export interface BotDefenseConfig {
  enabled: boolean;
  mitigationLevel?: 'off' | 'transparent' | 'standard' | 'strict';
}

export interface BruteForceConfig {
  enabled: boolean;
  loginUrl?: string;
  maxFailedLogins?: number;
  failedLoginIntervalSec?: number;
}

export interface CsrfConfig {
  enabled: boolean;
  urls?: string[];
}

export interface LoginEnforcementConfig {
  enabled: boolean;
  authenticatedUrls?: string[];
  loginUrl?: string;
}

export interface SessionTrackingConfig {
  enabled: boolean;
  trackBy?: 'session_cookie' | 'user' | 'device_id';
}

export interface DataGuardConfig {
  enabled: boolean;
  patterns: string[]; // canonical names: credit_card, us_ssn, etc.
  customPatterns?: { name: string; regex: string }[];
}

export interface IpIntelCategory {
  name: string;
  action: 'allow' | 'block' | 'log';
}

export interface IpIntelConfig {
  enabled: boolean;
  categories: IpIntelCategory[];
}

export interface ResponsePageSpec {
  type?: string;
  body?: string;
  statusCode?: number;
}

export type EnforcementMode = 'transparent' | 'blocking';

export interface PolicyModel {
  meta: {
    name: string;
    description?: string;
    enforcementMode: EnforcementMode;
    applicationLanguage?: string;
  };
  signatures: SignatureEntry[];
  signatureSets: SignatureSet[];
  allowedUrls: UrlSpec[];
  disallowedUrls: UrlSpec[];
  allowedFileTypes: string[];
  disallowedFileTypes: string[];
  allowedMethods: string[];
  parameters: ParameterSpec[];
  headers: HeaderSpec[];
  cookies: CookieSpec[];
  ipExceptions: IpEntry[];
  ipIntelligence?: IpIntelConfig;
  geolocations: GeoEntry[];
  botDefense?: BotDefenseConfig;
  bruteForce?: BruteForceConfig;
  csrf?: CsrfConfig;
  loginEnforcement?: LoginEnforcementConfig;
  sessionTracking?: SessionTrackingConfig;
  dataGuard?: DataGuardConfig;
  responsePages: ResponsePageSpec[];
  /** Anything we could not slot into the model above — captured verbatim for review. */
  unrecognized: { path: string; sample: string }[];
}

/** Parse an ASM policy XML into a normalized {@link PolicyModel}. */
export function parsePolicy(xml: string): PolicyModel {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true,
    parseAttributeValue: false,
    parseTagValue: false,
    allowBooleanAttributes: true,
  });

  let raw: unknown;
  try {
    raw = parser.parse(xml);
  } catch {
    return emptyPolicy('parse-error');
  }

  const policy = pickPolicyRoot(raw);
  if (!policy) {
    return emptyPolicy('unrecognized');
  }

  const meta = {
    name: text(policy.name) ?? text(policy['@_name']) ?? 'unnamed-policy',
    description: text(policy.description),
    enforcementMode: normalizeEnforcement(
      text(policy.enforcement_mode) ?? text(policy.enforcementMode) ?? 'blocking',
    ),
    applicationLanguage: text(policy.application_language),
  };

  return {
    meta,
    signatures: parseSignatures(policy),
    signatureSets: parseSignatureSets(policy),
    allowedUrls: parseUrls(policy, 'allowed_url'),
    disallowedUrls: parseUrls(policy, 'disallowed_url'),
    allowedFileTypes: parseFileTypes(policy, 'allowed_file_type'),
    disallowedFileTypes: parseFileTypes(policy, 'disallowed_file_type'),
    allowedMethods: parseAllowedMethods(policy),
    parameters: parseParameters(policy),
    headers: parseHeaders(policy),
    cookies: parseCookies(policy),
    ipExceptions: parseIpExceptions(policy),
    ipIntelligence: parseIpIntelligence(policy),
    geolocations: parseGeolocations(policy),
    botDefense: parseBotDefense(policy),
    bruteForce: parseBruteForce(policy),
    csrf: parseCsrf(policy),
    loginEnforcement: parseLoginEnforcement(policy),
    sessionTracking: parseSessionTracking(policy),
    dataGuard: parseDataGuard(policy),
    responsePages: parseResponsePages(policy),
    unrecognized: [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AnyRecord = Record<string, unknown>;

function emptyPolicy(name: string): PolicyModel {
  return {
    meta: { name, enforcementMode: 'blocking' },
    signatures: [],
    signatureSets: [],
    allowedUrls: [],
    disallowedUrls: [],
    allowedFileTypes: [],
    disallowedFileTypes: [],
    allowedMethods: [],
    parameters: [],
    headers: [],
    cookies: [],
    ipExceptions: [],
    geolocations: [],
    responsePages: [],
    unrecognized: [],
  };
}

function pickPolicyRoot(raw: unknown): AnyRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as AnyRecord;
  // Common roots seen in F5 ASM exports.
  for (const key of ['policy', 'security_policy', 'asm_policy', 'POLICY']) {
    const v = obj[key];
    if (v && typeof v === 'object') return v as AnyRecord;
  }
  // Sometimes the root is the policy itself.
  return obj;
}

function text(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    const o = v as AnyRecord;
    if ('#text' in o) return text(o['#text']);
    if ('@_value' in o) return text(o['@_value']);
  }
  return undefined;
}

function toArray<T = unknown>(v: unknown): T[] {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? (v as T[]) : [v as T];
}

function bool(v: unknown, defaultValue = false): boolean {
  const s = text(v);
  if (!s) return defaultValue;
  return /^(true|1|yes|enabled|on)$/i.test(s);
}

function num(v: unknown): number | undefined {
  const s = text(v);
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeEnforcement(s: string): EnforcementMode {
  return /transparent|monitor|learn/i.test(s) ? 'transparent' : 'blocking';
}

function normalizeAction(s: string | undefined): 'allow' | 'block' | 'log' {
  if (!s) return 'block';
  const t = s.toLowerCase();
  if (/allow|trust|whitelist/.test(t)) return 'allow';
  if (/log|alarm|learn|monitor|transparent/.test(t)) return 'log';
  return 'block';
}

// ---------------------------------------------------------------------------
// Section parsers
// ---------------------------------------------------------------------------

function parseSignatures(policy: AnyRecord): SignatureEntry[] {
  const settings = policy.signature_settings ?? policy.signatures;
  if (!settings || typeof settings !== 'object') return [];
  const items = toArray<AnyRecord>((settings as AnyRecord).signature ?? []);
  return items
    .map((s) => ({
      id: text(s['@_id']) ?? text(s.id) ?? '',
      name: text(s.name),
      enabled: bool(s['@_enabled'] ?? s.enabled, true),
      action: normalizeSigAction(text(s['@_action']) ?? text(s.action)),
    }))
    .filter((s) => s.id);
}

function normalizeSigAction(s: string | undefined): SignatureEntry['action'] {
  if (!s) return 'block';
  const t = s.toLowerCase();
  if (/alarm/.test(t)) return 'alarm';
  if (/learn/.test(t)) return 'learn';
  if (/log/.test(t)) return 'log';
  if (/transparent/.test(t)) return 'transparent';
  return 'block';
}

function parseSignatureSets(policy: AnyRecord): SignatureSet[] {
  const settings = policy.signature_settings ?? policy.signatures;
  if (!settings || typeof settings !== 'object') return [];
  const items = toArray<AnyRecord>((settings as AnyRecord).signature_set ?? []);
  return items
    .map((s) => ({
      name: text(s['@_name']) ?? text(s.name) ?? 'unnamed-set',
      enabled: bool(s['@_enabled'] ?? s.enabled, true),
    }))
    .filter((s) => s.name);
}

function parseUrls(policy: AnyRecord, key: 'allowed_url' | 'disallowed_url'): UrlSpec[] {
  const container = (policy.urls ?? policy) as AnyRecord;
  const items = toArray<AnyRecord>(container[key] ?? []);
  return items
    .map((u): UrlSpec => {
      const pattern = text(u.name) ?? text(u['@_name']) ?? text(u.url) ?? '';
      const protocol = text(u.protocol)?.toLowerCase();
      const methods = toArray(u.method ?? u.methods)
        .map((m) => text(m))
        .filter((m): m is string => !!m);
      return {
        pattern,
        protocol: protocol === 'http' || protocol === 'https' ? protocol : undefined,
        methods: methods.length ? methods : undefined,
      };
    })
    .filter((u) => u.pattern);
}

function parseFileTypes(policy: AnyRecord, key: string): string[] {
  const container = (policy.file_types ?? policy) as AnyRecord;
  return toArray(container[key] ?? [])
    .map((v) => text(v))
    .filter((v): v is string => !!v);
}

function parseAllowedMethods(policy: AnyRecord): string[] {
  const container = (policy.allowed_methods ?? policy.methods ?? {}) as AnyRecord;
  return toArray(container.method ?? [])
    .map((v) => text(v))
    .filter((v): v is string => !!v)
    .map((m) => m.toUpperCase());
}

function parseParameters(policy: AnyRecord): ParameterSpec[] {
  const container = (policy.parameters ?? {}) as AnyRecord;
  const items = toArray<AnyRecord>(container.parameter ?? []);
  return items
    .map(
      (p): ParameterSpec => ({
        name: text(p.name) ?? text(p['@_name']) ?? '',
        type: normalizeParamType(text(p.type) ?? text(p['@_type'])),
        required: bool(p.required ?? p['@_required'], false),
        regex: text(p.regex),
        maxLength: num(p.max_length ?? p['@_max_length']),
      }),
    )
    .filter((p) => p.name);
}

function normalizeParamType(s: string | undefined): ParameterSpec['type'] {
  if (!s) return undefined;
  const t = s.toLowerCase();
  if (t.includes('json')) return 'json';
  if (t.includes('xml')) return 'xml';
  if (t.includes('dyn')) return 'dynamic';
  if (t.includes('static')) return 'static';
  return undefined;
}

function parseHeaders(policy: AnyRecord): HeaderSpec[] {
  const container = (policy.headers ?? {}) as AnyRecord;
  const items = toArray<AnyRecord>(container.header ?? []);
  return items
    .map(
      (h): HeaderSpec => ({
        name: text(h.name) ?? text(h['@_name']) ?? '',
        required: bool(h.required ?? h['@_required'], false),
        regex: text(h.regex),
        action: /allow/i.test(text(h.action) ?? '') ? 'allow' : 'block',
      }),
    )
    .filter((h) => h.name);
}

function parseCookies(policy: AnyRecord): CookieSpec[] {
  const container = (policy.cookies ?? {}) as AnyRecord;
  const items = toArray<AnyRecord>(container.cookie ?? []);
  return items
    .map(
      (c): CookieSpec => ({
        name: text(c.name) ?? text(c['@_name']) ?? '',
        signed: bool(c.signed ?? c['@_signed'], false),
        httpOnly: bool(c.http_only ?? c['@_http_only'], false),
        secure: bool(c.secure ?? c['@_secure'], false),
      }),
    )
    .filter((c) => c.name);
}

function parseIpExceptions(policy: AnyRecord): IpEntry[] {
  const container = (policy.ip_exceptions ?? {}) as AnyRecord;
  const items = toArray<AnyRecord>(container.ip ?? []);
  return items
    .map(
      (ip): IpEntry => ({
        cidr: text(ip.cidr) ?? text(ip['@_cidr']) ?? text(ip.ip) ?? '',
        action: normalizeAction(text(ip.action) ?? text(ip['@_action'])),
        note: text(ip.note),
      }),
    )
    .filter((ip) => ip.cidr);
}

function parseIpIntelligence(policy: AnyRecord): IpIntelConfig | undefined {
  const container = policy.ip_intelligence;
  if (!container || typeof container !== 'object') return undefined;
  const o = container as AnyRecord;
  const enabled = bool(o['@_enabled'] ?? o.enabled, true);
  const cats = toArray<AnyRecord>(o.category ?? []).map(
    (c): IpIntelCategory => ({
      name: text(c['@_name']) ?? text(c.name) ?? '',
      action: normalizeAction(text(c['@_action']) ?? text(c.action)),
    }),
  );
  return { enabled, categories: cats.filter((c) => c.name) };
}

function parseGeolocations(policy: AnyRecord): GeoEntry[] {
  const container = (policy.geolocation_enforcement ?? policy.geolocations ?? {}) as AnyRecord;
  const items = toArray<AnyRecord>(container.country ?? []);
  return items
    .map(
      (g): GeoEntry => ({
        country: text(g['@_code']) ?? text(g.code) ?? text(g) ?? '',
        action: normalizeAction(text(g['@_action']) ?? text(g.action)),
      }),
    )
    .filter((g) => g.country);
}

function parseBotDefense(policy: AnyRecord): BotDefenseConfig | undefined {
  const c = policy.bot_defense;
  if (!c || typeof c !== 'object') return undefined;
  const o = c as AnyRecord;
  return {
    enabled: bool(o['@_enabled'] ?? o.enabled, true),
    mitigationLevel: normalizeMitigation(text(o.mitigation_level)),
  };
}

function normalizeMitigation(s: string | undefined): BotDefenseConfig['mitigationLevel'] {
  if (!s) return undefined;
  const t = s.toLowerCase();
  if (t.includes('strict')) return 'strict';
  if (t.includes('standard')) return 'standard';
  if (t.includes('transparent')) return 'transparent';
  if (t.includes('off')) return 'off';
  return undefined;
}

function parseBruteForce(policy: AnyRecord): BruteForceConfig | undefined {
  const c = policy.brute_force_prevention ?? policy.brute_force;
  if (!c || typeof c !== 'object') return undefined;
  const o = c as AnyRecord;
  return {
    enabled: bool(o['@_enabled'] ?? o.enabled, true),
    loginUrl: text(o.login_url),
    maxFailedLogins: num(o.max_failed_logins),
    failedLoginIntervalSec: num(o.failed_login_interval),
  };
}

function parseCsrf(policy: AnyRecord): CsrfConfig | undefined {
  const c = policy.csrf_protection ?? policy.csrf;
  if (!c || typeof c !== 'object') return undefined;
  const o = c as AnyRecord;
  const urls = toArray(o.url ?? [])
    .map((u) => text(u))
    .filter((u): u is string => !!u);
  return {
    enabled: bool(o['@_enabled'] ?? o.enabled, true),
    urls: urls.length ? urls : undefined,
  };
}

function parseLoginEnforcement(policy: AnyRecord): LoginEnforcementConfig | undefined {
  const c = policy.login_enforcement;
  if (!c || typeof c !== 'object') return undefined;
  const o = c as AnyRecord;
  return {
    enabled: bool(o['@_enabled'] ?? o.enabled, true),
    authenticatedUrls: toArray(o.authenticated_url ?? [])
      .map((u) => text(u))
      .filter((u): u is string => !!u),
    loginUrl: text(o.login_url),
  };
}

function parseSessionTracking(policy: AnyRecord): SessionTrackingConfig | undefined {
  const c = policy.session_tracking;
  if (!c || typeof c !== 'object') return undefined;
  const o = c as AnyRecord;
  const trackBy = text(o.track_by)?.toLowerCase();
  return {
    enabled: bool(o['@_enabled'] ?? o.enabled, true),
    trackBy:
      trackBy === 'user' || trackBy === 'device_id' || trackBy === 'session_cookie'
        ? trackBy
        : undefined,
  };
}

function parseDataGuard(policy: AnyRecord): DataGuardConfig | undefined {
  const c = policy.data_guard ?? policy.dataguard;
  if (!c || typeof c !== 'object') return undefined;
  const o = c as AnyRecord;
  const patterns = toArray<AnyRecord | string>(o.pattern ?? [])
    .map((p) =>
      typeof p === 'string' ? p : (text((p as AnyRecord)['@_name']) ?? text((p as AnyRecord).name)),
    )
    .filter((p): p is string => !!p);
  const customPatterns = toArray<AnyRecord>(o.custom_pattern ?? [])
    .map((p) => ({
      name: text(p['@_name']) ?? text(p.name) ?? '',
      regex: text(p.regex) ?? '',
    }))
    .filter((p) => p.name && p.regex);
  return {
    enabled: bool(o['@_enabled'] ?? o.enabled, true),
    patterns,
    customPatterns: customPatterns.length ? customPatterns : undefined,
  };
}

function parseResponsePages(policy: AnyRecord): ResponsePageSpec[] {
  const container = (policy.response_pages ?? {}) as AnyRecord;
  const items = toArray<AnyRecord>(container.response_page ?? []);
  return items.map((r) => ({
    type: text(r['@_type']) ?? text(r.type),
    body: text(r.body),
    statusCode: num(r.status_code),
  }));
}
