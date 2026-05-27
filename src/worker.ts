/**
 * Cloudflare Worker entrypoint for the F5 → Cloudflare migrator.
 *
 * Routes:
 *   POST /api/convert/irule  — text/plain body, returns ConversionResult
 *   POST /api/convert/asm    — application/xml body, returns ConversionResult
 *   GET  /api/version        — returns version info
 *   GET  *                   — static asset (served from src/ui/ via Workers Assets)
 */

import { convertIRule } from './irule/mapper.js';
import { convertAsm } from './asm/mapper.js';
import type { ConversionResult } from './shared/types.js';

interface Env {
  ASSETS: Fetcher;
}

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB

const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  // CSP: allow Google Fonts + Cloudflare's auto-injected scripts:
  //  - static.cloudflareinsights.com (Web Analytics beacon)
  //  - Inline bootstrap (Email Obfuscation, JS Detections under Bot Fight Mode).
  //    There is no nonce we can sync with the CF edge injector, so 'unsafe-inline'
  //    is required.
  //  - /cdn-cgi/* is same-origin so script-src 'self' already covers it.
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
    "script-src-elem 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'self'",
    "base-uri 'self'",
    'upgrade-insecure-requests',
  ].join('; '),
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ---------------- API ROUTES ----------------
    if (url.pathname.startsWith('/api/')) {
      try {
        return withSecurityHeaders(await handleApi(request, url));
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        return jsonError(500, 'internal_error', err);
      }
    }

    // ---------------- STATIC ASSETS ----------------
    const assetResponse = await env.ASSETS.fetch(request);
    return withSecurityHeaders(assetResponse);
  },
};

async function handleApi(request: Request, url: URL): Promise<Response> {
  if (url.pathname === '/api/version' && request.method === 'GET') {
    return Response.json({
      name: 'cf-f5-migrator',
      version: '2.0.0',
      unofficial: true,
      generatedAt: new Date().toISOString(),
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': new URL(request.url).origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
      },
    });
  }

  if (request.method !== 'POST') {
    return jsonError(405, 'method_not_allowed', `Use POST for ${url.pathname}`);
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonError(413, 'payload_too_large', `Body exceeds ${MAX_BODY_BYTES} bytes.`);
  }

  const body = await readCappedText(request, MAX_BODY_BYTES);
  if (body === null) {
    return jsonError(413, 'payload_too_large', `Body exceeds ${MAX_BODY_BYTES} bytes.`);
  }

  let result: ConversionResult;
  if (url.pathname === '/api/convert/irule') {
    result = convertIRule(body);
  } else if (url.pathname === '/api/convert/asm') {
    result = convertAsm(body);
  } else {
    return jsonError(404, 'not_found', `No handler for ${url.pathname}`);
  }

  return Response.json(result, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function readCappedText(request: Request, cap: number): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > cap) return null;
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder('utf-8').decode(merged);
}

function jsonError(status: number, code: string, message: string): Response {
  return withSecurityHeaders(
    Response.json({ error: message, code }, { status, headers: { 'Cache-Control': 'no-store' } }),
  );
}

function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    headers.set(k, v);
  }
  // Force-disable browser/proxy caching for the app shell. This prevents
  // users from being stuck on a stale broken build after a deploy. The
  // Workers Assets layer still caches at the edge, so this only affects
  // downstream caches.
  const ct = (headers.get('Content-Type') ?? '').toLowerCase();
  if (
    ct.includes('text/html') ||
    ct.includes('text/javascript') ||
    ct.includes('application/javascript') ||
    ct.includes('text/css')
  ) {
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
