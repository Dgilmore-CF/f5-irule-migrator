/**
 * API call (curl) and Terraform generators for iRule conversion results.
 */

import { cfStringLiteral, hclString, jsonString, tfIdent } from '../../shared/escape.js';

type DynamicTarget = { kind: 'literal'; value: string } | { kind: 'expression'; value: string };

const ZONE_TOKEN = '{zone_id}';
const API_TOKEN = '{api_token}';

const curlHeader = (path: string): string =>
  `curl -X PUT "https://api.cloudflare.com/client/v4/zones/${ZONE_TOKEN}/rulesets/phases/${path}/entrypoint" \\
  -H "Authorization: Bearer ${API_TOKEN}" \\
  -H "Content-Type: application/json" \\
  --data '`;

const curlClose = "'";

// ---------------------------------------------------------------------------
// Redirects
// ---------------------------------------------------------------------------

export function buildRedirectApiCall(expression: string, target: DynamicTarget): string {
  const body =
    target.kind === 'literal'
      ? {
          rules: [
            {
              expression,
              action: 'redirect',
              action_parameters: {
                from_value: {
                  status_code: 302,
                  target_url: { value: target.value },
                  preserve_query_string: true,
                },
              },
            },
          ],
        }
      : {
          rules: [
            {
              expression,
              action: 'redirect',
              action_parameters: {
                from_value: {
                  status_code: 302,
                  target_url: { expression: target.value },
                  preserve_query_string: true,
                },
              },
            },
          ],
        };
  return curlHeader('http_request_dynamic_redirect') + JSON.stringify(body, null, 2) + curlClose;
}

export function buildRedirectTerraform(expression: string, target: DynamicTarget): string {
  const ident = tfIdent(`redirect_${shortHash(expression + ':' + target.value)}`);
  const targetBlock =
    target.kind === 'literal'
      ? `        target_url {
          value = "${hclString(target.value)}"
        }`
      : `        target_url {
          expression = "${hclString(target.value)}"
        }`;
  return `resource "cloudflare_ruleset" "${ident}" {
  zone_id = var.zone_id
  name    = "${ident}"
  kind    = "zone"
  phase   = "http_request_dynamic_redirect"

  rules {
    action     = "redirect"
    expression = "${hclString(expression)}"
    enabled    = true

    action_parameters {
      from_value {
        status_code           = 302
        preserve_query_string = true
${targetBlock}
      }
    }
  }
}`;
}

// ---------------------------------------------------------------------------
// URL Rewrites
// ---------------------------------------------------------------------------

export function buildRewriteApiCall(expression: string, target: DynamicTarget): string {
  const path = target.kind === 'literal' ? { value: target.value } : { expression: target.value };
  const body = {
    rules: [
      {
        expression,
        action: 'rewrite',
        action_parameters: {
          uri: { path },
        },
      },
    ],
  };
  return curlHeader('http_request_transform') + JSON.stringify(body, null, 2) + curlClose;
}

export function buildRewriteTerraform(expression: string, target: DynamicTarget): string {
  const ident = tfIdent(`rewrite_${shortHash(expression + ':' + target.value)}`);
  const pathBlock =
    target.kind === 'literal'
      ? `        path {
          value = "${hclString(target.value)}"
        }`
      : `        path {
          expression = "${hclString(target.value)}"
        }`;
  return `resource "cloudflare_ruleset" "${ident}" {
  zone_id = var.zone_id
  name    = "${ident}"
  kind    = "zone"
  phase   = "http_request_transform"

  rules {
    action     = "rewrite"
    expression = "${hclString(expression)}"
    enabled    = true

    action_parameters {
      uri {
${pathBlock}
      }
    }
  }
}`;
}

// ---------------------------------------------------------------------------
// Header transforms
// ---------------------------------------------------------------------------

export function buildHeaderApiCall(
  expression: string,
  headerName: string,
  value: string | undefined,
  action: 'insert' | 'remove' | 'replace',
  isResponse: boolean,
): string {
  const phase = isResponse ? 'http_response_headers_transform' : 'http_request_late_transform';
  const op = action === 'remove' ? 'remove' : 'set';
  const headers: Record<string, unknown> = {};
  if (op === 'remove') {
    headers[headerName] = { operation: 'remove' };
  } else {
    headers[headerName] = { operation: 'set', value: value ?? '' };
  }
  const body = {
    rules: [
      {
        expression,
        action: 'rewrite',
        action_parameters: { headers },
      },
    ],
  };
  return curlHeader(phase) + JSON.stringify(body, null, 2) + curlClose;
}

export function buildHeaderTerraform(
  expression: string,
  headerName: string,
  value: string | undefined,
  action: 'insert' | 'remove' | 'replace',
  isResponse: boolean,
): string {
  const phase = isResponse ? 'http_response_headers_transform' : 'http_request_late_transform';
  const ident = tfIdent(
    `${isResponse ? 'res' : 'req'}_header_${action}_${shortHash(headerName + ':' + expression)}`,
  );
  const op = action === 'remove' ? 'remove' : 'set';
  const headerBlock =
    op === 'remove'
      ? `        headers {
          name      = "${hclString(headerName)}"
          operation = "remove"
        }`
      : `        headers {
          name      = "${hclString(headerName)}"
          operation = "set"
          value     = "${hclString(value ?? '')}"
        }`;
  return `resource "cloudflare_ruleset" "${ident}" {
  zone_id = var.zone_id
  name    = "${ident}"
  kind    = "zone"
  phase   = "${phase}"

  rules {
    action     = "rewrite"
    expression = "${hclString(expression)}"
    enabled    = true

    action_parameters {
${headerBlock}
    }
  }
}`;
}

// ---------------------------------------------------------------------------
// Origin Rules
// ---------------------------------------------------------------------------

export function buildOriginApiCall(expression: string, hostOrPool: string, port?: string): string {
  const action_parameters: Record<string, unknown> = {
    host_header: hostOrPool,
    origin: { host: hostOrPool },
  };
  if (port) {
    action_parameters.origin = { host: hostOrPool, port: Number(port) };
  }
  const body = {
    rules: [
      {
        expression,
        action: 'route',
        action_parameters,
        description: 'Migrated from F5 iRule pool/node directive',
      },
    ],
  };
  return curlHeader('http_request_origin') + JSON.stringify(body, null, 2) + curlClose;
}

export function buildOriginTerraform(
  expression: string,
  hostOrPool: string,
  port?: string,
): string {
  const ident = tfIdent(`origin_${shortHash(expression + ':' + hostOrPool + ':' + (port ?? ''))}`);
  const portLine = port ? `\n          port = ${Number(port)}` : '';
  return `resource "cloudflare_ruleset" "${ident}" {
  zone_id = var.zone_id
  name    = "${ident}"
  kind    = "zone"
  phase   = "http_request_origin"

  rules {
    action     = "route"
    expression = "${hclString(expression)}"
    enabled    = true
    description = "Migrated from F5 pool/node"

    action_parameters {
      host_header = "${hclString(hostOrPool)}"
      origin {
        host = "${hclString(hostOrPool)}"${portLine}
      }
    }
  }
}`;
}

// ---------------------------------------------------------------------------
// Snippet starter
// ---------------------------------------------------------------------------

export function buildSnippetStarter(event: string, snippetSource: string): string {
  const comment = snippetSource
    .split('\n')
    .map((l) => `//   ${l}`)
    .join('\n');
  return `// Cloudflare Snippet — auto-generated starter
// Event: ${event}
// Original iRule source for reference:
${comment}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // TODO: port the iRule logic above. The runtime fields available are:
    //   url.pathname, url.search, url.searchParams
    //   request.headers (use request.headers.get('X-Foo'))
    //   request.method
    //   request.cf?.country, request.cf?.colo

    return fetch(request);
  },
};
`;
}

// Unused but exported to keep escape helpers reachable from tests if needed.
export const __helpers = { cfStringLiteral, jsonString };

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Tiny deterministic hash (FNV-1a 32-bit) for naming Terraform resources. */
function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0').substring(0, 8);
}
