const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>F5 iRule to Cloudflare Rules Converter</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <style>
    :root{--cf-orange:#F6821F;--cf-orange-dark:#E06E0D;--cf-gray-50:#F9FAFB;--cf-gray-100:#F2F4F8;--cf-gray-200:#E5E9F0;--cf-gray-300:#D1D5DB;--cf-gray-400:#9CA3AF;--cf-gray-500:#6B7280;--cf-gray-600:#4B5563;--cf-gray-700:#374151;--cf-gray-800:#1F2937;--cf-gray-900:#111827}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;background:linear-gradient(180deg,#FAFBFC 0%,#F2F4F8 100%);min-height:100vh;color:var(--cf-gray-800);line-height:1.6}
    .container{max-width:1200px;margin:0 auto;padding:0 24px}
    .header{background:linear-gradient(135deg,var(--cf-gray-900) 0%,#1a1a2e 100%);padding:48px 0;margin-bottom:48px}
    .header-content{text-align:center}
    .logo-icon{margin-bottom:20px}
    .logo-icon svg{filter:drop-shadow(0 4px 12px rgba(246,130,31,0.3))}
    .header h1{color:#fff;font-size:32px;font-weight:700;letter-spacing:-0.5px;margin-bottom:12px}
    .header p{color:var(--cf-gray-400);font-size:16px;max-width:600px;margin-left:auto;margin-right:auto}
    .badge{display:inline-flex;align-items:center;gap:6px;background:rgba(246,130,31,0.15);color:var(--cf-orange);padding:6px 12px;border-radius:20px;font-size:13px;font-weight:500;margin-top:16px}
    .main{padding-bottom:64px}
    .card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08),0 4px 12px rgba(0,0,0,0.04);border:1px solid var(--cf-gray-200);overflow:hidden;margin-bottom:32px}
    .tabs{display:flex;border-bottom:1px solid var(--cf-gray-200);background:var(--cf-gray-50)}
    .tab{padding:16px 24px;font-size:14px;font-weight:500;color:var(--cf-gray-500);background:transparent;border:none;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all 0.2s ease}
    .tab:hover{color:var(--cf-gray-700);background:var(--cf-gray-100)}
    .tab.active{color:var(--cf-orange);border-bottom-color:var(--cf-orange);background:#fff}
    .tab svg{width:18px;height:18px}
    .tab-content{padding:32px;display:none}
    .tab-content.active{display:block}
    .upload-zone{border:2px dashed var(--cf-gray-300);border-radius:12px;padding:48px;text-align:center;transition:all 0.2s ease;background:var(--cf-gray-50)}
    .upload-zone:hover,.upload-zone.dragover{border-color:var(--cf-orange);background:rgba(246,130,31,0.04)}
    .upload-icon{width:64px;height:64px;margin:0 auto 16px;color:var(--cf-gray-400)}
    .upload-zone h3{font-size:16px;font-weight:600;color:var(--cf-gray-700);margin-bottom:8px}
    .upload-zone p{font-size:14px;color:var(--cf-gray-500);margin-bottom:16px}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 24px;font-size:14px;font-weight:600;border-radius:8px;border:none;cursor:pointer;transition:all 0.2s ease;font-family:inherit}
    .btn-primary{background:var(--cf-orange);color:#fff;box-shadow:0 1px 2px rgba(246,130,31,0.2)}
    .btn-primary:hover{background:var(--cf-orange-dark);transform:translateY(-1px);box-shadow:0 4px 12px rgba(246,130,31,0.3)}
    .btn-primary:disabled{opacity:0.7;cursor:not-allowed;transform:none}
    .btn-lg{padding:16px 32px;font-size:16px}
    .file-info{display:none;align-items:center;gap:12px;margin-top:16px;padding:12px 16px;background:#ECFDF5;border-radius:8px;color:#059669;font-size:14px;font-weight:500}
    .file-info.show{display:flex}
    .file-info svg{width:20px;height:20px;flex-shrink:0}
    .textarea-wrapper label{display:block;font-size:14px;font-weight:500;color:var(--cf-gray-700);margin-bottom:8px}
    textarea{width:100%;min-height:320px;padding:16px;font-family:'SF Mono',Monaco,monospace;font-size:13px;line-height:1.6;border:1px solid var(--cf-gray-300);border-radius:8px;background:var(--cf-gray-50);color:var(--cf-gray-800);resize:vertical;transition:all 0.2s ease}
    textarea:focus{outline:none;border-color:var(--cf-orange);box-shadow:0 0 0 3px rgba(246,130,31,0.15);background:#fff}
    textarea::placeholder{color:var(--cf-gray-400)}
    .textarea-hint{font-size:13px;color:var(--cf-gray-500);margin-top:8px}
    .convert-section{text-align:center;margin:32px 0}
    .results-section{display:none}
    .results-section.show{display:block}
    .results-header{display:flex;align-items:center;gap:12px;margin-bottom:24px}
    .results-header h2{font-size:20px;font-weight:600;color:var(--cf-gray-800)}
    .results-count{background:var(--cf-orange);color:#fff;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600}
    .rule-card{background:#fff;border:1px solid var(--cf-gray-200);border-radius:12px;overflow:hidden;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,0.04)}
    .rule-header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;background:var(--cf-gray-50);border-bottom:1px solid var(--cf-gray-200)}
    .rule-header-left{display:flex;align-items:center;gap:12px}
    .rule-type{padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
    .rule-type.redirect{background:#DBEAFE;color:#1E40AF}
    .rule-type.rewrite{background:#E9D5FF;color:#7C3AED}
    .rule-type.request-header{background:#D1FAE5;color:#047857}
    .rule-type.response-header{background:#CCFBF1;color:#0D9488}
    .rule-type.origin{background:#FEF3C7;color:#B45309}
    .rule-type.snippet{background:#FEE2E2;color:#DC2626}
    .rule-name{font-size:15px;font-weight:600;color:var(--cf-gray-800)}
    .rule-number{font-size:13px;color:var(--cf-gray-500)}
    .rule-body{padding:24px}
    .rule-section{margin-bottom:24px}
    .rule-section:last-child{margin-bottom:0}
    .rule-section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
    .rule-section-title{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--cf-gray-600);text-transform:uppercase;letter-spacing:0.5px}
    .rule-section-title svg{width:16px;height:16px}
    .copy-btn{display:flex;align-items:center;gap:6px;padding:6px 12px;font-size:12px;font-weight:500;color:var(--cf-gray-600);background:var(--cf-gray-100);border:1px solid var(--cf-gray-200);border-radius:6px;cursor:pointer;transition:all 0.15s ease}
    .copy-btn:hover{background:var(--cf-gray-200);color:var(--cf-gray-800)}
    .copy-btn.copied{background:#D1FAE5;color:#047857;border-color:#A7F3D0}
    pre{background:var(--cf-gray-900);border-radius:8px;padding:16px;overflow-x:auto;margin:0}
    pre code{font-family:'SF Mono',Monaco,monospace;font-size:13px;line-height:1.6;color:#E5E7EB}
    .steps-list{background:var(--cf-gray-50);border:1px solid var(--cf-gray-200);border-radius:8px;padding:16px 16px 16px 20px}
    .steps-list ol{margin:0;padding-left:20px}
    .steps-list li{padding:6px 0;font-size:14px;color:var(--cf-gray-700)}
    .steps-list li strong{color:var(--cf-gray-800)}
    .steps-list li code{background:#fff;padding:2px 6px;border-radius:4px;font-size:12px;border:1px solid var(--cf-gray-200);color:var(--cf-orange-dark)}
    .note{display:flex;gap:12px;padding:16px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;font-size:14px;color:#1E40AF}
    .note svg{width:20px;height:20px;flex-shrink:0;color:#3B82F6}
    .warning{display:flex;gap:12px;padding:16px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;font-size:14px;color:#B45309}
    .features{margin-top:48px}
    .features h3{font-size:18px;font-weight:600;color:var(--cf-gray-800);margin-bottom:24px}
    .features-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
    .feature-card{padding:20px;background:#fff;border:1px solid var(--cf-gray-200);border-radius:10px;transition:all 0.2s ease}
    .feature-card:hover{border-color:var(--cf-orange);box-shadow:0 4px 12px rgba(246,130,31,0.1)}
    .feature-icon{width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:12px;font-size:20px}
    .feature-icon.redirect{background:#DBEAFE}
    .feature-icon.rewrite{background:#E9D5FF}
    .feature-icon.request{background:#D1FAE5}
    .feature-icon.response{background:#CCFBF1}
    .feature-icon.origin{background:#FEF3C7}
    .feature-icon.snippet{background:#FEE2E2}
    .feature-card h4{font-size:14px;font-weight:600;color:var(--cf-gray-800);margin-bottom:4px}
    .feature-card p{font-size:13px;color:var(--cf-gray-500)}
    .footer{text-align:center;padding:32px 0;border-top:1px solid var(--cf-gray-200);margin-top:48px}
    .footer p{font-size:13px;color:var(--cf-gray-500);margin-bottom:8px}
    .footer a{color:var(--cf-orange);text-decoration:none;font-weight:500}
    .footer a:hover{text-decoration:underline}
    .hidden{display:none!important}
    @keyframes spin{to{transform:rotate(360deg)}}
    .animate-spin{animation:spin 1s linear infinite}
  </style>
</head>
<body>
  <header class="header">
    <div class="container header-content">
      <div class="logo-icon">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <defs>
            <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#F6821F"/>
              <stop offset="100%" style="stop-color:#FBAD41"/>
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="52" height="52" rx="12" fill="#1F2937" stroke="url(#logoGrad)" stroke-width="2"/>
          <path d="M16 28L24 20L32 28L40 20" stroke="url(#logoGrad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <path d="M16 36L24 28L32 36L40 28" stroke="#F6821F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.5"/>
          <circle cx="40" cy="20" r="4" fill="#F6821F"/>
          <circle cx="16" cy="28" r="3" fill="#FBAD41"/>
        </svg>
      </div>
      <h1>F5 iRule to Cloudflare Rules Converter</h1>
      <p>Migrate your F5 BIG-IP iRules to Cloudflare Rules with step-by-step dashboard instructions and ready-to-use API calls</p>
      <span class="badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>Powered by Cloudflare Workers</span>
    </div>
  </header>
  <main class="main">
    <div class="container">
      <div class="card">
        <div class="tabs">
          <button id="uploadTab" class="tab active" onclick="switchTab('upload')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>Upload File</button>
          <button id="manualTab" class="tab" onclick="switchTab('manual')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Manual Entry</button>
        </div>
        <div id="uploadSection" class="tab-content active">
          <div class="upload-zone" id="dropZone" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)" onclick="document.getElementById('fileInput').click()">
            <input type="file" id="fileInput" accept=".txt,.tcl" class="hidden" onchange="handleFileSelect(event)">
            <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
            <h3>Drop your F5 iRules export file here</h3>
            <p>or click to browse your files</p>
            <button class="btn btn-primary" onclick="event.stopPropagation();document.getElementById('fileInput').click()">Select File</button>
            <p style="margin-top:16px;font-size:12px">Supports .txt and .tcl files</p>
          </div>
          <div id="fileInfo" class="file-info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span id="fileName"></span></div>
        </div>
        <div id="manualSection" class="tab-content">
          <div class="textarea-wrapper">
            <label for="manualInput">Paste your iRule(s) below</label>
            <textarea id="manualInput" placeholder="when HTTP_REQUEST {&#10;    if { [HTTP::uri] starts_with &quot;/api&quot; } {&#10;        HTTP::redirect &quot;https://api.example.com[HTTP::uri]&quot;&#10;    }&#10;}"></textarea>
            <p class="textarea-hint">You can paste multiple iRules - each will be parsed separately</p>
          </div>
        </div>
      </div>
      <div class="convert-section">
        <button onclick="convertRules()" class="btn btn-primary btn-lg" id="convertBtn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>Convert to Cloudflare Rules</button>
      </div>
      <div id="resultsSection" class="results-section">
        <div class="results-header"><h2>Conversion Results</h2><span id="resultsCount" class="results-count">0 rules</span></div>
        <div id="resultsContainer"></div>
      </div>
      <div class="features">
        <h3>Supported Conversions</h3>
        <div class="features-grid">
          <div class="feature-card"><div class="feature-icon redirect">↗️</div><h4>Redirects</h4><p>HTTP::redirect → Single Redirect Rules</p></div>
          <div class="feature-card"><div class="feature-icon rewrite">🔄</div><h4>URL Rewrites</h4><p>HTTP::uri → Transform Rules</p></div>
          <div class="feature-card"><div class="feature-icon request">📤</div><h4>Request Headers</h4><p>HTTP::header → Request Header Transform</p></div>
          <div class="feature-card"><div class="feature-icon response">📥</div><h4>Response Headers</h4><p>HTTP_RESPONSE → Response Header Transform</p></div>
          <div class="feature-card"><div class="feature-icon origin">🌐</div><h4>Origin Routing</h4><p>pool/node → Origin Rules</p></div>
          <div class="feature-card"><div class="feature-icon snippet">⚡</div><h4>Complex Logic</h4><p>Advanced iRules → Cloudflare Snippets</p></div>
        </div>
      </div>
      <footer class="footer">
        <p>This tool provides guidance for migrating F5 iRules to Cloudflare. Manual review recommended.</p>
        <p><a href="https://developers.cloudflare.com/rules/" target="_blank">View Cloudflare Rules Documentation →</a></p>
      </footer>
    </div>
  </main>
  <script>
    let uploadedContent='';
    function switchTab(tab){document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));document.getElementById(tab+'Tab').classList.add('active');document.getElementById(tab+'Section').classList.add('active')}
    function handleDragOver(e){e.preventDefault();document.getElementById('dropZone').classList.add('dragover')}
    function handleDragLeave(e){e.preventDefault();document.getElementById('dropZone').classList.remove('dragover')}
    function handleDrop(e){e.preventDefault();e.stopPropagation();document.getElementById('dropZone').classList.remove('dragover');const file=e.dataTransfer.files[0];if(file)processFile(file)}
    function handleFileSelect(e){const file=e.target.files[0];if(file)processFile(file)}
    function processFile(file){const reader=new FileReader();reader.onload=function(e){uploadedContent=e.target.result;document.getElementById('fileName').textContent=file.name+' ('+formatBytes(file.size)+')';document.getElementById('fileInfo').classList.add('show')};reader.readAsText(file)}
    function formatBytes(bytes){if(bytes===0)return'0 Bytes';const k=1024;const sizes=['Bytes','KB','MB'];const i=Math.floor(Math.log(bytes)/Math.log(k));return parseFloat((bytes/Math.pow(k,i)).toFixed(2))+' '+sizes[i]}
    async function convertRules(){const btn=document.getElementById('convertBtn');const activeTab=document.getElementById('uploadTab').classList.contains('active')?'upload':'manual';const content=activeTab==='upload'?uploadedContent:document.getElementById('manualInput').value;if(!content.trim()){alert('Please provide iRule content');return}btn.disabled=true;btn.innerHTML='<svg class="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" opacity="0.25"/><path d="M12 2a10 10 0 0110 10" opacity="0.75"/></svg> Converting...';try{const response=await fetch('/api/convert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({irules:content})});const results=await response.json();displayResults(results)}catch(error){alert('Error: '+error.message)}finally{btn.disabled=false;btn.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> Convert to Cloudflare Rules'}}
    function displayResults(results){const container=document.getElementById('resultsContainer');const section=document.getElementById('resultsSection');const countEl=document.getElementById('resultsCount');container.innerHTML='';if(results.length===0){container.innerHTML='<div class="warning"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg><span>No convertible patterns detected. Consider Cloudflare Snippets.</span></div>';countEl.textContent='0 rules';section.classList.add('show');return}countEl.textContent=results.length+' rule'+(results.length===1?'':'s');results.forEach((result,index)=>container.innerHTML+=createRuleCard(result,index));section.classList.add('show');hljs.highlightAll();section.scrollIntoView({behavior:'smooth'})}
    function createRuleCard(result,index){const typeClasses={'Single Redirect':'redirect','URL Rewrite':'rewrite','Request Header Transform':'request-header','Response Header Transform':'response-header','Origin Rule':'origin','Snippet':'snippet'};const typeClass=typeClasses[result.type]||'';let html='<div class="rule-card"><div class="rule-header"><div class="rule-header-left"><span class="rule-type '+typeClass+'">'+result.type+'</span><span class="rule-name">'+escapeHtml(result.name)+'</span></div><span class="rule-number">Rule #'+(index+1)+'</span></div><div class="rule-body">';html+='<div class="rule-section"><div class="rule-section-header"><span class="rule-section-title"><svg viewBox="0 0 24 24" fill="none" stroke="#F6821F" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>Original iRule</span></div><pre><code class="language-tcl">'+escapeHtml(result.original)+'</code></pre></div>';html+='<div class="rule-section"><div class="rule-section-header"><span class="rule-section-title"><svg viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>Dashboard Configuration</span></div><div class="steps-list"><ol>';result.guiSteps.forEach(function(step){html+='<li>'+step+'</li>'});html+='</ol></div></div>';html+='<div class="rule-section"><div class="rule-section-header"><span class="rule-section-title"><svg viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>API Call</span><button class="copy-btn" onclick="copyCode(this,\\'api-'+index+'\\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy</button></div><pre id="api-'+index+'"><code class="language-bash">'+escapeHtml(result.apiCall)+'</code></pre></div>';if(result.expression){html+='<div class="rule-section"><div class="rule-section-header"><span class="rule-section-title"><svg viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/></svg>Expression</span><button class="copy-btn" onclick="copyCode(this,\\'expr-'+index+'\\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy</button></div><pre id="expr-'+index+'"><code class="language-javascript">'+escapeHtml(result.expression)+'</code></pre></div>'}if(result.notes){html+='<div class="note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><span><strong>Note:</strong> '+result.notes+'</span></div>'}html+='</div></div>';return html}
    function escapeHtml(text){const div=document.createElement('div');div.textContent=text;return div.innerHTML}
    function copyCode(btn,elementId){const element=document.getElementById(elementId);const text=element.textContent;navigator.clipboard.writeText(text).then(function(){btn.classList.add('copied');btn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Copied!';setTimeout(function(){btn.classList.remove('copied');btn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy'},2000)})}
  </script>
</body>
</html>`;

// Parse iRules and detect patterns
function parseIRules(content) {
  const results = [];
  const blocks = extractEventBlocks(content);
  
  for (const block of blocks) {
    const blockResults = analyzeBlock(block);
    results.push(...blockResults);
  }
  
  return results;
}

// Extract event blocks (when HTTP_REQUEST, when HTTP_RESPONSE, etc.)
function extractEventBlocks(content) {
  const blocks = [];
  const eventRegex = /when\s+(HTTP_REQUEST|HTTP_RESPONSE|CLIENT_ACCEPTED|LB_SELECTED|SERVER_CONNECTED)\s*\{/gi;
  let match;
  
  while ((match = eventRegex.exec(content)) !== null) {
    const eventType = match[1].toUpperCase();
    const startIdx = match.index;
    let braceCount = 1;
    let endIdx = match.index + match[0].length;
    
    while (braceCount > 0 && endIdx < content.length) {
      if (content[endIdx] === '{') braceCount++;
      if (content[endIdx] === '}') braceCount--;
      endIdx++;
    }
    
    blocks.push({
      type: eventType,
      content: content.substring(startIdx, endIdx),
      body: content.substring(match.index + match[0].length, endIdx - 1)
    });
  }
  
  return blocks;
}

// Analyze a block and extract rules
function analyzeBlock(block) {
  const results = [];
  
  // Check for redirects
  const redirects = extractRedirects(block);
  results.push(...redirects);
  
  // Check for URL rewrites (non-redirect URI modifications)
  const rewrites = extractRewrites(block);
  results.push(...rewrites);
  
  // Check for header modifications
  const headers = extractHeaderMods(block);
  results.push(...headers);
  
  // Check for pool/node routing
  const origins = extractOriginRules(block);
  results.push(...origins);
  
  // Check for complex patterns that need Snippets
  const snippets = extractComplexPatterns(block);
  results.push(...snippets);
  
  return results;
}

// Extract redirect rules
function extractRedirects(block) {
  const results = [];
  const redirectRegex = /if\s*\{\s*\[HTTP::(uri|host|path)[^\]]*\]\s*(starts_with|contains|eq|ends_with|matches)\s*"([^"]+)"\s*\}\s*\{\s*HTTP::redirect\s+"([^"]+)"/gi;
  let match;
  
  while ((match = redirectRegex.exec(block.body)) !== null) {
    const condition = match[1];
    const operator = match[2];
    const pattern = match[3];
    const target = match[4];
    
    results.push({
      type: 'Single Redirect',
      name: `Redirect ${pattern} → ${target.substring(0, 30)}...`,
      original: match[0].replace(/\s+/g, ' ').trim(),
      guiSteps: [
        'Go to <strong>Rules</strong> → <strong>Redirect Rules</strong>',
        'Click <strong>Create rule</strong>',
        `Set expression: <code>${buildExpression(condition, operator, pattern)}</code>`,
        `Set destination URL: <code>${target}</code>`,
        'Set status code: <strong>301</strong> or <strong>302</strong>',
        'Click <strong>Deploy</strong>'
      ],
      apiCall: generateRedirectAPI(condition, operator, pattern, target),
      expression: buildExpression(condition, operator, pattern)
    });
  }
  
  // Also catch simple redirects without conditions
  const simpleRedirectRegex = /HTTP::redirect\s+"([^"]+)"/gi;
  let simpleMatch;
  const alreadyMatched = results.map(r => r.original);
  
  while ((simpleMatch = simpleRedirectRegex.exec(block.body)) !== null) {
    const fullMatch = simpleMatch[0];
    if (!alreadyMatched.some(m => m.includes(fullMatch))) {
      results.push({
        type: 'Single Redirect',
        name: `Redirect to ${simpleMatch[1].substring(0, 40)}...`,
        original: fullMatch,
        guiSteps: [
          'Go to <strong>Rules</strong> → <strong>Redirect Rules</strong>',
          'Click <strong>Create rule</strong>',
          'Set expression: <code>true</code> (or add specific conditions)',
          `Set destination URL: <code>${simpleMatch[1]}</code>`,
          'Click <strong>Deploy</strong>'
        ],
        apiCall: generateSimpleRedirectAPI(simpleMatch[1]),
        expression: 'true'
      });
    }
  }
  
  return results;
}

// Extract URL rewrite rules
function extractRewrites(block) {
  const results = [];
  // Match HTTP::uri set without redirect
  const rewriteRegex = /if\s*\{\s*\[HTTP::(uri|path)[^\]]*\]\s*(starts_with|contains|eq)\s*"([^"]+)"\s*\}\s*\{\s*HTTP::uri\s+"([^"]+)"(?!\s*\n[^}]*HTTP::redirect)/gi;
  let match;
  
  while ((match = rewriteRegex.exec(block.body)) !== null) {
    const condition = match[1];
    const operator = match[2];
    const pattern = match[3];
    const newUri = match[4];
    
    results.push({
      type: 'URL Rewrite',
      name: `Rewrite ${pattern} → ${newUri}`,
      original: match[0].replace(/\s+/g, ' ').trim(),
      guiSteps: [
        'Go to <strong>Rules</strong> → <strong>Transform Rules</strong>',
        'Select <strong>Rewrite URL</strong> tab',
        'Click <strong>Create rule</strong>',
        `Set expression: <code>${buildExpression(condition, operator, pattern)}</code>`,
        `Rewrite path to: <code>${newUri}</code>`,
        'Click <strong>Deploy</strong>'
      ],
      apiCall: generateRewriteAPI(condition, operator, pattern, newUri),
      expression: buildExpression(condition, operator, pattern)
    });
  }
  
  return results;
}

// Extract header modification rules
function extractHeaderMods(block) {
  const results = [];
  const isResponse = block.type === 'HTTP_RESPONSE';
  const ruleType = isResponse ? 'Response Header Transform' : 'Request Header Transform';
  
  // Insert headers
  const insertRegex = /HTTP::header\s+insert\s+"([^"]+)"\s+"([^"]+)"/gi;
  let match;
  
  while ((match = insertRegex.exec(block.body)) !== null) {
    results.push({
      type: ruleType,
      name: `Add header: ${match[1]}`,
      original: match[0],
      guiSteps: [
        'Go to <strong>Rules</strong> → <strong>Transform Rules</strong>',
        `Select <strong>Modify ${isResponse ? 'Response' : 'Request'} Header</strong> tab`,
        'Click <strong>Create rule</strong>',
        'Set expression: <code>true</code> (or add specific conditions)',
        `Action: <strong>Set static</strong>`,
        `Header name: <code>${match[1]}</code>`,
        `Value: <code>${match[2]}</code>`,
        'Click <strong>Deploy</strong>'
      ],
      apiCall: generateHeaderAPI(match[1], match[2], 'set', isResponse),
      expression: 'true'
    });
  }
  
  // Remove headers
  const removeRegex = /HTTP::header\s+remove\s+"([^"]+)"/gi;
  
  while ((match = removeRegex.exec(block.body)) !== null) {
    results.push({
      type: ruleType,
      name: `Remove header: ${match[1]}`,
      original: match[0],
      guiSteps: [
        'Go to <strong>Rules</strong> → <strong>Transform Rules</strong>',
        `Select <strong>Modify ${isResponse ? 'Response' : 'Request'} Header</strong> tab`,
        'Click <strong>Create rule</strong>',
        'Set expression: <code>true</code>',
        `Action: <strong>Remove</strong>`,
        `Header name: <code>${match[1]}</code>`,
        'Click <strong>Deploy</strong>'
      ],
      apiCall: generateHeaderAPI(match[1], null, 'remove', isResponse),
      expression: 'true'
    });
  }
  
  // Replace headers
  const replaceRegex = /HTTP::header\s+replace\s+"([^"]+)"\s+"([^"]+)"/gi;
  
  while ((match = replaceRegex.exec(block.body)) !== null) {
    results.push({
      type: ruleType,
      name: `Replace header: ${match[1]}`,
      original: match[0],
      guiSteps: [
        'Go to <strong>Rules</strong> → <strong>Transform Rules</strong>',
        `Select <strong>Modify ${isResponse ? 'Response' : 'Request'} Header</strong> tab`,
        'Click <strong>Create rule</strong>',
        'Set expression: <code>true</code>',
        `Action: <strong>Set static</strong>`,
        `Header name: <code>${match[1]}</code>`,
        `Value: <code>${match[2]}</code>`,
        'Click <strong>Deploy</strong>'
      ],
      apiCall: generateHeaderAPI(match[1], match[2], 'set', isResponse),
      expression: 'true'
    });
  }
  
  return results;
}

// Extract origin/pool rules
function extractOriginRules(block) {
  const results = [];
  
  // Pool routing
  const poolRegex = /if\s*\{\s*\[HTTP::(uri|host|path)[^\]]*\]\s*(starts_with|contains|eq)\s*"([^"]+)"\s*\}\s*\{\s*pool\s+(\S+)/gi;
  let match;
  
  while ((match = poolRegex.exec(block.body)) !== null) {
    const condition = match[1];
    const operator = match[2];
    const pattern = match[3];
    const poolName = match[4];
    
    results.push({
      type: 'Origin Rule',
      name: `Route ${pattern} → ${poolName}`,
      original: match[0].replace(/\s+/g, ' ').trim(),
      guiSteps: [
        'Go to <strong>Rules</strong> → <strong>Origin Rules</strong>',
        'Click <strong>Create rule</strong>',
        `Set expression: <code>${buildExpression(condition, operator, pattern)}</code>`,
        `Set <strong>Host Header</strong> to your origin hostname`,
        'Optionally set <strong>DNS record</strong> override',
        'Click <strong>Deploy</strong>',
        `<em>Note: Pool "${poolName}" needs to be replaced with actual origin hostname</em>`
      ],
      apiCall: generateOriginAPI(condition, operator, pattern, poolName),
      expression: buildExpression(condition, operator, pattern)
    });
  }
  
  // Node routing
  const nodeRegex = /if\s*\{\s*\[HTTP::(uri|host|path)[^\]]*\]\s*(starts_with|contains|eq)\s*"([^"]+)"\s*\}\s*\{\s*node\s+(\S+)\s+(\d+)/gi;
  
  while ((match = nodeRegex.exec(block.body)) !== null) {
    const condition = match[1];
    const operator = match[2];
    const pattern = match[3];
    const nodeIP = match[4];
    const nodePort = match[5];
    
    results.push({
      type: 'Origin Rule',
      name: `Route ${pattern} → ${nodeIP}:${nodePort}`,
      original: match[0].replace(/\s+/g, ' ').trim(),
      guiSteps: [
        'Go to <strong>Rules</strong> → <strong>Origin Rules</strong>',
        'Click <strong>Create rule</strong>',
        `Set expression: <code>${buildExpression(condition, operator, pattern)}</code>`,
        `Override <strong>Destination Port</strong>: <code>${nodePort}</code>`,
        'Set DNS override to route to your origin',
        'Click <strong>Deploy</strong>',
        `<em>Note: Direct IP routing (${nodeIP}) requires DNS record configuration</em>`
      ],
      apiCall: generateOriginAPI(condition, operator, pattern, `${nodeIP}:${nodePort}`),
      expression: buildExpression(condition, operator, pattern)
    });
  }
  
  return results;
}

// Extract complex patterns that need Snippets
function extractComplexPatterns(block) {
  const results = [];
  const complexPatterns = [
    { regex: /set\s+\w+\s+\[/, name: 'Variable assignment' },
    { regex: /HTTP::respond\s+\d+/, name: 'Custom HTTP response' },
    { regex: /HTTP::cookie\s+(exists|value)/, name: 'Cookie manipulation' },
    { regex: /string\s+(range|length|map)/, name: 'String manipulation' },
    { regex: /persist\s+/, name: 'Session persistence' },
    { regex: /TCP::collect/, name: 'TCP-level handling' },
    { regex: /log\s+local/, name: 'Logging' },
    { regex: /\$\w+/, name: 'Variable usage' }
  ];
  
  const foundPatterns = [];
  
  for (const pattern of complexPatterns) {
    if (pattern.regex.test(block.body)) {
      foundPatterns.push(pattern.name);
    }
  }
  
  if (foundPatterns.length > 0 && block.type !== 'HTTP_REQUEST' && block.type !== 'HTTP_RESPONSE') {
    results.push({
      type: 'Snippet',
      name: `Complex logic: ${foundPatterns.slice(0, 2).join(', ')}${foundPatterns.length > 2 ? '...' : ''}`,
      original: block.content.substring(0, 200) + (block.content.length > 200 ? '...' : ''),
      guiSteps: [
        'Go to <strong>Rules</strong> → <strong>Snippets</strong>',
        'Click <strong>Create snippet</strong>',
        'Write JavaScript code to implement the logic',
        'Define the trigger route',
        'Click <strong>Deploy</strong>',
        '<em>Detected patterns: ' + foundPatterns.join(', ') + '</em>'
      ],
      apiCall: generateSnippetAPI(foundPatterns),
      expression: 'N/A - Snippets use JavaScript'
    });
  }
  
  return results;
}

// Build Cloudflare expression
function buildExpression(condition, operator, pattern) {
  const field = condition.toLowerCase() === 'host' ? 'http.host' : 'http.request.uri.path';
  
  switch (operator.toLowerCase()) {
    case 'starts_with':
      return `starts_with(${field}, "${pattern}")`;
    case 'ends_with':
      return `ends_with(${field}, "${pattern}")`;
    case 'contains':
      return `contains(${field}, "${pattern}")`;
    case 'eq':
      return `${field} eq "${pattern}"`;
    case 'matches':
      return `${field} matches "${pattern}"`;
    default:
      return `${field} eq "${pattern}"`;
  }
}

// Generate API calls
function generateRedirectAPI(condition, operator, pattern, target) {
  const expression = buildExpression(condition, operator, pattern);
  return `curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/rulesets/phases/http_request_dynamic_redirect/entrypoint" \\
  -H "Authorization: Bearer {api_token}" \\
  -H "Content-Type: application/json" \\
  --data '{
    "rules": [{
      "expression": "${expression}",
      "action": "redirect",
      "action_parameters": {
        "from_value": {
          "status_code": 301,
          "target_url": {
            "value": "${target}"
          }
        }
      }
    }]
  }'`;
}

function generateSimpleRedirectAPI(target) {
  return `curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/rulesets/phases/http_request_dynamic_redirect/entrypoint" \\
  -H "Authorization: Bearer {api_token}" \\
  -H "Content-Type: application/json" \\
  --data '{
    "rules": [{
      "expression": "true",
      "action": "redirect",
      "action_parameters": {
        "from_value": {
          "status_code": 301,
          "target_url": {
            "value": "${target}"
          }
        }
      }
    }]
  }'`;
}

function generateRewriteAPI(condition, operator, pattern, newUri) {
  const expression = buildExpression(condition, operator, pattern);
  return `curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/rulesets/phases/http_request_transform/entrypoint" \\
  -H "Authorization: Bearer {api_token}" \\
  -H "Content-Type: application/json" \\
  --data '{
    "rules": [{
      "expression": "${expression}",
      "action": "rewrite",
      "action_parameters": {
        "uri": {
          "path": {
            "value": "${newUri}"
          }
        }
      }
    }]
  }'`;
}

function generateHeaderAPI(headerName, headerValue, action, isResponse) {
  const phase = isResponse ? 'http_response_headers_transform' : 'http_request_late_transform';
  const actionConfig = action === 'remove' 
    ? `"remove": true` 
    : `"value": "${headerValue}"`;
  
  return `curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/rulesets/phases/${phase}/entrypoint" \\
  -H "Authorization: Bearer {api_token}" \\
  -H "Content-Type: application/json" \\
  --data '{
    "rules": [{
      "expression": "true",
      "action": "rewrite",
      "action_parameters": {
        "headers": {
          "${headerName}": {
            "operation": "${action}",
            ${actionConfig}
          }
        }
      }
    }]
  }'`;
}

function generateOriginAPI(condition, operator, pattern, origin) {
  const expression = buildExpression(condition, operator, pattern);
  const originHost = origin.replace(/:\d+$/, '');
  return `curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/rulesets/phases/http_request_origin/entrypoint" \\
  -H "Authorization: Bearer {api_token}" \\
  -H "Content-Type: application/json" \\
  --data '{
    "rules": [{
      "expression": "${expression}",
      "action": "route",
      "action_parameters": {
        "host_header": "${originHost}",
        "origin": {
          "host": "${originHost}"
        }
      },
      "description": "Migrated from F5 pool/node rule"
    }]
  }'`;
}

function generateSnippetAPI(patterns) {
  return `// Snippets require custom JavaScript implementation
// Detected complex patterns: ${patterns.join(', ')}

// Example Snippet structure:
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Implement your logic here based on the iRule patterns
    // - Variable handling
    // - Cookie manipulation  
    // - Custom responses
    // - Complex conditionals
    
    return fetch(request);
  }
};

// Deploy via Wrangler or Cloudflare Dashboard:
// 1. Go to Rules → Snippets
// 2. Create new snippet
// 3. Paste your JavaScript code
// 4. Configure trigger routes`;
}

// Worker fetch handler
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle API endpoint
    if (url.pathname === '/api/convert' && request.method === 'POST') {
      try {
        const body = await request.json();
        const irules = body.irules || '';
        const results = parseIRules(irules);
        
        return new Response(JSON.stringify(results), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }
    
    // Serve HTML UI
    return new Response(HTML_TEMPLATE, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
};
