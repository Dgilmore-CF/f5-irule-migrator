# F5 iRule to Cloudflare Rules Converter

A Cloudflare Worker that provides a web UI for converting F5 BIG-IP iRules to Cloudflare Rules. The tool generates both GUI configuration instructions and API calls for programmatic rule creation.

## Features

- **File Upload**: Upload `.txt` or `.tcl` files exported from F5's "Export iRules" command
- **Manual Entry**: Paste iRules directly into a text area for conversion
- **Multiple Rule Types**: Converts to various Cloudflare rule types:
  - **Single Redirects** - For HTTP::redirect commands
  - **URL Rewrite Rules** - For HTTP::uri modifications
  - **Request Header Transform Rules** - For request header insert/remove/replace
  - **Response Header Transform Rules** - For response header modifications
  - **Origin Rules** - For pool/node routing decisions
  - **Snippets** - Suggested for complex iRule logic

## Supported iRule Patterns

| F5 iRule Pattern | Cloudflare Equivalent |
|------------------|----------------------|
| `HTTP::redirect` | Single Redirects |
| `HTTP::uri` | Transform Rules (URL Rewrite) |
| `HTTP::header insert` (request) | Request Header Transform |
| `HTTP::header remove` (request) | Request Header Transform |
| `HTTP::header replace` (request) | Request Header Transform |
| `HTTP::header insert` (response) | Response Header Transform |
| `HTTP::header remove` (response) | Response Header Transform |
| `pool` / `node` | Origin Rules |
| Complex logic | Cloudflare Snippets |

## Installation

```bash
# Clone the repository
cd cf-f5-migrator

# Install dependencies
npm install

# Run locally
npm run dev

# Deploy to Cloudflare
npm run deploy
```

## Usage

1. Open the web UI (locally at `http://localhost:8787`)
2. Choose either:
   - **Upload File**: Drag and drop or select your F5 iRules export file
   - **Manual Entry**: Paste your iRule(s) directly
3. Click **Convert to Cloudflare Rules**
4. Review the results showing:
   - Original iRule pattern
   - Cloudflare Dashboard configuration steps
   - API calls for programmatic creation
   - Cloudflare expression syntax

## API Usage

You can also use the conversion API directly:

```bash
curl -X POST http://localhost:8787/api/convert \
  -H "Content-Type: application/json" \
  -d '{
    "irules": "when HTTP_REQUEST {\n  if { [HTTP::uri] starts_with \"/api\" } {\n    HTTP::redirect \"https://api.example.com[HTTP::uri]\"\n  }\n}"
  }'
```

## Example iRule Input

```tcl
when HTTP_REQUEST {
    if { [HTTP::uri] starts_with "/api" } {
        HTTP::redirect "https://api.example.com[HTTP::uri]"
    }
    if { [HTTP::header exists "X-Legacy-Header"] } {
        HTTP::header remove "X-Legacy-Header"
    }
    HTTP::header insert "X-Forwarded-Proto" "https"
}

when HTTP_RESPONSE {
    HTTP::header insert "X-Frame-Options" "SAMEORIGIN"
    HTTP::header insert "X-Content-Type-Options" "nosniff"
}
```

## Output

For each detected pattern, the tool provides:

1. **Original iRule Pattern** - The matched F5 iRule code
2. **Cloudflare Dashboard Steps** - Step-by-step GUI configuration instructions
3. **API Call** - Ready-to-use `curl` command for the Cloudflare API
4. **Cloudflare Expression** - The filter expression in Cloudflare's syntax
5. **Notes** - Migration tips and considerations

## Limitations

- Complex Tcl logic (loops, procedures, variables) cannot be directly converted and will be flagged for Snippets migration
- Dynamic values in iRules may require manual adjustment
- Pool/node names need to be mapped to actual origin hostnames
- Some F5-specific features may not have direct Cloudflare equivalents

## Resources

- [Cloudflare Rules Documentation](https://developers.cloudflare.com/rules/)
- [Cloudflare Rulesets API](https://developers.cloudflare.com/api/resources/rulesets/)
- [Cloudflare Snippets](https://developers.cloudflare.com/rules/snippets/)
- [F5 iRules Documentation](https://clouddocs.f5.com/api/irules/)

## License

MIT
