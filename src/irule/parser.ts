/**
 * F5 iRule parser.
 *
 * Builds an AST from the tokens produced by {@link tokenize}. The AST is
 * deliberately coarse — we only model constructs that affect the mapping
 * to Cloudflare. Anything else is captured as a `RawCommand` so the mapper
 * can decide whether to flag it as a Snippet candidate.
 */

import type { Token } from './tokenizer.js';
import { tokenize } from './tokenizer.js';

export type Event =
  | 'HTTP_REQUEST'
  | 'HTTP_RESPONSE'
  | 'CLIENT_ACCEPTED'
  | 'LB_SELECTED'
  | 'SERVER_CONNECTED'
  | 'RULE_INIT'
  | 'OTHER';

export interface EventBlock {
  event: Event;
  rawEvent: string;
  body: Statement[];
  /** Verbatim source for traceability in the UI. */
  source: string;
  startLine: number;
}

export type Statement = IfStmt | RawCommand;

export interface IfStmt {
  type: 'if';
  /** The full brace-content of the `if` condition, e.g. `[HTTP::uri] starts_with "/api"`. */
  condition: string;
  then: Statement[];
  elseIfs: { condition: string; then: Statement[] }[];
  elseBranch?: Statement[];
  source: string;
  line: number;
}

export interface RawCommand {
  type: 'command';
  /** Command name, e.g. `HTTP::redirect`, `pool`, `node`, `HTTP::header`, `HTTP::uri`. */
  name: string;
  /** Subsequent argument tokens (strings keep their quote marks stripped). */
  args: Arg[];
  source: string;
  line: number;
}

export type Arg =
  | { kind: 'string'; value: string }
  | { kind: 'word'; value: string }
  | { kind: 'brace'; value: string };

export interface ParsedScript {
  events: EventBlock[];
  /** Statements found at the top level outside any `when` block (rare). */
  stray: Statement[];
}

export function parse(input: string): ParsedScript {
  const tokens = tokenize(input).filter((t) => t.kind !== 'comment');
  const parser = new Parser(tokens, input);
  return parser.parseScript();
}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly source: string,
  ) {}

  parseScript(): ParsedScript {
    const events: EventBlock[] = [];
    const stray: Statement[] = [];

    while (!this.atEnd()) {
      this.skipTerminators();
      if (this.atEnd()) break;
      const t = this.peek();
      if (!t) break;
      if (t.kind === 'word' && t.value === 'when') {
        const block = this.parseWhen();
        if (block) events.push(block);
      } else {
        const s = this.parseStatement();
        if (s) stray.push(s);
      }
    }

    return { events, stray };
  }

  private parseWhen(): EventBlock | null {
    const whenTok = this.expectWord('when');
    if (!whenTok) return null;
    const startLine = whenTok.line;
    const eventTok = this.advance();
    if (!eventTok || eventTok.kind !== 'word') return null;
    const rawEvent = eventTok.value;
    const event = normalizeEvent(rawEvent);

    // Skip optional priority modifiers like `priority 500`.
    while (!this.atEnd()) {
      const t = this.peek();
      if (!t) break;
      if (t.kind === 'lbrace') break;
      if (t.kind === 'newline' || t.kind === 'semicolon') {
        this.advance();
        continue;
      }
      this.advance();
    }

    const open = this.peek();
    if (!open || open.kind !== 'lbrace') return null;
    this.advance(); // consume `{`

    const body = this.parseStatementsUntilRbrace();

    const endTok = this.tokens[this.pos - 1];
    const startOffset = this.findSourceOffsetForLine(startLine);
    const endOffset = this.findSourceOffsetForLine((endTok?.line ?? startLine) + 1);
    const src = this.source.substring(startOffset, Math.min(endOffset, this.source.length)).trim();

    return {
      event,
      rawEvent,
      body,
      source: src,
      startLine,
    };
  }

  private parseStatementsUntilRbrace(): Statement[] {
    const stmts: Statement[] = [];
    while (!this.atEnd()) {
      this.skipTerminators();
      const t = this.peek();
      if (!t) break;
      if (t.kind === 'rbrace') {
        this.advance();
        return stmts;
      }
      const s = this.parseStatement();
      if (s) stmts.push(s);
    }
    return stmts;
  }

  private parseStatement(): Statement | null {
    const t = this.peek();
    if (!t) return null;
    if (t.kind === 'word' && t.value === 'if') {
      return this.parseIf();
    }
    if (t.kind === 'word') {
      return this.parseCommand();
    }
    // Skip unexpected tokens by advancing.
    this.advance();
    return null;
  }

  private parseIf(): IfStmt | null {
    const ifTok = this.expectWord('if');
    if (!ifTok) return null;
    const condition = this.readBraceGroup();
    const thenBlock = this.readBlock();
    const elseIfs: { condition: string; then: Statement[] }[] = [];
    let elseBranch: Statement[] | undefined;

    while (!this.atEnd()) {
      this.skipTerminators();
      const next = this.peek();
      if (!next || next.kind !== 'word') break;
      if (next.value === 'elseif') {
        this.advance();
        const cond = this.readBraceGroup();
        const block = this.readBlock();
        elseIfs.push({ condition: cond, then: block });
        continue;
      }
      if (next.value === 'else') {
        this.advance();
        elseBranch = this.readBlock();
        break;
      }
      break;
    }

    const src = this.source
      .substring(
        this.findSourceOffsetForLine(ifTok.line),
        this.findSourceOffsetForLine((this.tokens[this.pos - 1]?.line ?? ifTok.line) + 1),
      )
      .trim();

    return {
      type: 'if',
      condition,
      then: thenBlock,
      elseIfs,
      elseBranch,
      source: src,
      line: ifTok.line,
    };
  }

  private parseCommand(): RawCommand | null {
    const cmdTok = this.advance();
    if (!cmdTok || cmdTok.kind !== 'word') return null;
    const args: Arg[] = [];
    while (!this.atEnd()) {
      const t = this.peek();
      if (!t) break;
      if (t.kind === 'newline' || t.kind === 'semicolon' || t.kind === 'rbrace') break;
      this.advance();
      if (t.kind === 'string') args.push({ kind: 'string', value: t.value });
      else if (t.kind === 'word') args.push({ kind: 'word', value: t.value });
      else if (t.kind === 'lbrace') {
        // brace-quoted argument: gather until matching rbrace, depth-aware
        const brace = this.readBraceContentAlreadyOpened();
        args.push({ kind: 'brace', value: brace });
      }
    }
    const src = this.source
      .substring(
        this.findSourceOffsetForLine(cmdTok.line),
        this.findSourceOffsetForLine((this.tokens[this.pos - 1]?.line ?? cmdTok.line) + 1),
      )
      .trim();
    return {
      type: 'command',
      name: cmdTok.value,
      args,
      source: src,
      line: cmdTok.line,
    };
  }

  /** Read a `{ ... }` group and return its inner contents as a single string. */
  private readBraceGroup(): string {
    this.skipTerminators();
    const open = this.peek();
    if (!open || open.kind !== 'lbrace') return '';
    this.advance();
    return this.readBraceContentAlreadyOpened();
  }

  /** Caller has already consumed the opening `{`. Returns the inner text. */
  private readBraceContentAlreadyOpened(): string {
    let depth = 1;
    const parts: string[] = [];
    while (!this.atEnd()) {
      const t = this.advance();
      if (!t) break;
      if (t.kind === 'lbrace') {
        depth++;
        parts.push('{');
        continue;
      }
      if (t.kind === 'rbrace') {
        depth--;
        if (depth === 0) break;
        parts.push('}');
        continue;
      }
      if (t.kind === 'string') {
        parts.push(`"${t.value}"`);
        continue;
      }
      if (t.kind === 'newline') {
        parts.push(' ');
        continue;
      }
      parts.push(t.value);
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  /** Read a `{ ... }` block of statements. */
  private readBlock(): Statement[] {
    this.skipTerminators();
    const open = this.peek();
    if (!open || open.kind !== 'lbrace') return [];
    this.advance();
    return this.parseStatementsUntilRbrace();
  }

  // ---- low-level helpers ----------------------------------------------------

  private expectWord(value: string): Token | null {
    const t = this.peek();
    if (!t || t.kind !== 'word' || t.value !== value) return null;
    return this.advance();
  }

  private advance(): Token | null {
    return this.tokens[this.pos++] ?? null;
  }

  private peek(): Token | null {
    return this.tokens[this.pos] ?? null;
  }

  private atEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  private skipTerminators(): void {
    while (!this.atEnd()) {
      const t = this.peek();
      if (!t) return;
      if (t.kind === 'newline' || t.kind === 'semicolon') {
        this.advance();
        continue;
      }
      return;
    }
  }

  /** Find the byte offset in the source where a given line starts. */
  private findSourceOffsetForLine(line: number): number {
    if (line <= 1) return 0;
    let l = 1;
    for (let i = 0; i < this.source.length; i++) {
      if (l === line) return i;
      if (this.source[i] === '\n') l++;
    }
    return this.source.length;
  }
}

function normalizeEvent(raw: string): Event {
  const upper = raw.toUpperCase();
  switch (upper) {
    case 'HTTP_REQUEST':
    case 'HTTP_RESPONSE':
    case 'CLIENT_ACCEPTED':
    case 'LB_SELECTED':
    case 'SERVER_CONNECTED':
    case 'RULE_INIT':
      return upper;
    default:
      return 'OTHER';
  }
}
