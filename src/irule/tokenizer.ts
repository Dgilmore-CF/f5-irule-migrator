/**
 * Minimal TCL-ish tokenizer for F5 iRules.
 *
 * F5 iRules are syntactically TCL. This tokenizer recognizes only the subset
 * we need to map to Cloudflare rules. It is intentionally permissive: an iRule
 * that fails to tokenize cleanly is still reported with whatever tokens were
 * produced so the mapper can degrade to a Snippet recommendation.
 */

export type TokenKind =
  | 'word' // bare identifier or keyword (e.g., `when`, `if`, `pool`)
  | 'string' // double-quoted string (may contain [substitutions] and $vars)
  | 'brace' // brace-quoted string `{ ... }` — preserved verbatim
  | 'lbrace' // `{`
  | 'rbrace' // `}`
  | 'newline' // unescaped newline (terminator)
  | 'semicolon' // `;` (also a terminator)
  | 'comment'; // `# ...`

export interface Token {
  kind: TokenKind;
  /** Raw token text (without surrounding quotes for string/brace tokens). */
  value: string;
  /** 1-indexed line number where the token began. */
  line: number;
}

/**
 * Tokenize the full input. Comments are kept so the mapper can attribute
 * source spans accurately; the parser ignores them.
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const len = input.length;

  const peek = (offset = 0): string => input[i + offset] ?? '';

  while (i < len) {
    const ch = peek();

    // Track newlines.
    if (ch === '\n') {
      tokens.push({ kind: 'newline', value: '\n', line });
      line++;
      i++;
      continue;
    }

    // Whitespace (line continuation supported via backslash-newline).
    if (ch === '\\' && peek(1) === '\n') {
      i += 2;
      line++;
      continue;
    }
    if (/[ \t\r]/.test(ch)) {
      i++;
      continue;
    }

    // Comments
    if (ch === '#') {
      const start = i;
      while (i < len && input[i] !== '\n') i++;
      tokens.push({ kind: 'comment', value: input.substring(start, i), line });
      continue;
    }

    // Semicolons act as terminators.
    if (ch === ';') {
      tokens.push({ kind: 'semicolon', value: ';', line });
      i++;
      continue;
    }

    // Braces.
    if (ch === '{') {
      // In TCL, `{ ... }` is "brace-quoted" — the contents are preserved verbatim.
      // We only treat the next `{` as opening a brace group when the previous
      // significant token expects a block (e.g., after `if`, `when`, `else`,
      // `elseif`, or after another `{ condition }`). To stay simple, we always
      // emit a single `lbrace` token but ALSO peek for the "brace-quoted string"
      // case when used as an argument to commands like `if { ... }`.
      // Decision: the parser handles brace groups; emit lbrace.
      tokens.push({ kind: 'lbrace', value: '{', line });
      i++;
      continue;
    }
    if (ch === '}') {
      tokens.push({ kind: 'rbrace', value: '}', line });
      i++;
      continue;
    }

    // Double-quoted string.
    if (ch === '"') {
      const startLine = line;
      let value = '';
      i++;
      while (i < len) {
        const c = input[i]!;
        if (c === '\\' && i + 1 < len) {
          // preserve escape sequence as-is so substitutions inside the literal survive
          value += c + input[i + 1];
          if (input[i + 1] === '\n') line++;
          i += 2;
          continue;
        }
        if (c === '"') {
          i++;
          break;
        }
        if (c === '\n') line++;
        value += c;
        i++;
      }
      tokens.push({ kind: 'string', value, line: startLine });
      continue;
    }

    // Bare word: identifier, command, operator, or `[cmd ...]` substitution
    // appearing in an expression (e.g., inside an `if { ... }` condition).
    if (/[A-Za-z_0-9!$:./*\-+=<>\\@[]/.test(ch)) {
      const start = i;
      while (i < len) {
        const c = input[i]!;
        if (
          c === ' ' ||
          c === '\t' ||
          c === '\n' ||
          c === '\r' ||
          c === '{' ||
          c === '}' ||
          c === ';' ||
          c === '"' ||
          c === '#'
        ) {
          break;
        }
        // Handle bracket-substitutions inside words like `https://[HTTP::host]/path`:
        // capture them verbatim so the mapper can later unwrap them.
        if (c === '[') {
          let depth = 1;
          i++;
          while (i < len && depth > 0) {
            if (input[i] === '[') depth++;
            else if (input[i] === ']') depth--;
            if (depth === 0) break;
            i++;
          }
          // include the closing `]`
          if (i < len) i++;
          continue;
        }
        i++;
      }
      const value = input.substring(start, i);
      if (value.length > 0) {
        tokens.push({ kind: 'word', value, line });
      }
      continue;
    }

    // Unknown char — skip to avoid infinite loops.
    i++;
  }

  return tokens;
}
