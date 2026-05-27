/**
 * Human-readable dashboard step generators for iRule conversion results.
 */

import type { RuleType } from '../../shared/types.js';

interface DashboardContext {
  expression?: string;
  target?: string;
  dynamic?: boolean;
  headerName?: string;
  value?: string;
  action?: 'insert' | 'remove' | 'replace';
  poolOrHost?: string;
  kind?: 'pool' | 'node';
}

/** Generate step-by-step Cloudflare dashboard instructions for a rule type. */
export function buildDashboardSteps(type: RuleType, ctx: DashboardContext = {}): string[] {
  switch (type) {
    case 'Single Redirect':
      return [
        'Open <strong>Rules</strong> → <strong>Redirect Rules</strong> for your zone.',
        'Click <strong>Create rule</strong>.',
        `Set <strong>If incoming requests match</strong> to <code>${ctx.expression ?? 'true'}</code>.`,
        ctx.dynamic
          ? `Select <strong>Dynamic</strong> for the destination, paste the expression <code>${ctx.target ?? ''}</code>.`
          : `Select <strong>Static URL</strong> and enter <code>${ctx.target ?? ''}</code>.`,
        'Choose status code <strong>302</strong> (preferred during migrations) or <strong>301</strong> only after validation.',
        'Click <strong>Save and Deploy</strong>.',
      ];
    case 'URL Rewrite':
      return [
        'Open <strong>Rules</strong> → <strong>Transform Rules</strong> → <strong>Rewrite URL</strong>.',
        'Click <strong>Create rule</strong>.',
        `Set the expression to <code>${ctx.expression ?? 'true'}</code>.`,
        `Under <strong>Then…</strong>, set <strong>Path</strong> to <code>${ctx.target ?? ''}</code>.`,
        'Click <strong>Save and Deploy</strong>.',
      ];
    case 'Request Header Transform':
      return [
        'Open <strong>Rules</strong> → <strong>Transform Rules</strong> → <strong>Modify Request Header</strong>.',
        'Click <strong>Create rule</strong>.',
        `Set the expression to <code>${ctx.expression ?? 'true'}</code>.`,
        ctx.action === 'remove'
          ? `Action: <strong>Remove</strong>. Header name: <code>${ctx.headerName ?? ''}</code>.`
          : `Action: <strong>Set static</strong>. Header name: <code>${ctx.headerName ?? ''}</code>. Value: <code>${ctx.value ?? ''}</code>.`,
        'Click <strong>Save and Deploy</strong>.',
      ];
    case 'Response Header Transform':
      return [
        'Open <strong>Rules</strong> → <strong>Transform Rules</strong> → <strong>Modify Response Header</strong>.',
        'Click <strong>Create rule</strong>.',
        `Set the expression to <code>${ctx.expression ?? 'true'}</code>.`,
        ctx.action === 'remove'
          ? `Action: <strong>Remove</strong>. Header name: <code>${ctx.headerName ?? ''}</code>.`
          : `Action: <strong>Set static</strong>. Header name: <code>${ctx.headerName ?? ''}</code>. Value: <code>${ctx.value ?? ''}</code>.`,
        'Click <strong>Save and Deploy</strong>.',
      ];
    case 'Origin Rule':
      return [
        'Open <strong>Rules</strong> → <strong>Origin Rules</strong>.',
        'Click <strong>Create rule</strong>.',
        `Set the expression to <code>${ctx.expression ?? 'true'}</code>.`,
        ctx.kind === 'pool'
          ? `Set the <strong>Host Header</strong> to the origin hostname that backs pool <code>${ctx.poolOrHost ?? ''}</code>, and add a <strong>DNS Override</strong> if needed.`
          : `Configure <strong>DNS Override</strong> for <code>${ctx.poolOrHost ?? ''}</code> and (if applicable) <strong>Destination Port</strong>.`,
        'Click <strong>Save and Deploy</strong>.',
        '<em>Note:</em> F5 pools/nodes do not exist in Cloudflare — Origin Rules + DNS records are the equivalent surface.',
      ];
    case 'Snippet':
      return [
        'Open <strong>Rules</strong> → <strong>Snippets</strong>.',
        'Click <strong>Create Snippet</strong>.',
        'Paste the starter template (right-hand panel) and adapt the logic to your needs.',
        'Define a trigger expression that scopes the Snippet to the right traffic.',
        'Click <strong>Save and Deploy</strong>.',
        '<em>If the original iRule logic is non-trivial, consider promoting it to a Worker for richer tooling and testing.</em>',
      ];
    case 'WAF Custom Rule':
      return [
        'Open <strong>Security</strong> → <strong>WAF</strong> → <strong>Custom rules</strong>.',
        'Click <strong>Create rule</strong>.',
        `Set the expression to <code>${ctx.expression ?? 'true'}</code>.`,
        'Choose an action (Block, Managed Challenge, JS Challenge, Log).',
        'Click <strong>Deploy</strong>.',
      ];
    case 'Managed Ruleset':
      return [
        'Open <strong>Security</strong> → <strong>WAF</strong> → <strong>Managed rules</strong>.',
        'Enable <strong>Cloudflare Managed Ruleset</strong> and <strong>OWASP Core Ruleset</strong>.',
        'Tune individual rule overrides (action / paranoia) to match your previous F5 signature behavior.',
        'Use <strong>Sensitivity</strong> in the OWASP ruleset to balance false positives.',
      ];
    case 'Rate Limiting':
      return [
        'Open <strong>Security</strong> → <strong>WAF</strong> → <strong>Rate Limiting Rules</strong>.',
        'Click <strong>Create rule</strong>.',
        `Set the expression to <code>${ctx.expression ?? 'true'}</code>.`,
        'Set characteristics (IP address, IP + path, IP + JA3, etc.) and period/threshold.',
        'Choose Action: Block, Managed Challenge, or Log.',
      ];
    case 'Bot Management':
      return [
        'Open <strong>Security</strong> → <strong>Bots</strong>.',
        'Enable <strong>Bot Management</strong> (requires entitlement) or <strong>Super Bot Fight Mode</strong>.',
        'Create a Custom Rule on <code>cf.bot_management.score lt 30</code> to block low-score traffic.',
        '<em>Note: requires an enterprise/business plan or appropriate add-on.</em>',
      ];
    case 'IP List':
      return [
        'Open <strong>Manage Account</strong> → <strong>Configurations</strong> → <strong>Lists</strong>.',
        'Click <strong>Create new list</strong>; choose type <strong>IP address</strong>.',
        'Bulk import the IPs/CIDRs.',
        'Reference the list in a WAF Custom Rule via <code>ip.src in $&lt;list_name&gt;</code>.',
      ];
    case 'Zero Trust (Gated)':
      return [
        'Confirm you have a <strong>Cloudflare Zero Trust</strong> plan with the relevant entitlement (Access, DLP, or Bot Management).',
        'Follow the linked documentation in the notes section to configure the equivalent policy.',
        'After enabling the Zero Trust feature, validate end-to-end before retiring the F5 configuration.',
      ];
    default:
      return [];
  }
}
