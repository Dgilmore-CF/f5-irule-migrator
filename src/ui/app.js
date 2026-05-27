// @ts-check
'use strict';
/**
 * Client-side controller for the F5 → Cloudflare migrator UI.
 *
 * Plain (non-module) ES2022 script. We do NOT use type="module" because
 * Cloudflare Rocket Loader (when enabled on the zone) can rewrite module
 * scripts in ways that prevent them from executing. The data-cfasync="false"
 * attribute on the <script> tag in index.html opts this file out of Rocket
 * Loader entirely.
 */

const BUILD_ID = '20260527f';
const DISCLAIMER_KEY = 'cf-f5-migrator:disclaimer-accepted:v2';
const MAX_INPUT_BYTES = 5 * 1024 * 1024; // 5 MB

// eslint-disable-next-line no-console
console.info('[cf-f5-migrator] app.js loaded · build', BUILD_ID);

// Mark a global so the disclaimer can detect whether app.js actually ran
// even if the boot handler never fires for some reason.
/** @type {any} */ (window).__migrator_app_loaded = true;

const SAMPLE_IRULE = `when HTTP_REQUEST {
    if { [HTTP::uri] starts_with "/old-path" } {
        HTTP::redirect "https://www.example.com/new-path"
    }
    if { [HTTP::uri] starts_with "/api/v1" } {
        HTTP::redirect "https://api.example.com/api/v2[HTTP::uri]"
    }
    HTTP::header insert "X-Forwarded-Proto" "https"
    HTTP::header remove "X-Internal-Token"
    if { [HTTP::uri] starts_with "/static" } {
        pool static_content_pool
    }
}

when HTTP_RESPONSE {
    HTTP::header insert "Strict-Transport-Security" "max-age=31536000; includeSubDomains"
    HTTP::header insert "X-Frame-Options" "SAMEORIGIN"
    HTTP::header remove "Server"
}`;

const SAMPLE_ASM = `<?xml version="1.0" encoding="UTF-8"?>
<policy>
  <name>example-asm-policy</name>
  <description>Sample ASM policy demonstrating common features.</description>
  <enforcement_mode>blocking</enforcement_mode>
  <application_language>utf-8</application_language>
  <signature_settings>
    <signature_set name="OWASP Top Ten" enabled="true"/>
    <signature_set name="High Accuracy Signatures" enabled="true"/>
    <signature id="200000001" enabled="true" action="block"/>
    <signature id="200001475" enabled="true" action="block"/>
  </signature_settings>
  <urls>
    <allowed_url>
      <protocol>https</protocol>
      <name>/api/*</name>
      <method>GET</method>
      <method>POST</method>
    </allowed_url>
    <disallowed_url>
      <name>/admin/internal/*</name>
    </disallowed_url>
  </urls>
  <file_types>
    <allowed_file_type>jpg</allowed_file_type>
    <allowed_file_type>png</allowed_file_type>
    <allowed_file_type>pdf</allowed_file_type>
    <disallowed_file_type>exe</disallowed_file_type>
    <disallowed_file_type>bat</disallowed_file_type>
  </file_types>
  <allowed_methods>
    <method>GET</method>
    <method>POST</method>
    <method>PUT</method>
    <method>DELETE</method>
  </allowed_methods>
  <ip_intelligence enabled="true">
    <category name="anonymous_proxy" action="block"/>
    <category name="tor_exit_nodes" action="block"/>
    <category name="scanners" action="block"/>
  </ip_intelligence>
  <geolocation_enforcement>
    <country code="CN" action="block"/>
    <country code="RU" action="block"/>
    <country code="KP" action="block"/>
  </geolocation_enforcement>
  <ip_exceptions>
    <ip cidr="203.0.113.0/24" action="allow"/>
    <ip cidr="198.51.100.42/32" action="block"/>
  </ip_exceptions>
  <bot_defense enabled="true">
    <mitigation_level>strict</mitigation_level>
  </bot_defense>
  <brute_force_prevention enabled="true">
    <login_url>/login</login_url>
    <max_failed_logins>5</max_failed_logins>
    <failed_login_interval>60</failed_login_interval>
  </brute_force_prevention>
  <csrf_protection enabled="true">
    <url>/account/*</url>
  </csrf_protection>
  <login_enforcement enabled="true">
    <authenticated_url>/account/*</authenticated_url>
    <login_url>/login</login_url>
  </login_enforcement>
  <session_tracking enabled="true">
    <track_by>session_cookie</track_by>
  </session_tracking>
  <data_guard enabled="true">
    <pattern name="credit_card"/>
    <pattern name="us_ssn"/>
  </data_guard>
  <response_pages>
    <response_page type="default">
      <body>Request blocked by policy</body>
    </response_page>
  </response_pages>
</policy>`;

// ---------------------------------------------------------------------------
// Disclaimer gate
// ---------------------------------------------------------------------------
function initDisclaimer() {
  const modal = document.getElementById('disclaimer-modal');
  const app = document.getElementById('app');
  const agree = /** @type {HTMLInputElement|null} */ (document.getElementById('disclaimer-agree'));
  const agreeLabel = /** @type {HTMLElement|null} */ (document.querySelector('.checkbox'));
  const accept = /** @type {HTMLButtonElement|null} */ (
    document.getElementById('disclaimer-accept')
  );
  const decline = document.getElementById('disclaimer-decline');
  const errorEl = /** @type {HTMLElement|null} */ (document.getElementById('disclaimer-error'));
  const show = document.getElementById('show-disclaimer-btn');

  if (!modal || !app || !agree || !accept || !decline || !errorEl || !show || !agreeLabel) {
    return;
  }

  const accepted = localStorage.getItem(DISCLAIMER_KEY) === 'true';

  function setLocked(locked) {
    if (locked) {
      accept.classList.add('is-locked');
      accept.setAttribute('aria-disabled', 'true');
    } else {
      accept.classList.remove('is-locked');
      accept.setAttribute('aria-disabled', 'false');
      errorEl.hidden = true;
      agreeLabel.classList.remove('is-attention');
    }
  }

  function openModal() {
    modal.hidden = false;
    app.hidden = true;
    agree.checked = false;
    setLocked(true);
    errorEl.hidden = true;
    agreeLabel.classList.remove('is-attention');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.hidden = true;
    app.hidden = false;
    document.body.style.overflow = '';
  }

  function flagMissingCheckbox() {
    errorEl.hidden = false;
    agreeLabel.classList.remove('is-attention');
    // Force a reflow so the animation restarts even on repeated clicks.
    void agreeLabel.offsetWidth;
    agreeLabel.classList.add('is-attention');
    agree.focus();
  }

  if (!accepted) {
    openModal();
  } else {
    closeModal();
  }

  // Sync the locked state on both 'change' (toggle) and 'input' (broader compat).
  const syncLocked = () => setLocked(!agree.checked);
  agree.addEventListener('change', syncLocked);
  agree.addEventListener('input', syncLocked);

  function handleAccept() {
    if (!agree.checked) {
      flagMissingCheckbox();
      return;
    }
    try {
      localStorage.setItem(DISCLAIMER_KEY, 'true');
    } catch {
      /* private mode — ignore */
    }
    closeModal();
  }

  function handleDecline() {
    document.body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Inter,sans-serif;text-align:center;padding:24px;color:#475569"><div><h1 style="font-size:28px;margin-bottom:12px;color:#0f172a">Acknowledgment required</h1><p style="max-width:480px">You must accept the disclaimer to use this tool. Close this tab to exit, or refresh to reread the notice.</p></div></div>';
  }

  accept.addEventListener('click', handleAccept);
  accept.addEventListener('pointerup', handleAccept);
  decline.addEventListener('click', handleDecline);

  // Belt-and-suspenders: document-level delegation in case the direct
  // listeners above are intercepted by anything (browser extension,
  // CF Bot Fight Mode iframe overlay, etc.). Stops at the modal so we
  // don't double-fire on normal page clicks.
  document.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement | null} */ (e.target);
    if (!target) return;
    if (target.closest('#disclaimer-accept')) {
      handleAccept();
    } else if (target.closest('#disclaimer-decline')) {
      handleDecline();
    }
  });

  show.addEventListener('click', openModal);

  // Esc cancels via decline-like flow (only when user has already accepted before)
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && accepted) {
      closeModal();
    }
  });
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
function showToast(message, opts = {}) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  if (opts.error) {
    toast.style.background = '#ef4444';
    toast.style.color = '#ffffff';
  } else {
    toast.style.background = '';
    toast.style.color = '';
  }
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toast.hidden = true;
  }, 3000);
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function initTabs() {
  /** @type {HTMLButtonElement[]} */
  const tabs = Array.from(document.querySelectorAll('.tab'));
  /** @type {HTMLElement[]} */
  const panels = Array.from(document.querySelectorAll('.panel'));

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => {
        t.classList.toggle('is-active', t === tab);
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
      panels.forEach((p) => {
        const match = p.id === `panel-${target}`;
        p.classList.toggle('is-active', match);
        p.hidden = !match;
      });
    });
  });
}

function activeMode() {
  const active = document.querySelector('.tab.is-active');
  return /** @type {'irule'|'asm'} */ (active?.getAttribute('data-tab') || 'irule');
}

// ---------------------------------------------------------------------------
// File handling
// ---------------------------------------------------------------------------
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i] || 'B'}`;
}

function initFileHandling() {
  ['irule', 'asm'].forEach((kind) => {
    const dz = document.querySelector(`.dropzone[data-target="${kind}"]`);
    const input = /** @type {HTMLInputElement|null} */ (document.getElementById(`file-${kind}`));
    const info = document.querySelector(`.file-info[data-info="${kind}"]`);
    const ta = /** @type {HTMLTextAreaElement|null} */ (
      document.getElementById(`textarea-${kind}`)
    );
    if (!dz || !input || !info || !ta) return;

    const pickBtn = dz.querySelector(`[data-action="pick-${kind}"]`);
    pickBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      input.click();
    });

    dz.addEventListener('click', () => input.click());
    dz.addEventListener('dragover', (e) => {
      e.preventDefault();
      dz.classList.add('is-dragover');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-dragover'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) loadFile(file, info, ta, input);
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) loadFile(file, info, ta, input);
    });
  });
}

function loadFile(file, info, ta, input) {
  if (file.size > MAX_INPUT_BYTES) {
    showToast(`File too large (${formatBytes(file.size)}). Limit is 5 MB.`, { error: true });
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = String(e.target?.result ?? '');
    ta.value = text;
    info.innerHTML = `<span>📎 ${escapeHtml(file.name)} · ${formatBytes(file.size)}</span>`;
    info.hidden = false;
  };
  reader.onerror = () => {
    showToast('Could not read that file.', { error: true });
  };
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// Convert
// ---------------------------------------------------------------------------
let lastResults = null;

async function convert() {
  const mode = activeMode();
  const ta = /** @type {HTMLTextAreaElement|null} */ (document.getElementById(`textarea-${mode}`));
  const btn = /** @type {HTMLButtonElement|null} */ (document.getElementById('convert-btn'));
  if (!ta || !btn) return;

  const content = ta.value.trim();
  if (!content) {
    showToast('Paste an iRule or ASM policy first.', { error: true });
    return;
  }
  if (new Blob([content]).size > MAX_INPUT_BYTES) {
    showToast('Input too large (5 MB max).', { error: true });
    return;
  }

  const originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Converting...`;

  try {
    const endpoint = mode === 'asm' ? '/api/convert/asm' : '/api/convert/irule';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': mode === 'asm' ? 'application/xml' : 'text/plain' },
      body: content,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const json = await res.json();
    lastResults = json;
    renderResults(json);
  } catch (e) {
    showToast(`Conversion failed: ${e.message}`, { error: true });
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function badgeFor(type) {
  const map = {
    'Single Redirect': 'redirect',
    'URL Rewrite': 'rewrite',
    'Request Header Transform': 'req-header',
    'Response Header Transform': 'res-header',
    'Origin Rule': 'origin',
    'WAF Custom Rule': 'waf',
    'Managed Ruleset': 'managed',
    'Rate Limiting': 'rate',
    'Bot Management': 'bot',
    Snippet: 'snippet',
    'IP List': 'waf',
    'Zero Trust (Gated)': 'gated',
  };
  return map[type] || 'redirect';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function renderResults(payload) {
  const wrap = document.getElementById('results-wrap');
  const container = document.getElementById('results');
  const summary = document.getElementById('coverage-summary');
  if (!wrap || !container || !summary) return;

  const items = payload.results || [];
  const cov = payload.coverage || {};

  summary.innerHTML = `
    <div class="coverage__stat">
      <div class="coverage__label">Total rules</div>
      <div class="coverage__value">${items.length}</div>
    </div>
    <div class="coverage__stat">
      <div class="coverage__label">Auto-converted</div>
      <div class="coverage__value coverage__value--ok">${cov.converted ?? items.length}</div>
    </div>
    <div class="coverage__stat">
      <div class="coverage__label">Needs review</div>
      <div class="coverage__value coverage__value--warn">${cov.review ?? 0}</div>
    </div>
    <div class="coverage__stat">
      <div class="coverage__label">Snippet required</div>
      <div class="coverage__value coverage__value--snippet">${cov.snippets ?? 0}</div>
    </div>
    <div class="coverage__stat">
      <div class="coverage__label">Zero Trust gated</div>
      <div class="coverage__value coverage__value--gated">${cov.zeroTrust ?? 0}</div>
    </div>
  `;

  if (items.length === 0) {
    container.innerHTML = `<div class="note note--warn">No convertible patterns detected. If the input is valid, consider a Snippet-based migration.</div>`;
  } else {
    container.innerHTML = items.map((r, i) => renderRule(r, i)).join('');
  }

  wrap.hidden = false;
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderRule(rule, index) {
  const badge = badgeFor(rule.type);
  const stepsHtml = (rule.guiSteps || []).map((s) => `<li>${s}</li>`).join('');
  const notes = (rule.notes || [])
    .map(
      (n) =>
        `<div class="note ${n.severity === 'gated' ? 'note--gated' : n.severity === 'warn' ? 'note--warn' : ''}">${escapeHtml(n.text)}</div>`,
    )
    .join('');

  const apiCallId = `api-${index}`;
  const tfId = `tf-${index}`;
  const exprId = `expr-${index}`;

  const tfBlock = rule.terraform
    ? `<div class="rule-card__section">
        <div class="rule-card__section-header">
          <span class="rule-card__section-title">Terraform</span>
          <button class="copy-btn" data-copy="${tfId}">Copy</button>
        </div>
        <pre class="code-block" id="${tfId}"><code>${escapeHtml(rule.terraform)}</code></pre>
      </div>`
    : '';

  const exprBlock = rule.expression
    ? `<div class="rule-card__section">
        <div class="rule-card__section-header">
          <span class="rule-card__section-title">Cloudflare expression</span>
          <button class="copy-btn" data-copy="${exprId}">Copy</button>
        </div>
        <pre class="code-block" id="${exprId}"><code>${escapeHtml(rule.expression)}</code></pre>
      </div>`
    : '';

  return `
    <article class="rule-card">
      <header class="rule-card__header">
        <div class="rule-card__left">
          <span class="badge badge--${badge}">${escapeHtml(rule.type)}</span>
          <span class="rule-card__name">${escapeHtml(rule.name)}</span>
        </div>
        <span class="rule-card__index">Rule #${index + 1}</span>
      </header>
      <div class="rule-card__body">
        ${
          rule.original
            ? `<div class="rule-card__section">
              <div class="rule-card__section-header">
                <span class="rule-card__section-title">Source</span>
              </div>
              <pre class="code-block"><code>${escapeHtml(rule.original)}</code></pre>
            </div>`
            : ''
        }
        ${
          stepsHtml
            ? `<div class="rule-card__section">
              <div class="rule-card__section-header">
                <span class="rule-card__section-title">Dashboard steps</span>
              </div>
              <ol class="steps">${stepsHtml}</ol>
            </div>`
            : ''
        }
        ${exprBlock}
        ${
          rule.apiCall
            ? `<div class="rule-card__section">
              <div class="rule-card__section-header">
                <span class="rule-card__section-title">API call</span>
                <button class="copy-btn" data-copy="${apiCallId}">Copy</button>
              </div>
              <pre class="code-block" id="${apiCallId}"><code>${escapeHtml(rule.apiCall)}</code></pre>
            </div>`
            : ''
        }
        ${tfBlock}
        ${notes}
      </div>
    </article>`;
}

// ---------------------------------------------------------------------------
// Copy + download
// ---------------------------------------------------------------------------
function initCopyDelegate() {
  document.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const btn = target.closest('.copy-btn');
    if (!btn) return;
    const id = btn.getAttribute('data-copy');
    if (!id) return;
    const block = document.getElementById(id);
    if (!block) return;
    const text = block.textContent || '';
    navigator.clipboard
      .writeText(text)
      .then(() => {
        btn.classList.add('is-copied');
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => {
          btn.classList.remove('is-copied');
          btn.textContent = prev || 'Copy';
        }, 1500);
      })
      .catch(() => {
        showToast('Clipboard write failed.', { error: true });
      });
  });
}

function initDownload() {
  const btn = document.getElementById('download-btn');
  const menu = document.querySelector('.dropdown__menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', () => {
    const open = !menu.hidden;
    menu.hidden = open;
    btn.setAttribute('aria-expanded', String(!open));
  });
  document.addEventListener('click', (e) => {
    if (
      !btn.contains(/** @type {Node} */ (e.target)) &&
      !menu.contains(/** @type {Node} */ (e.target))
    ) {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  menu.querySelectorAll('button[data-download]').forEach((b) => {
    b.addEventListener('click', () => {
      if (!lastResults) {
        showToast('No results yet.', { error: true });
        return;
      }
      const kind = b.getAttribute('data-download');
      const blob = buildDownload(kind, lastResults);
      if (!blob) return;
      const url = URL.createObjectURL(blob.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = blob.name;
      a.click();
      URL.revokeObjectURL(url);
      menu.hidden = true;
    });
  });
}

function buildDownload(kind, payload) {
  const mode = activeMode();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  if (kind === 'json') {
    return {
      name: `cf-f5-migrator-${mode}-${ts}.json`,
      data: new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    };
  }
  if (kind === 'terraform') {
    const tf = (payload.results || [])
      .map((r) => r.terraform)
      .filter(Boolean)
      .join('\n\n');
    return {
      name: `cf-f5-migrator-${mode}-${ts}.tf`,
      data: new Blob([tf || '# No Terraform output generated.\n'], { type: 'text/plain' }),
    };
  }
  if (kind === 'markdown') {
    return {
      name: `cf-f5-migrator-${mode}-${ts}.md`,
      data: new Blob([buildMarkdownReport(payload)], { type: 'text/markdown' }),
    };
  }
  return null;
}

function buildMarkdownReport(payload) {
  const cov = payload.coverage || {};
  const lines = [];
  lines.push(`# F5 → Cloudflare migration report`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`> **Unofficial tool.** Review and test every rule before deploying.`);
  lines.push('');
  lines.push('## Coverage');
  lines.push('');
  lines.push(`- Total rules: **${(payload.results || []).length}**`);
  lines.push(`- Auto-converted: **${cov.converted ?? 0}**`);
  lines.push(`- Needs review: **${cov.review ?? 0}**`);
  lines.push(`- Snippet required: **${cov.snippets ?? 0}**`);
  lines.push(`- Zero Trust gated: **${cov.zeroTrust ?? 0}**`);
  lines.push('');
  (payload.results || []).forEach((r, i) => {
    lines.push(`## ${i + 1}. ${r.type} — ${r.name}`);
    lines.push('');
    if (r.original) {
      lines.push('### Source');
      lines.push('```');
      lines.push(r.original);
      lines.push('```');
      lines.push('');
    }
    if (r.guiSteps?.length) {
      lines.push('### Dashboard steps');
      r.guiSteps.forEach((s) => lines.push(`1. ${s.replace(/<[^>]+>/g, '')}`));
      lines.push('');
    }
    if (r.expression) {
      lines.push('### Cloudflare expression');
      lines.push('```');
      lines.push(r.expression);
      lines.push('```');
      lines.push('');
    }
    if (r.apiCall) {
      lines.push('### API call');
      lines.push('```bash');
      lines.push(r.apiCall);
      lines.push('```');
      lines.push('');
    }
    if (r.terraform) {
      lines.push('### Terraform');
      lines.push('```hcl');
      lines.push(r.terraform);
      lines.push('```');
      lines.push('');
    }
    (r.notes || []).forEach((n) => lines.push(`> ${n.text}`));
    lines.push('');
  });
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Sample / clear
// ---------------------------------------------------------------------------
function initSamples() {
  document.getElementById('sample-btn')?.addEventListener('click', () => {
    const mode = activeMode();
    const ta = document.getElementById(`textarea-${mode}`);
    if (ta instanceof HTMLTextAreaElement) {
      ta.value = mode === 'asm' ? SAMPLE_ASM : SAMPLE_IRULE;
      showToast('Sample loaded.');
    }
  });
  document.getElementById('clear-btn')?.addEventListener('click', () => {
    document.querySelectorAll('textarea').forEach((t) => (t.value = ''));
    document.querySelectorAll('.file-info').forEach((el) => (el.hidden = true));
    const wrap = document.getElementById('results-wrap');
    if (wrap) wrap.hidden = true;
    lastResults = null;
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function boot() {
  // The inline bootstrap in index.html already wired up the disclaimer modal.
  // Only re-initialize if the inline copy never ran (e.g., CSP blocked it).
  if (!(/** @type {any} */ (window).__migrator_disclaimer_ready)) {
    initDisclaimer();
  }
  initTabs();
  initFileHandling();
  initCopyDelegate();
  initDownload();
  initSamples();
  document.getElementById('convert-btn')?.addEventListener('click', convert);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
