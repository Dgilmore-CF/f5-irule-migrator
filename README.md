# F5 → Cloudflare Migrator

A community-built migration assistant that converts **F5 BIG-IP iRules (TCL)**
and **F5 ASM (Application Security Manager) policy XML** into Cloudflare
Rules, WAF, Rate Limiting, Bot Management, IP Lists, and Snippets — with
dashboard steps, ready-to-run API calls, and Terraform output for each.

> ## ⚠️ Disclaimer
>
> **This tool is not affiliated with, endorsed by, sponsored by, or sanctioned
> by Cloudflare, Inc. or F5, Inc.** Trademarks belong to their respective
> owners.
>
> The tool applies pattern-matching heuristics. It does **not** guarantee
> functional equivalence with your F5 configuration, it does **not** connect
> to your Cloudflare account, and it does **not** replace security review or
> change management. **Review and test every generated rule** in a non-production
> environment before deploying it.
>
> The web UI requires you to read and accept this disclaimer before use.

---

## Features

- **iRule converter** — turns F5 BIG-IP TCL iRules into Cloudflare
  - Single Redirects
  - Transform Rules (URL Rewrite, Request/Response Header)
  - Origin Rules
  - Snippets (with starter templates for unsupported constructs)
- **ASM converter** — turns F5 ASM policy XML exports into Cloudflare
  - Managed Rulesets (Cloudflare Managed + OWASP Core)
  - WAF Custom Rules (URL allow/block lists, file types, methods, headers, geo, threat score)
  - IP Lists (allow + block, with `skip` action wiring)
  - Rate Limiting Rules (brute-force prevention)
  - Bot Management / Super Bot Fight Mode
  - Snippets (CSRF, session tracking, parameter validation, cookie signing)
  - Zero Trust guidance (Cloudflare Access for login enforcement; Cloudflare DLP for DataGuard)
- **Three output formats per rule**
  - Dashboard step-by-step instructions
  - API call (`curl` + JSON, ready to paste)
  - Terraform HCL (`cloudflare_ruleset`, `cloudflare_list`)
- **Coverage report** — per-conversion summary of auto-converted, needs-review, Snippet-required, and Zero Trust-gated counts.
- **Downloads** — Markdown, JSON, and Terraform exports of the full result.

## Supported F5 patterns

### iRule (HTTP_REQUEST / HTTP_RESPONSE)

| F5 iRule | Cloudflare target |
|---|---|
| `HTTP::redirect "…"` (with/without conditions, with `[HTTP::uri]` substitutions) | Single Redirect (`concat()` expression target) |
| `HTTP::uri "/new"` | Transform Rule (URL Rewrite) |
| `HTTP::header insert/remove/replace` (in `HTTP_REQUEST`) | Request Header Transform |
| `HTTP::header insert/remove/replace` (in `HTTP_RESPONSE`) | Response Header Transform |
| `pool name` / `node ip port` | Origin Rule (with manual host-header / DNS guidance) |
| `if {...} { ... } elseif { ... } else { ... }` | Composed CF rules-language expressions |
| `&&` / `\|\|` / `not` / `not_starts_with` etc. | `and` / `or` / `not (...)` |
| `[HTTP::header exists "X"]` | `len(http.request.headers["x"]) gt 0` |
| `HTTP::respond`, `set`, `log`, `persist`, `HTTP::cookie`, `string`, `class`, `session`, … | **Snippet** with starter template |
| `LB_SELECTED`, `CLIENT_ACCEPTED`, `SERVER_CONNECTED`, `RULE_INIT`, other events | **Snippet** |

### ASM policy XML

| F5 ASM section | Cloudflare target |
|---|---|
| Signatures / signature sets | Cloudflare Managed Ruleset + OWASP Core Ruleset (enabled via `http_request_firewall_managed` phase) |
| `<allowed_url>` (positive security) | WAF Custom Rule — block requests outside the allow set |
| `<disallowed_url>` | WAF Custom Rule — block matching paths |
| Allowed / disallowed `<file_types>` | WAF Custom Rule on `http.request.uri.path.extension` |
| `<allowed_methods>` | WAF Custom Rule on `http.request.method` |
| `<ip_exceptions>` (allow + block) | `cloudflare_list` (IP kind) + WAF Custom Rule (`ip.src in $list`); `allow` becomes a `skip` action |
| `<ip_intelligence>` | WAF Custom Rule on `cf.threat_score gt 30` |
| `<geolocation_enforcement>` | WAF Custom Rule on `ip.geoip.country` |
| `<bot_defense>` | Bot Management / Super Bot Fight Mode + WAF Custom Rule on `cf.bot_management.score` |
| `<brute_force_prevention>` | Rate Limiting Rule (`http_ratelimit` phase) |
| `<csrf_protection>` | Snippet (referer guard + HMAC double-submit cookie) + WAF Custom Rule helper |
| `<login_enforcement>` | Cloudflare Access self-hosted application (**requires Cloudflare Zero Trust**) |
| `<session_tracking>` | Snippet (HMAC-signed cookie) |
| `<data_guard>` (DLP) | Cloudflare DLP profiles + Gateway HTTP policies (**requires Cloudflare Zero Trust + DLP**) |
| `<headers>` (block list) | WAF Custom Rule |
| `<cookies>` (signed cookies) | Snippet (HMAC cookie signing) |
| `<parameters>` (input validation) | Snippet (request body inspection) |
| `<response_pages>` | Cloudflare Custom Error Responses |

## Limitations

- **Tcl is a full programming language.** Constructs we cannot translate (procedures, regex with backreferences, dynamic dispatch, `class`/`session` tables, `persist` policies) are flagged for Snippet/Worker migration with a starter template.
- **Body inspection.** Cloudflare's body-scan limits differ from F5. Parameter-validation rules that depend on deep request-body inspection should be ported to a Worker if the bodies exceed Snippet limits.
- **ASM signatures are not 1:1.** F5 attack signatures do not map directly to Cloudflare managed-rule IDs. We enable the equivalent managed rulesets and recommend tuning per-rule overrides during the migration.
- **Zero Trust features (Access, DLP, Bot Management)** require entitlement.
- **Binary `.plc` ASM exports are not supported.** Export as XML first.

## Quick start

```bash
# Install
npm install

# Run locally on http://localhost:8787
npm run dev

# Run tests
npm test

# Typecheck, lint, test together
npm run check

# Deploy
npm run deploy
```

## Architecture

```
src/
├─ worker.ts                # Cloudflare Worker entrypoint — routes + CSP + size caps
├─ ui/                      # Static UI (served via Workers Static Assets)
│  ├─ index.html            # Single-page app with mandatory disclaimer modal
│  ├─ styles.css            # Modern design system, light/dark
│  ├─ app.js                # Vanilla JS controller (no framework)
│  └─ logo.svg              # Custom F5 → CF migration glyph
├─ shared/
│  ├─ types.ts              # ConvertedRule, ConversionResult, CoverageStats
│  ├─ expression.ts         # CF rules-language expression builders
│  └─ escape.ts             # JSON / HCL / shell escaping helpers
├─ irule/
│  ├─ tokenizer.ts          # Minimal TCL-ish tokenizer
│  ├─ parser.ts             # AST builder (events, ifs, commands)
│  ├─ mapper.ts             # AST → ConvertedRule[]
│  └─ generators/
│     ├─ dashboard.ts       # Step-by-step dashboard instructions
│     └─ api.ts             # curl + Terraform generators
├─ asm/
│  ├─ policy.ts             # XML → typed PolicyModel (fast-xml-parser)
│  ├─ mapper.ts             # PolicyModel → ConvertedRule[]
│  └─ generators/
│     ├─ dashboard.ts
│     └─ api.ts
└─ test/                    # Vitest unit tests with fixtures
```

## API

The web UI is the primary surface, but the conversion endpoints are also
directly callable. Inputs are processed entirely in-memory; the worker is
stateless and does not retain payloads.

### `POST /api/convert/irule`

```bash
curl -X POST http://localhost:8787/api/convert/irule \
  -H "Content-Type: text/plain" \
  --data-binary @path/to/rules.tcl
```

### `POST /api/convert/asm`

```bash
curl -X POST http://localhost:8787/api/convert/asm \
  -H "Content-Type: application/xml" \
  --data-binary @path/to/asm-policy.xml
```

### `GET /api/version`

```json
{ "name": "cf-f5-migrator", "version": "2.0.0", "unofficial": true, ... }
```

### Response shape

```ts
{
  source: 'irule' | 'asm',
  generatedAt: string,
  results: ConvertedRule[],
  coverage: { converted, review, snippets, zeroTrust }
}
```

Body size cap: **5 MB**.

## Security notes

- Static UI responses carry a strict `Content-Security-Policy`, plus `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` headers.
- The worker enforces a 5 MB body cap on `POST` requests.
- The disclaimer acceptance is stored in `localStorage` and can be re-shown from the topbar.
- **Do not paste secrets** (API tokens, private keys, cookies, customer PII) into the tool — though it's stateless, it's a good habit.

## Resources

- [Cloudflare Rules](https://developers.cloudflare.com/rules/)
- [Cloudflare WAF](https://developers.cloudflare.com/waf/)
- [Cloudflare Rate Limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Cloudflare Snippets](https://developers.cloudflare.com/rules/snippets/)
- [Cloudflare Terraform provider](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs)
- [F5 iRules docs](https://clouddocs.f5.com/api/irules/)
- [F5 ASM policy XML schema (BIG-IP)](https://techdocs.f5.com/)

## License

MIT.

## Trademarks

F5 and BIG-IP are trademarks of F5, Inc. Cloudflare is a trademark of
Cloudflare, Inc. References in this project are nominative only.
