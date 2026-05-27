/**
 * Dashboard step generators for ASM conversion results.
 */

interface AsmCtx {
  expression?: string;
  action?: string;
  enabledSets?: string[];
  mode?: 'transparent' | 'blocking';
  listName?: string;
  count?: number;
  kind?: 'block' | 'allow';
  threshold?: number;
  period?: number;
  loginPath?: string;
  paths?: string[];
  loginUrl?: string;
}

type AsmDashboardKind =
  | 'managed-ruleset'
  | 'waf-custom'
  | 'ip-list'
  | 'bot'
  | 'rate-limit'
  | 'csrf'
  | 'access'
  | 'snippet';

export function buildAsmDashboardSteps(kind: AsmDashboardKind, ctx: AsmCtx = {}): string[] {
  switch (kind) {
    case 'managed-ruleset':
      return [
        'Open <strong>Security</strong> → <strong>WAF</strong> → <strong>Managed rules</strong> for your zone.',
        'Toggle on <strong>Cloudflare Managed Ruleset</strong> and <strong>OWASP Core Ruleset</strong>.',
        ctx.mode === 'transparent'
          ? 'For each ruleset, set the default action to <strong>Log</strong> to mirror the F5 transparent mode.'
          : 'Leave default actions at <strong>Block</strong> for HIGH-severity rules; consider <strong>Managed Challenge</strong> for MEDIUM.',
        ctx.enabledSets?.length
          ? `Verify these F5 signature sets have equivalent coverage in CF managed rules: <code>${ctx.enabledSets.join('</code>, <code>')}</code>.`
          : 'Review the included rule list and disable any that produce false positives in your traffic.',
        'Configure OWASP sensitivity (PL1–PL4). Start at PL1 in production and increase after a tuning period.',
        'Click <strong>Save</strong>.',
      ];
    case 'waf-custom':
      return [
        'Open <strong>Security</strong> → <strong>WAF</strong> → <strong>Custom rules</strong>.',
        'Click <strong>Create rule</strong>.',
        `Set the expression: <code>${ctx.expression ?? ''}</code>.`,
        `Action: <strong>${ctx.action ?? 'block'}</strong>.`,
        'Click <strong>Deploy</strong>.',
      ];
    case 'ip-list':
      return [
        'Open <strong>Manage Account</strong> → <strong>Configurations</strong> → <strong>Lists</strong>.',
        `Create a new list named <code>${ctx.listName ?? ''}</code> of type <strong>IP address</strong>.`,
        `Bulk-import the ${ctx.count ?? '?'} ${ctx.kind === 'allow' ? 'allow-listed' : 'blocked'} IPs/CIDRs.`,
        ctx.kind === 'allow'
          ? 'Create a WAF Custom Rule with expression <code>ip.src in $' +
            (ctx.listName ?? '') +
            '</code> and action <strong>Skip</strong>; choose to skip "All remaining custom rules" and managed rulesets as needed.'
          : `Create a WAF Custom Rule with expression <code>ip.src in $${ctx.listName ?? ''}</code> and action <strong>${ctx.action ?? 'block'}</strong>.`,
        'Click <strong>Deploy</strong>.',
      ];
    case 'bot':
      return [
        'Open <strong>Security</strong> → <strong>Bots</strong>.',
        'If you have <strong>Bot Management</strong> entitled, enable it; otherwise enable <strong>Super Bot Fight Mode</strong>.',
        `Create a WAF Custom Rule on <code>cf.bot_management.score lt ${ctx.threshold ?? 30}</code> with action <strong>${ctx.mode === 'transparent' ? 'log' : 'managed_challenge'}</strong>.`,
        'Exclude verified bots with <code>not cf.bot_management.verified_bot</code>.',
      ];
    case 'rate-limit':
      return [
        'Open <strong>Security</strong> → <strong>WAF</strong> → <strong>Rate Limiting Rules</strong>.',
        'Click <strong>Create rule</strong>.',
        `Match expression: <code>http.request.method eq "POST" and http.request.uri.path eq "${ctx.loginPath ?? '/login'}"</code>.`,
        `Characteristics: <strong>IP address</strong>. Period: <strong>${ctx.period ?? 60}s</strong>. Threshold: <strong>${ctx.threshold ?? 5}</strong>.`,
        `Action: <strong>${ctx.action ?? 'managed_challenge'}</strong>. Mitigation timeout: 600s (10 minutes).`,
        'Click <strong>Deploy</strong>.',
      ];
    case 'csrf':
      return [
        'Phase 1: open <strong>Security</strong> → <strong>WAF</strong> → <strong>Custom rules</strong> and add a referer-guard rule with the expression below.',
        'Phase 2: deploy the Snippet (right-hand panel) to implement double-submit / HMAC token validation.',
        'Test against your real auth flow before enabling block action — referer headers are stripped or modified by many privacy tools.',
      ];
    case 'access':
      return [
        'Confirm <strong>Cloudflare Zero Trust</strong> is provisioned on your account.',
        'Open <strong>Zero Trust</strong> → <strong>Access</strong> → <strong>Applications</strong>.',
        `Create a <strong>Self-hosted application</strong>. Set the URL to your protected hostname; restrict the path(s) to: <code>${(ctx.paths ?? []).join('</code>, <code>')}</code>.`,
        'Add an <strong>Access policy</strong> requiring identity (e.g., emails ending in your org domain or group membership from your IdP).',
        ctx.loginUrl
          ? `If the F5 policy referenced a login URL (<code>${ctx.loginUrl}</code>), point Access&apos;s default identity provider login to your IdP.`
          : 'Configure your IdP integration in <strong>Settings</strong> → <strong>Authentication</strong>.',
      ];
    case 'snippet':
      return [
        'Open <strong>Rules</strong> → <strong>Snippets</strong>.',
        'Click <strong>Create Snippet</strong>, paste the starter from the right-hand panel.',
        'Replace placeholder secrets with values from Wrangler env vars / secrets.',
        'Define a trigger expression that scopes the Snippet to the right paths.',
        'Click <strong>Deploy</strong>.',
      ];
    default:
      return [];
  }
}

export function buildDlpDashboardSteps(patterns: string[]): string[] {
  return [
    'Confirm you have <strong>Cloudflare Zero Trust</strong> provisioned with DLP entitlement.',
    'Open <strong>Zero Trust</strong> → <strong>DLP</strong> → <strong>Profiles</strong>.',
    `Enable built-in detectors that match the F5 patterns: <code>${patterns.join('</code>, <code>')}</code>.`,
    'For F5 custom regex patterns, create matching DLP custom detectors.',
    'Open <strong>Zero Trust</strong> → <strong>Gateway</strong> → <strong>Firewall policies</strong> → <strong>HTTP</strong>.',
    'Create a policy with selector <strong>DLP Profile</strong> = your new profile and action <strong>Block</strong> (or Allow + Log to learn first).',
    '<em>Note:</em> Gateway HTTP DLP intercepts traffic from WARP-enrolled devices. To inspect server-bound traffic from the public internet, a Snippet/Worker that scans response bodies is required.',
  ];
}
