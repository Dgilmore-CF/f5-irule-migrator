import { describe, expect, it } from 'vitest';
import { parse } from '../../src/irule/parser.js';

describe('iRule parser', () => {
  it('extracts a single HTTP_REQUEST event block', () => {
    const ast = parse(`when HTTP_REQUEST { HTTP::redirect "https://example.com" }`);
    expect(ast.events).toHaveLength(1);
    expect(ast.events[0]!.event).toBe('HTTP_REQUEST');
    expect(ast.events[0]!.body[0]?.type).toBe('command');
  });

  it('parses multiple event blocks', () => {
    const ast = parse(`
      when HTTP_REQUEST { HTTP::header insert "X-Foo" "bar" }
      when HTTP_RESPONSE { HTTP::header remove "Server" }
    `);
    expect(ast.events).toHaveLength(2);
    expect(ast.events.map((e) => e.event)).toEqual(['HTTP_REQUEST', 'HTTP_RESPONSE']);
  });

  it('parses nested if/elseif/else', () => {
    const ast = parse(`
      when HTTP_REQUEST {
        if { [HTTP::uri] starts_with "/api" } {
          pool api_pool
        } elseif { [HTTP::uri] starts_with "/static" } {
          pool static_pool
        } else {
          pool default_pool
        }
      }
    `);
    const ifStmt = ast.events[0]!.body[0];
    expect(ifStmt?.type).toBe('if');
    if (ifStmt?.type !== 'if') return; // narrow
    expect(ifStmt.elseIfs).toHaveLength(1);
    expect(ifStmt.elseBranch).toHaveLength(1);
  });

  it('preserves brace-quoted condition contents', () => {
    const ast = parse(`when HTTP_REQUEST { if { [HTTP::uri] starts_with "/x" } { pool p } }`);
    const ifStmt = ast.events[0]!.body[0];
    expect(ifStmt?.type).toBe('if');
    if (ifStmt?.type !== 'if') return;
    expect(ifStmt.condition).toContain('HTTP::uri');
    expect(ifStmt.condition).toContain('starts_with');
    expect(ifStmt.condition).toContain('"/x"');
  });

  it('ignores comments', () => {
    const ast = parse(
      `# this is a comment\nwhen HTTP_REQUEST { # inline\n HTTP::redirect "https://x" }`,
    );
    expect(ast.events).toHaveLength(1);
  });

  it('captures unknown events under OTHER', () => {
    const ast = parse(`when SOMETHING_WEIRD { do stuff }`);
    expect(ast.events[0]?.event).toBe('OTHER');
  });

  it('captures stray top-level statements', () => {
    const ast = parse(`set foo "bar"\nwhen HTTP_REQUEST { pool p }`);
    expect(ast.stray.length).toBeGreaterThan(0);
  });
});
