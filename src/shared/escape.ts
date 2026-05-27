/**
 * Escaping helpers used when generating curl JSON bodies, HCL strings, and
 * Cloudflare rules-language literals.
 */

/** Escape a string for embedding inside a double-quoted JSON string. */
export function jsonString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/** Escape a string for embedding inside a CF rules-language double-quoted literal. */
export function cfStringLiteral(value: string): string {
  // CF rules language uses backslash escapes and supports the same set as JSON.
  return jsonString(value);
}

/** Escape a string for HCL double-quoted form. */
export function hclString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$\{/g, '$${')
    .replace(/%\{/g, '%%{');
}

/** Escape a string for safe shell embedding inside single quotes (`'...'`). */
export function shellSingleQuoted(value: string): string {
  return value.replace(/'/g, `'\\''`);
}

/**
 * Convert an arbitrary label into a Terraform-safe identifier.
 * Strips non-alphanumerics, prefixes leading digits, lower-cases.
 */
export function tfIdent(label: string): string {
  const cleaned = label
    .normalize('NFKD')
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  if (!cleaned) return 'rule';
  return /^[0-9]/.test(cleaned) ? `r_${cleaned}` : cleaned;
}
