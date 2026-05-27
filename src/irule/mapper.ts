/**
 * Map a parsed iRule AST to {@link ConvertedRule}s.
 *
 * The mapper walks each event block and emits one or more results per
 * recognizable construct. Constructs we cannot translate are emitted as a
 * Snippet result with a JavaScript starter template.
 */

import type { Arg, EventBlock, IfStmt, ParsedScript, RawCommand, Statement } from './parser.js';
import { parse } from './parser.js';
import type { ConversionResult, ConvertedRule, CoverageStats } from '../shared/types.js';
import type { IRuleField } from '../shared/expression.js';
import { andAll, buildCondition, buildDynamicTarget, translateOp } from '../shared/expression.js';
import {
  buildHeaderApiCall,
  buildHeaderTerraform,
  buildOriginApiCall,
  buildOriginTerraform,
  buildRedirectApiCall,
  buildRedirectTerraform,
  buildRewriteApiCall,
  buildRewriteTerraform,
  buildSnippetStarter,
} from './generators/api.js';
import { buildDashboardSteps } from './generators/dashboard.js';

/** Top-level entry point. */
export function convertIRule(source: string): ConversionResult {
  const ast = parse(source);
  const results: ConvertedRule[] = [];

  for (const block of ast.events) {
    results.push(...convertBlock(block));
  }

  // Stray statements (outside any `when` block) are unusual; emit a snippet.
  if (ast.stray.length > 0) {
    results.push(buildStraySnippet(ast));
  }

  const coverage = computeCoverage(results);

  return {
    source: 'irule',
    generatedAt: new Date().toISOString(),
    results,
    coverage,
  };
}

function convertBlock(block: EventBlock): ConvertedRule[] {
  const out: ConvertedRule[] = [];
  const isResponse = block.event === 'HTTP_RESPONSE';

  for (const stmt of block.body) {
    out.push(...convertStatement(stmt, [], isResponse, block));
  }

  // If we have an event type we cannot translate at all (e.g., LB_SELECTED,
  // CLIENT_ACCEPTED, RULE_INIT), emit a Snippet suggestion.
  if (
    block.event === 'LB_SELECTED' ||
    block.event === 'CLIENT_ACCEPTED' ||
    block.event === 'SERVER_CONNECTED' ||
    block.event === 'RULE_INIT' ||
    block.event === 'OTHER'
  ) {
    out.push({
      type: 'Snippet',
      name: `${block.event} event requires Snippet/Workers`,
      original: block.source,
      guiSteps: buildDashboardSteps('Snippet'),
      apiCall: buildSnippetStarter(block.rawEvent, block.source),
      notes: [
        {
          severity: 'warn',
          text: `Event "${block.rawEvent}" has no declarative Cloudflare equivalent. Implement the logic in a Snippet or Worker.`,
        },
      ],
    });
  }

  return out;
}

/**
 * Convert a single statement.
 *
 * `parentConds` carries the chain of guarding `if` conditions so that nested
 * statements emit composed Cloudflare expressions.
 */
function convertStatement(
  stmt: Statement,
  parentConds: string[],
  isResponse: boolean,
  block: EventBlock,
): ConvertedRule[] {
  if (stmt.type === 'if') {
    return convertIf(stmt, parentConds, isResponse, block);
  }
  return convertCommand(stmt, parentConds, isResponse, block);
}

function convertIf(
  stmt: IfStmt,
  parentConds: string[],
  isResponse: boolean,
  block: EventBlock,
): ConvertedRule[] {
  const cfExpr = translateIRuleCondition(stmt.condition);

  const out: ConvertedRule[] = [];
  // Then branch
  const thenChain = cfExpr ? [...parentConds, cfExpr] : parentConds;
  for (const inner of stmt.then) {
    out.push(...convertStatement(inner, thenChain, isResponse, block));
  }
  // Else-if branches
  for (const elseIf of stmt.elseIfs) {
    const elseIfExpr = translateIRuleCondition(elseIf.condition);
    const chain = elseIfExpr ? [...parentConds, elseIfExpr] : parentConds;
    for (const inner of elseIf.then) {
      out.push(...convertStatement(inner, chain, isResponse, block));
    }
  }
  // Else branch — negate the original condition
  if (stmt.elseBranch && cfExpr) {
    const negated = `not (${cfExpr})`;
    const chain = [...parentConds, negated];
    for (const inner of stmt.elseBranch) {
      out.push(...convertStatement(inner, chain, isResponse, block));
    }
  }
  return out;
}

function convertCommand(
  cmd: RawCommand,
  parentConds: string[],
  isResponse: boolean,
  block: EventBlock,
): ConvertedRule[] {
  const baseExpr = andAll(parentConds);
  const name = cmd.name.toLowerCase();

  // HTTP::redirect
  if (name === 'http::redirect') {
    return [buildRedirect(cmd, baseExpr)];
  }

  // HTTP::uri "value" (internal rewrite)
  if (name === 'http::uri' && cmd.args.length >= 1) {
    return [buildRewrite(cmd, baseExpr)];
  }

  // HTTP::header insert|remove|replace ...
  if (name === 'http::header' && cmd.args.length >= 2) {
    const action = argString(cmd.args[0]).toLowerCase();
    if (action === 'insert' || action === 'remove' || action === 'replace') {
      return [
        buildHeaderRule(cmd, baseExpr, isResponse, action as 'insert' | 'remove' | 'replace'),
      ];
    }
  }

  // pool <name>
  if (name === 'pool' && cmd.args.length >= 1) {
    return [buildPoolOrigin(cmd, baseExpr)];
  }

  // node <ip> <port>
  if (name === 'node' && cmd.args.length >= 1) {
    return [buildNodeOrigin(cmd, baseExpr)];
  }

  // HTTP::respond <code> [content "..."]
  if (name === 'http::respond') {
    return [buildHttpRespondSnippet(cmd, baseExpr, block)];
  }

  // Common command families that signal Snippet territory.
  const snippetTriggers = [
    'set',
    'log',
    'persist',
    'tcp::collect',
    'http::cookie',
    'http::respond',
    'string',
    'class',
    'session',
    'matchclass',
    'switch',
  ];
  if (snippetTriggers.some((t) => name.startsWith(t))) {
    return [buildCommandSnippet(cmd, baseExpr, block)];
  }

  // Unknown command — flag for review.
  return [buildCommandSnippet(cmd, baseExpr, block)];
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildRedirect(cmd: RawCommand, baseExpr: string): ConvertedRule {
  const targetRaw = argString(cmd.args[0]);
  const target = buildDynamicTarget(targetRaw);
  const expression = baseExpr || 'true';

  const notes = [];
  if (target.kind === 'expression') {
    notes.push({
      severity: 'info' as const,
      text: 'Redirect target contains a dynamic substitution. Cloudflare evaluates the `target_url` as a rules-language expression when `expression: true` is set in the action_parameters.',
    });
  }
  notes.push({
    severity: 'warn' as const,
    text: 'Default status code is 302. Change to 301 only if you have verified caching/SEO implications.',
  });

  return {
    type: 'Single Redirect',
    name: `Redirect to ${truncate(targetRaw, 48)}`,
    original: cmd.source,
    expression,
    guiSteps: buildDashboardSteps('Single Redirect', {
      expression,
      target: targetRaw,
      dynamic: target.kind === 'expression',
    }),
    apiCall: buildRedirectApiCall(expression, target),
    terraform: buildRedirectTerraform(expression, target),
    notes,
  };
}

function buildRewrite(cmd: RawCommand, baseExpr: string): ConvertedRule {
  const newUri = argString(cmd.args[0]);
  const target = buildDynamicTarget(newUri);
  const expression = baseExpr || 'true';

  return {
    type: 'URL Rewrite',
    name: `Rewrite URI → ${truncate(newUri, 48)}`,
    original: cmd.source,
    expression,
    guiSteps: buildDashboardSteps('URL Rewrite', { expression, target: newUri }),
    apiCall: buildRewriteApiCall(expression, target),
    terraform: buildRewriteTerraform(expression, target),
    notes:
      target.kind === 'expression'
        ? [
            {
              severity: 'info',
              text: 'New URI contains a dynamic substitution. Cloudflare emits this rewrite as a `path.expression` action_parameter so the runtime evaluates the concat() at request time.',
            },
          ]
        : [],
  };
}

function buildHeaderRule(
  cmd: RawCommand,
  baseExpr: string,
  isResponse: boolean,
  action: 'insert' | 'remove' | 'replace',
): ConvertedRule {
  const headerName = argString(cmd.args[1]);
  const value = cmd.args[2] ? argString(cmd.args[2]) : undefined;
  const expression = baseExpr || 'true';
  const ruleType = isResponse ? 'Response Header Transform' : 'Request Header Transform';

  return {
    type: ruleType,
    name:
      action === 'remove'
        ? `Remove header: ${headerName}`
        : `${action === 'insert' ? 'Add' : 'Replace'} header: ${headerName}`,
    original: cmd.source,
    expression,
    guiSteps: buildDashboardSteps(ruleType, {
      expression,
      headerName,
      value,
      action,
    }),
    apiCall: buildHeaderApiCall(expression, headerName, value, action, isResponse),
    terraform: buildHeaderTerraform(expression, headerName, value, action, isResponse),
    notes:
      action === 'replace'
        ? [
            {
              severity: 'info',
              text: 'F5 `HTTP::header replace` only sets the header when it already exists. Cloudflare Header Transform rules do not have a "set only if present" toggle — this is emitted as `set`. If you depend on the conditional behavior, scope the rule expression to require the header to be present.',
            },
          ]
        : [],
  };
}

function buildPoolOrigin(cmd: RawCommand, baseExpr: string): ConvertedRule {
  const pool = argString(cmd.args[0]);
  const expression = baseExpr || 'true';

  return {
    type: 'Origin Rule',
    name: `Route → pool "${pool}"`,
    original: cmd.source,
    expression,
    guiSteps: buildDashboardSteps('Origin Rule', {
      expression,
      poolOrHost: pool,
      kind: 'pool',
    }),
    apiCall: buildOriginApiCall(expression, pool),
    terraform: buildOriginTerraform(expression, pool),
    notes: [
      {
        severity: 'warn',
        text: `Pool "${pool}" is an F5 abstraction. Replace it with the actual origin hostname or IP and configure DNS / Origin Rules accordingly.`,
      },
    ],
  };
}

function buildNodeOrigin(cmd: RawCommand, baseExpr: string): ConvertedRule {
  const ip = argString(cmd.args[0]);
  const port = cmd.args[1] ? argString(cmd.args[1]) : '';
  const target = port ? `${ip}:${port}` : ip;
  const expression = baseExpr || 'true';

  return {
    type: 'Origin Rule',
    name: `Route → ${target}`,
    original: cmd.source,
    expression,
    guiSteps: buildDashboardSteps('Origin Rule', {
      expression,
      poolOrHost: target,
      kind: 'node',
    }),
    apiCall: buildOriginApiCall(expression, ip, port || undefined),
    terraform: buildOriginTerraform(expression, ip, port || undefined),
    notes: [
      {
        severity: 'warn',
        text: 'Direct IP routing requires DNS configuration on Cloudflare. Consider adding the origin as a proxied DNS record or using Cloudflare Tunnel for private origins.',
      },
    ],
  };
}

function buildHttpRespondSnippet(
  cmd: RawCommand,
  baseExpr: string,
  block: EventBlock,
): ConvertedRule {
  return {
    type: 'Snippet',
    name: 'Custom HTTP response',
    original: cmd.source,
    expression: baseExpr || 'true',
    guiSteps: buildDashboardSteps('Snippet'),
    apiCall: buildSnippetStarter(block.rawEvent, cmd.source),
    notes: [
      {
        severity: 'info',
        text: 'F5 `HTTP::respond` short-circuits with a custom payload. Implement this as a Snippet that returns a `Response`, or use a WAF Custom Rule with a custom error response page.',
      },
    ],
  };
}

function buildCommandSnippet(cmd: RawCommand, baseExpr: string, block: EventBlock): ConvertedRule {
  return {
    type: 'Snippet',
    name: `Unhandled command: ${cmd.name}`,
    original: cmd.source,
    expression: baseExpr || 'true',
    guiSteps: buildDashboardSteps('Snippet'),
    apiCall: buildSnippetStarter(block.rawEvent, cmd.source),
    notes: [
      {
        severity: 'warn',
        text: `Command "${cmd.name}" has no direct Cloudflare equivalent. Manual review is required — likely a Snippet or Worker is needed.`,
      },
    ],
  };
}

function buildStraySnippet(ast: ParsedScript): ConvertedRule {
  const stray = ast.stray.map((s) => ('source' in s ? s.source : '')).join('\n');
  return {
    type: 'Snippet',
    name: 'Top-level statements (outside `when` block)',
    original: stray,
    guiSteps: buildDashboardSteps('Snippet'),
    apiCall: buildSnippetStarter('UNKNOWN', stray),
    notes: [
      {
        severity: 'warn',
        text: 'Statements outside a `when` block typically live in `RULE_INIT` and run once. Migrate as a Snippet helper or move logic into a Worker.',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Condition translation
// ---------------------------------------------------------------------------

/**
 * Translate an iRule `if { ... }` condition body to a Cloudflare expression.
 *
 * Supports patterns like:
 *   - [HTTP::uri] starts_with "/api"
 *   - [HTTP::host] eq "www.example.com"
 *   - [HTTP::method] eq "POST"
 *   - [HTTP::header "X-Foo"] contains "bar"
 *   - not ( [HTTP::uri] starts_with "/x" )
 *   - cond1 && cond2 / cond1 and cond2
 *   - cond1 || cond2 / cond1 or cond2
 *
 * Anything we cannot parse is preserved verbatim as a Snippet comment.
 */
export function translateIRuleCondition(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  // Split on top-level && / || while respecting parens and brackets.
  const parts = splitLogical(cleaned);
  if (parts.length > 1) {
    if (parts.length === 2 && parts[1] === '__OR__') {
      // Should never happen due to splitLogical design; fall through.
    }
    // splitLogical returns alternating [expr, op, expr, op, expr, ...]
    let result = translateIRuleCondition(parts[0] ?? '');
    for (let i = 1; i < parts.length; i += 2) {
      const op = parts[i];
      const next = translateIRuleCondition(parts[i + 1] ?? '');
      const left = result;
      result = op === 'or' ? `(${left}) or (${next})` : `(${left}) and (${next})`;
    }
    return result;
  }

  // Strip a leading "not".
  let negate = false;
  let body = cleaned;
  const notMatch = /^!\s*(.+)$|^not\s+(.+)$/i.exec(body);
  if (notMatch) {
    negate = true;
    body = (notMatch[1] ?? notMatch[2] ?? '').trim();
  }
  // Strip surrounding parens.
  while (body.startsWith('(') && body.endsWith(')')) {
    body = body.slice(1, -1).trim();
  }
  if (!body) return '';

  // Try to match  [HTTP::field [arg]] OP "value"
  const m =
    /^\[\s*HTTP::(uri|path|host|method|query|header|cookie)(?:\s+"?([^"\]]+)"?)?\s*\]\s+([a-z_!]+)\s+"([^"]*)"$/i.exec(
      body,
    ) || /^\[\s*IP::(client_addr)\s*\]\s+([a-z_!]+)\s+"([^"]*)"$/i.exec(body);

  if (m) {
    if (m[0].startsWith('[IP::')) {
      const op = translateOp(m[2] ?? 'eq');
      const value = m[3] ?? '';
      const expr = buildCondition({
        field: 'client_ip',
        op: op.op,
        value,
        negate: op.negate || negate,
      });
      return expr;
    }
    const field = (m[1] ?? 'uri').toLowerCase() as IRuleField;
    const arg = m[2];
    const op = translateOp(m[3] ?? 'eq');
    const value = m[4] ?? '';
    const expr = buildCondition({
      field,
      fieldArg: arg,
      op: op.op,
      value,
      negate: op.negate || negate,
    });
    return expr;
  }

  // Bracketless: HTTP::uri starts_with "/api" (some iRules omit the brackets)
  const bracketless = /^HTTP::(uri|path|host|method|query)\s+([a-z_!]+)\s+"([^"]*)"$/i.exec(body);
  if (bracketless) {
    const field = (bracketless[1] ?? 'uri').toLowerCase() as IRuleField;
    const op = translateOp(bracketless[2] ?? 'eq');
    return buildCondition({
      field,
      op: op.op,
      value: bracketless[3] ?? '',
      negate: op.negate || negate,
    });
  }

  // [HTTP::header exists "X-Foo"] -> any() check
  const exists = /^\[\s*HTTP::header\s+exists\s+"([^"]+)"\s*\]$/i.exec(body);
  if (exists) {
    const expr = `len(http.request.headers["${(exists[1] ?? '').toLowerCase()}"]) gt 0`;
    return negate ? `not (${expr})` : expr;
  }

  // Could not parse — return a special marker so the caller knows.
  return `__unparsed_condition__("${cleaned.replace(/"/g, '\\"')}")`;
}

/** Split a condition body on top-level logical operators (&&, ||, and, or). */
function splitLogical(body: string): string[] {
  const tokens: string[] = [];
  let depthParen = 0;
  let depthBracket = 0;
  let inString = false;
  let buf = '';

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (inString) {
      buf += ch;
      if (ch === '"' && body[i - 1] !== '\\') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      buf += ch;
      continue;
    }
    if (ch === '(') depthParen++;
    if (ch === ')') depthParen--;
    if (ch === '[') depthBracket++;
    if (ch === ']') depthBracket--;

    if (depthParen === 0 && depthBracket === 0) {
      // && or ||
      if (ch === '&' && body[i + 1] === '&') {
        tokens.push(buf.trim(), 'and');
        buf = '';
        i++;
        continue;
      }
      if (ch === '|' && body[i + 1] === '|') {
        tokens.push(buf.trim(), 'or');
        buf = '';
        i++;
        continue;
      }
      // " and " / " or " (whitespace-bounded)
      if (ch === ' ') {
        const rest = body.substring(i + 1);
        if (/^and\s/i.test(rest)) {
          tokens.push(buf.trim(), 'and');
          buf = '';
          i += 3;
          continue;
        }
        if (/^or\s/i.test(rest)) {
          tokens.push(buf.trim(), 'or');
          buf = '';
          i += 2;
          continue;
        }
      }
    }
    buf += ch;
  }
  if (buf.trim()) tokens.push(buf.trim());
  return tokens;
}

// ---------------------------------------------------------------------------
// Misc utils
// ---------------------------------------------------------------------------

function argString(a: Arg | undefined): string {
  if (!a) return '';
  return a.value;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.substring(0, n - 1)}…`;
}

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

/** Marker emitted by translateIRuleCondition when it cannot parse a condition. */
export const UNPARSED_MARKER = '__unparsed_condition__';
