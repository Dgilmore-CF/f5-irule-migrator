/**
 * Shared types used across iRule and ASM converters.
 *
 * The {@link ConvertedRule} shape is what the UI consumes.
 */

/** High-level category of Cloudflare resource a converted rule maps to. */
export type RuleType =
  | 'Single Redirect'
  | 'URL Rewrite'
  | 'Request Header Transform'
  | 'Response Header Transform'
  | 'Origin Rule'
  | 'WAF Custom Rule'
  | 'Managed Ruleset'
  | 'Rate Limiting'
  | 'Bot Management'
  | 'IP List'
  | 'Snippet'
  | 'Zero Trust (Gated)';

export type NoteSeverity = 'info' | 'warn' | 'gated';

export interface RuleNote {
  severity: NoteSeverity;
  text: string;
}

/**
 * A single converted rule shown in the UI. All fields except `type` and `name`
 * are optional — different rule kinds populate different fields.
 */
export interface ConvertedRule {
  type: RuleType;
  /** Short human-readable label shown in the results header. */
  name: string;
  /** Source snippet (iRule line or ASM excerpt) for traceability. */
  original?: string;
  /** Step-by-step instructions for the Cloudflare dashboard. Allows simple HTML tags. */
  guiSteps?: string[];
  /** Cloudflare rules-language expression, if applicable. */
  expression?: string;
  /** Shell-ready curl command targeting the Cloudflare API. */
  apiCall?: string;
  /** Terraform HCL block, if applicable. */
  terraform?: string;
  /** Migration notes shown as callouts. */
  notes?: RuleNote[];
}

export interface CoverageStats {
  /** Auto-converted to a declarative Cloudflare feature. */
  converted: number;
  /** Converted but flagged for human review (e.g., placeholder values). */
  review: number;
  /** Required a Snippet because no declarative equivalent exists. */
  snippets: number;
  /** Required Cloudflare Zero Trust (Access / DLP / Bot Management) — gated by entitlement. */
  zeroTrust: number;
}

export interface ConversionResult {
  source: 'irule' | 'asm';
  generatedAt: string;
  results: ConvertedRule[];
  coverage: CoverageStats;
}

/** Cloudflare ruleset phases relevant to this tool. */
export type CloudflarePhase =
  | 'http_request_dynamic_redirect'
  | 'http_request_transform'
  | 'http_request_late_transform'
  | 'http_response_headers_transform'
  | 'http_request_origin'
  | 'http_request_firewall_custom'
  | 'http_request_firewall_managed'
  | 'http_ratelimit'
  | 'http_request_sbfm'
  | 'http_request_redirect';
