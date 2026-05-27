/**
 * Builders for Cloudflare rules-language expressions.
 *
 * The rules language is documented at
 * https://developers.cloudflare.com/ruleset-engine/rules-language/ — these
 * helpers are intentionally narrow and only emit constructs we have round-tripped.
 */

import { cfStringLiteral } from './escape.js';

/** F5 iRule HTTP field shorthand. */
export type IRuleField =
  | 'uri' // [HTTP::uri] — full request URI including query string
  | 'path' // [HTTP::path] — path component
  | 'host' // [HTTP::host]
  | 'method' // [HTTP::method]
  | 'query' // [HTTP::query]
  | 'header' // [HTTP::header NAME]
  | 'cookie' // [HTTP::cookie NAME]
  | 'client_ip'; // [IP::client_addr]

/** Comparison operators supported in iRule -> CF translation. */
export type Op = 'eq' | 'ne' | 'starts_with' | 'ends_with' | 'contains' | 'matches' | 'in';

const FIELD_MAP: Record<Exclude<IRuleField, 'header' | 'cookie'>, string> = {
  uri: 'http.request.uri',
  path: 'http.request.uri.path',
  host: 'http.host',
  method: 'http.request.method',
  query: 'http.request.uri.query',
  client_ip: 'ip.src',
};

/** Return the Cloudflare field expression for an F5 HTTP field. */
export function cfField(field: IRuleField, argument?: string): string {
  if (field === 'header') {
    if (!argument) throw new Error('header field requires a name');
    return `http.request.headers["${argument.toLowerCase()}"][0]`;
  }
  if (field === 'cookie') {
    if (!argument) throw new Error('cookie field requires a name');
    return `http.cookie["${argument}"]`;
  }
  return FIELD_MAP[field];
}

export interface ConditionInput {
  field: IRuleField;
  fieldArg?: string;
  op: Op;
  value: string | string[];
  negate?: boolean;
  /** When true, treat value as already-escaped expression rather than a literal. */
  raw?: boolean;
}

/** Build a single condition expression. */
export function buildCondition(c: ConditionInput): string {
  const lhs = cfField(c.field, c.fieldArg);
  const negate = c.negate === true;

  const formatLiteral = (v: string): string => (c.raw ? v : `"${cfStringLiteral(v)}"`);

  let expr: string;
  switch (c.op) {
    case 'eq':
      expr = `${lhs} eq ${formatLiteral(String(c.value))}`;
      break;
    case 'ne':
      expr = `${lhs} ne ${formatLiteral(String(c.value))}`;
      break;
    case 'starts_with':
      expr = `starts_with(${lhs}, ${formatLiteral(String(c.value))})`;
      break;
    case 'ends_with':
      expr = `ends_with(${lhs}, ${formatLiteral(String(c.value))})`;
      break;
    case 'contains':
      // CF uses "contains" infix for strings.
      expr = `${lhs} contains ${formatLiteral(String(c.value))}`;
      break;
    case 'matches': {
      const re =
        typeof c.value === 'string' ? c.value : Array.isArray(c.value) ? (c.value[0] ?? '') : '';
      expr = `${lhs} matches "${cfStringLiteral(re)}"`;
      break;
    }
    case 'in': {
      const list = Array.isArray(c.value) ? c.value : [c.value];
      const formatted = list.map((v) => formatLiteral(v)).join(' ');
      expr = `${lhs} in {${formatted}}`;
      break;
    }
    default: {
      // Exhaustiveness check
      const _exhaustive: never = c.op;
      throw new Error(`Unsupported op: ${String(_exhaustive)}`);
    }
  }

  return negate ? `not (${expr})` : expr;
}

/** Combine multiple expressions with AND. */
export function andAll(exprs: string[]): string {
  const cleaned = exprs.filter((e) => e && e.trim().length > 0);
  if (cleaned.length === 0) return 'true';
  if (cleaned.length === 1) return cleaned[0]!;
  return cleaned.map((e) => `(${e})`).join(' and ');
}

/** Combine multiple expressions with OR. */
export function orAll(exprs: string[]): string {
  const cleaned = exprs.filter((e) => e && e.trim().length > 0);
  if (cleaned.length === 0) return 'true';
  if (cleaned.length === 1) return cleaned[0]!;
  return cleaned.map((e) => `(${e})`).join(' or ');
}

/**
 * Build a target URL/expression that may contain F5 substitutions like
 * `[HTTP::uri]` or `[HTTP::host]`. When substitutions are present, we emit
 * a CF rules-language `concat(...)` expression; otherwise a plain literal.
 *
 * Returns `{ literal }` for plain strings, `{ expression }` for dynamic ones.
 */
export function buildDynamicTarget(
  template: string,
): { kind: 'literal'; value: string } | { kind: 'expression'; value: string } {
  const segments = splitSubstitutions(template);
  const hasSub = segments.some((s) => s.kind === 'sub');
  if (!hasSub) return { kind: 'literal', value: template };

  const parts = segments.map((s) =>
    s.kind === 'literal' ? `"${cfStringLiteral(s.value)}"` : substToCfExpression(s.value),
  );
  // Filter out empty literal segments to keep the output tidy.
  const compact = parts.filter((p) => p !== '""');
  if (compact.length === 1) return { kind: 'expression', value: compact[0]! };
  return { kind: 'expression', value: `concat(${compact.join(', ')})` };
}

type Segment = { kind: 'literal'; value: string } | { kind: 'sub'; value: string };

/** Split a string into literal and `[...]` substitution segments. */
function splitSubstitutions(input: string): Segment[] {
  const out: Segment[] = [];
  let i = 0;
  let buf = '';
  while (i < input.length) {
    const ch = input[i];
    if (ch === '[') {
      // find matching ]
      let depth = 1;
      let j = i + 1;
      while (j < input.length && depth > 0) {
        if (input[j] === '[') depth++;
        if (input[j] === ']') depth--;
        if (depth === 0) break;
        j++;
      }
      if (depth === 0) {
        if (buf) {
          out.push({ kind: 'literal', value: buf });
          buf = '';
        }
        out.push({ kind: 'sub', value: input.substring(i + 1, j) });
        i = j + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  if (buf) out.push({ kind: 'literal', value: buf });
  return out;
}

/** Translate a single F5 substitution body to a CF expression fragment. */
function substToCfExpression(body: string): string {
  const trimmed = body.trim();
  // Strip a leading "::" if present (rare).
  const m = /^(HTTP|IP|TCP|SSL|TMM|clock)::(\w+)(?:\s+"?([^"\]]+)"?)?/i.exec(trimmed);
  if (!m) {
    // Unknown subst — leave as a literal so the user can fix it.
    return `"<<<${body}>>>"`;
  }
  const [, ns, fn, arg] = m;
  if (ns === 'HTTP') {
    switch (fn?.toLowerCase()) {
      case 'uri':
        return 'http.request.uri';
      case 'path':
        return 'http.request.uri.path';
      case 'host':
        return 'http.host';
      case 'method':
        return 'http.request.method';
      case 'query':
        return 'http.request.uri.query';
      case 'header':
        return `http.request.headers["${(arg || '').toLowerCase()}"][0]`;
      case 'cookie':
        return `http.cookie["${arg || ''}"]`;
      default:
        return `"<<<${body}>>>"`;
    }
  }
  if (ns === 'IP' && fn?.toLowerCase() === 'client_addr') {
    return 'ip.src';
  }
  return `"<<<${body}>>>"`;
}

/**
 * Translate an F5 operator keyword to our internal {@link Op}.
 * Supports the common F5 operators plus their negated forms.
 */
export function translateOp(f5Op: string): { op: Op; negate: boolean } {
  const lower = f5Op.toLowerCase().trim();
  switch (lower) {
    case 'eq':
    case 'equals':
    case '==':
      return { op: 'eq', negate: false };
    case 'ne':
    case 'not_equal':
    case '!=':
      return { op: 'ne', negate: false };
    case 'starts_with':
      return { op: 'starts_with', negate: false };
    case 'ends_with':
      return { op: 'ends_with', negate: false };
    case 'contains':
      return { op: 'contains', negate: false };
    case 'matches':
    case 'matches_regex':
      return { op: 'matches', negate: false };
    case 'not_starts_with':
      return { op: 'starts_with', negate: true };
    case 'not_ends_with':
      return { op: 'ends_with', negate: true };
    case 'not_contains':
      return { op: 'contains', negate: true };
    default:
      return { op: 'eq', negate: false };
  }
}
