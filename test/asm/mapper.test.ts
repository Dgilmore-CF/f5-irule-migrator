import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertAsm } from '../../src/asm/mapper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

describe('ASM mapper', () => {
  it('emits a Managed Ruleset rule for the signatures', () => {
    const r = convertAsm(fixture('kitchen-sink.xml'));
    const managed = r.results.filter((x) => x.type === 'Managed Ruleset');
    // Expect at least the policy-meta card and the managed-ruleset card.
    expect(managed.length).toBeGreaterThanOrEqual(1);
    expect(managed.some((m) => m.name.toLowerCase().includes('managed'))).toBe(true);
  });

  it('produces WAF custom rules for disallowed/allowed URLs and methods', () => {
    const r = convertAsm(fixture('kitchen-sink.xml'));
    const waf = r.results.filter((x) => x.type === 'WAF Custom Rule');
    const names = waf.map((w) => w.name);
    expect(names.some((n) => n.includes('disallowed URL'))).toBe(true);
    expect(names.some((n) => n.includes('allowed URL'))).toBe(true);
    expect(names.some((n) => n.includes('HTTP methods'))).toBe(true);
    expect(names.some((n) => n.includes('Geolocation'))).toBe(true);
  });

  it('emits IP Lists for allow + block IP exceptions', () => {
    const r = convertAsm(fixture('kitchen-sink.xml'));
    const lists = r.results.filter((x) => x.type === 'IP List');
    expect(lists).toHaveLength(2);
    expect(lists.some((l) => l.name.toLowerCase().includes('block'))).toBe(true);
    expect(lists.some((l) => l.name.toLowerCase().includes('allow'))).toBe(true);
  });

  it('emits a Bot Management rule with appropriate threshold', () => {
    const r = convertAsm(fixture('kitchen-sink.xml'));
    const bot = r.results.find((x) => x.type === 'Bot Management');
    expect(bot).toBeDefined();
    // mitigation_level=strict -> threshold 30
    expect(bot?.expression).toContain('cf.bot_management.score lt 30');
    expect(bot?.notes?.some((n) => n.severity === 'gated')).toBe(true);
  });

  it('emits a Rate Limiting rule for brute-force prevention', () => {
    const r = convertAsm(fixture('kitchen-sink.xml'));
    const rl = r.results.find((x) => x.type === 'Rate Limiting');
    expect(rl).toBeDefined();
    expect(rl?.expression).toContain('/login');
    expect(rl?.apiCall).toContain('requests_per_period');
  });

  it('emits Snippets for CSRF and session tracking', () => {
    const r = convertAsm(fixture('kitchen-sink.xml'));
    const snippets = r.results.filter((x) => x.type === 'Snippet');
    expect(snippets.some((s) => s.name.toLowerCase().includes('csrf'))).toBe(true);
    expect(snippets.some((s) => s.name.toLowerCase().includes('session'))).toBe(true);
  });

  it('emits Zero Trust gated rules for login enforcement + DLP', () => {
    const r = convertAsm(fixture('kitchen-sink.xml'));
    const zt = r.results.filter((x) => x.type === 'Zero Trust (Gated)');
    expect(zt.some((z) => z.name.toLowerCase().includes('login'))).toBe(true);
    expect(zt.some((z) => z.name.toLowerCase().includes('dlp'))).toBe(true);
    expect(zt.every((z) => z.notes?.some((n) => n.severity === 'gated'))).toBe(true);
  });

  it('downgrades WAF actions to "log" in transparent mode', () => {
    const r = convertAsm(fixture('transparent.xml'));
    const waf = r.results.filter((x) => x.type === 'WAF Custom Rule');
    expect(waf.length).toBeGreaterThan(0);
    for (const w of waf) {
      expect(w.apiCall ?? '').not.toContain('"action": "block"');
      expect(w.apiCall ?? '').toContain('"action": "log"');
    }
  });

  it('produces valid JSON in every curl payload', () => {
    const r = convertAsm(fixture('kitchen-sink.xml'));
    for (const result of r.results) {
      if (!result.apiCall) continue;
      // Extract every JSON document inside --data '...' blocks
      const matches = result.apiCall.matchAll(/--data\s+'([\s\S]+?)'(?=\n|$)/g);
      for (const m of matches) {
        const payload = m[1];
        expect(payload).toBeDefined();
        try {
          JSON.parse(payload!);
        } catch (e) {
          throw new Error(`Invalid JSON in ${result.type} (${result.name}): ${e}\n${payload}`);
        }
      }
    }
  });

  it('emits Terraform that includes the required resource boilerplate', () => {
    const r = convertAsm(fixture('kitchen-sink.xml'));
    const tf = r.results.find((x) => x.terraform);
    expect(tf?.terraform).toContain('resource "cloudflare_ruleset"');
    expect(tf?.terraform).toContain('zone_id = var.zone_id');
  });

  it('computes coverage with non-zero converted, snippets, and zeroTrust counts', () => {
    const r = convertAsm(fixture('kitchen-sink.xml'));
    expect(r.coverage.converted).toBeGreaterThan(0);
    expect(r.coverage.snippets).toBeGreaterThan(0);
    expect(r.coverage.zeroTrust).toBeGreaterThan(0);
  });
});
