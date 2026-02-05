const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>F5 iRule to Cloudflare Rules Converter</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <style>
    .tab-active { background-color: #f97316; color: white; }
    .tab-inactive { background-color: #1f2937; color: #9ca3af; }
    .copy-btn:hover { background-color: #374151; }
    pre code { font-size: 0.875rem; }
  </style>
</head>
<body class="bg-gray-900 text-gray-100 min-h-screen">
  <div class="container mx-auto px-4 py-8 max-w-7xl">
    <header class="text-center mb-10">
      <div class="flex items-center justify-center gap-4 mb-4">
        <svg class="w-12 h-12 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        <h1 class="text-4xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
          F5 iRule to Cloudflare Rules Converter
        </h1>
      </div>
      <p class="text-gray-400 text-lg">Convert your F5 BIG-IP iRules to Cloudflare Rules with GUI instructions and API calls</p>
    </header>

    <div class="mb-8">
      <div class="flex border-b border-gray-700">
        <button id="uploadTab" onclick="switchTab('upload')" class="px-6 py-3 font-medium rounded-t-lg tab-active transition-colors">
          📁 Upload File
        </button>
        <button id="manualTab" onclick="switchTab('manual')" class="px-6 py-3 font-medium rounded-t-lg tab-inactive transition-colors ml-2">
          ✏️ Manual Entry
        </button>
      </div>

      <div id="uploadSection" class="bg-gray-800 rounded-b-lg rounded-tr-lg p-6">
        <div class="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-orange-500 transition-colors"
             ondragover="handleDragOver(event)" ondrop="handleDrop(event)">
          <input type="file" id="fileInput" accept=".txt,.tcl" class="hidden" onchange="handleFileSelect(event)">
          <svg class="w-16 h-16 mx-auto text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
          </svg>
          <p class="text-gray-400 mb-2">Drag and drop your F5 iRules export file here</p>
          <p class="text-gray-500 text-sm mb-4">or</p>
          <button onclick="document.getElementById('fileInput').click()" 
                  class="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-medium transition-colors">
            Select File
          </button>
          <p class="text-gray-500 text-sm mt-4">Supports .txt and .tcl files from F5 "Export iRules" command</p>
        </div>
        <div id="fileInfo" class="mt-4 hidden">
          <div class="flex items-center gap-2 text-green-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span id="fileName"></span>
          </div>
        </div>
      </div>

      <div id="manualSection" class="bg-gray-800 rounded-b-lg rounded-tr-lg p-6 hidden">
        <label class="block text-gray-300 font-medium mb-2">Enter iRule(s) below:</label>
        <textarea id="manualInput" rows="15" 
                  class="w-full bg-gray-900 border border-gray-700 rounded-lg p-4 text-gray-100 font-mono text-sm focus:border-orange-500 focus:outline-none"
                  placeholder="when HTTP_REQUEST {
    if { [HTTP::uri] starts_with &quot;/api&quot; } {
        HTTP::redirect &quot;https://api.example.com[HTTP::uri]&quot;
    }
    if { [HTTP::header exists &quot;X-Custom-Header&quot;] } {
        HTTP::header remove &quot;X-Custom-Header&quot;
    }
}

when HTTP_RESPONSE {
    HTTP::header insert &quot;X-Frame-Options&quot; &quot;SAMEORIGIN&quot;
}"></textarea>
        <p class="text-gray-500 text-sm mt-2">You can paste multiple iRules - each will be parsed separately</p>
      </div>
    </div>

    <div class="text-center mb-8">
      <button onclick="convertRules()" 
              class="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white px-8 py-3 rounded-lg font-bold text-lg transition-all transform hover:scale-105 shadow-lg">
        🔄 Convert to Cloudflare Rules
      </button>
    </div>

    <div id="resultsSection" class="hidden">
      <h2 class="text-2xl font-bold mb-6 flex items-center gap-2">
        <svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        Conversion Results
      </h2>
      <div id="resultsContainer" class="space-y-6"></div>
    </div>

    <div class="mt-12 bg-gray-800 rounded-lg p-6">
      <h3 class="text-xl font-bold mb-4 text-orange-500">Supported iRule Conversions</h3>
      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="bg-gray-900 rounded-lg p-4">
          <h4 class="font-semibold text-white mb-2">🔀 Redirects</h4>
          <p class="text-gray-400 text-sm">HTTP::redirect → Single Redirects</p>
        </div>
        <div class="bg-gray-900 rounded-lg p-4">
          <h4 class="font-semibold text-white mb-2">📝 URL Rewrites</h4>
          <p class="text-gray-400 text-sm">HTTP::uri → Transform Rules (URL Rewrite)</p>
        </div>
        <div class="bg-gray-900 rounded-lg p-4">
          <h4 class="font-semibold text-white mb-2">📨 Request Headers</h4>
          <p class="text-gray-400 text-sm">HTTP::header insert/remove → Request Header Transform</p>
        </div>
        <div class="bg-gray-900 rounded-lg p-4">
          <h4 class="font-semibold text-white mb-2">📩 Response Headers</h4>
          <p class="text-gray-400 text-sm">HTTP_RESPONSE headers → Response Header Transform</p>
        </div>
        <div class="bg-gray-900 rounded-lg p-4">
          <h4 class="font-semibold text-white mb-2">🌐 Origin Routing</h4>
          <p class="text-gray-400 text-sm">pool/node commands → Origin Rules</p>
        </div>
        <div class="bg-gray-900 rounded-lg p-4">
          <h4 class="font-semibold text-white mb-2">⚙️ Complex Logic</h4>
          <p class="text-gray-400 text-sm">Advanced iRules → Cloudflare Snippets</p>
        </div>
      </div>
    </div>

    <footer class="mt-12 text-center text-gray-500 text-sm">
      <p>This tool provides guidance for migrating F5 iRules to Cloudflare. Manual review is recommended for complex rules.</p>
      <p class="mt-2">
        <a href="https://developers.cloudflare.com/rules/" target="_blank" class="text-orange-500 hover:underline">Cloudflare Rules Documentation</a>
      </p>
    </footer>
  </div>

  <script>
    let uploadedContent = '';
    
    function switchTab(tab) {
      const uploadTab = document.getElementById('uploadTab');
      const manualTab = document.getElementById('manualTab');
      const uploadSection = document.getElementById('uploadSection');
      const manualSection = document.getElementById('manualSection');
      
      if (tab === 'upload') {
        uploadTab.className = 'px-6 py-3 font-medium rounded-t-lg tab-active transition-colors';
        manualTab.className = 'px-6 py-3 font-medium rounded-t-lg tab-inactive transition-colors ml-2';
        uploadSection.classList.remove('hidden');
        manualSection.classList.add('hidden');
      } else {
        manualTab.className = 'px-6 py-3 font-medium rounded-t-lg tab-active transition-colors ml-2';
        uploadTab.className = 'px-6 py-3 font-medium rounded-t-lg tab-inactive transition-colors';
        manualSection.classList.remove('hidden');
        uploadSection.classList.add('hidden');
      }
    }
    
    function handleDragOver(e) {
      e.preventDefault();
      e.currentTarget.classList.add('border-orange-500');
    }
    
    function handleDrop(e) {
      e.preventDefault();
      e.currentTarget.classList.remove('border-orange-500');
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    }
    
    function handleFileSelect(e) {
      const file = e.target.files[0];
      if (file) processFile(file);
    }
    
    function processFile(file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        uploadedContent = e.target.result;
        document.getElementById('fileName').textContent = file.name + ' (' + formatBytes(file.size) + ')';
        document.getElementById('fileInfo').classList.remove('hidden');
      };
      reader.readAsText(file);
    }
    
    function formatBytes(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    async function convertRules() {
      const activeTab = document.getElementById('uploadTab').classList.contains('tab-active') ? 'upload' : 'manual';
      const content = activeTab === 'upload' ? uploadedContent : document.getElementById('manualInput').value;
      
      if (!content.trim()) {
        alert('Please provide iRule content to convert');
        return;
      }
      
      try {
        const response = await fetch('/api/convert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ irules: content })
        });
        
        const results = await response.json();
        displayResults(results);
      } catch (error) {
        alert('Error converting rules: ' + error.message);
      }
    }
    
    function displayResults(results) {
      const container = document.getElementById('resultsContainer');
      const section = document.getElementById('resultsSection');
      container.innerHTML = '';
      
      if (results.length === 0) {
        container.innerHTML = '<div class="bg-yellow-900/50 border border-yellow-600 rounded-lg p-4 text-yellow-200">No convertible iRule patterns were detected. The iRules may require manual migration using Cloudflare Snippets.</div>';
        section.classList.remove('hidden');
        return;
      }
      
      results.forEach((result, index) => {
        const ruleHtml = createRuleCard(result, index);
        container.innerHTML += ruleHtml;
      });
      
      section.classList.remove('hidden');
      hljs.highlightAll();
      section.scrollIntoView({ behavior: 'smooth' });
    }
    
    function createRuleCard(result, index) {
      const typeColors = {
        'Single Redirect': 'bg-blue-500',
        'URL Rewrite': 'bg-purple-500',
        'Request Header Transform': 'bg-green-500',
        'Response Header Transform': 'bg-teal-500',
        'Origin Rule': 'bg-amber-500',
        'Snippet': 'bg-red-500'
      };
      
      const typeColor = typeColors[result.type] || 'bg-gray-500';
      
      let html = '<div class="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">';
      html += '<div class="bg-gray-700 px-6 py-4 flex items-center justify-between">';
      html += '<div class="flex items-center gap-3">';
      html += '<span class="' + typeColor + ' text-white text-xs font-bold px-3 py-1 rounded-full">' + result.type + '</span>';
      html += '<h3 class="font-semibold text-lg">' + result.name + '</h3>';
      html += '</div>';
      html += '<span class="text-gray-400 text-sm">Rule #' + (index + 1) + '</span>';
      html += '</div>';
      
      html += '<div class="p-6 space-y-6">';
      
      html += '<div>';
      html += '<h4 class="text-gray-400 font-medium mb-2 flex items-center gap-2">';
      html += '<span class="text-orange-500">▸</span> Original iRule Pattern</h4>';
      html += '<pre class="bg-gray-900 rounded-lg p-4 overflow-x-auto"><code class="language-tcl">' + escapeHtml(result.original) + '</code></pre>';
      html += '</div>';
      
      html += '<div>';
      html += '<h4 class="text-gray-400 font-medium mb-2 flex items-center gap-2">';
      html += '<span class="text-blue-500">▸</span> Cloudflare Dashboard Configuration</h4>';
      html += '<div class="bg-gray-900 rounded-lg p-4">';
      html += '<ol class="list-decimal list-inside space-y-2 text-gray-300">';
      result.guiSteps.forEach(function(step) {
        html += '<li>' + step + '</li>';
      });
      html += '</ol></div></div>';
      
      html += '<div>';
      html += '<h4 class="text-gray-400 font-medium mb-2 flex items-center gap-2">';
      html += '<span class="text-green-500">▸</span> API Call';
      html += '<button onclick="copyToClipboard(\\'api-' + index + '\\')" class="copy-btn ml-auto bg-gray-700 text-gray-300 text-xs px-3 py-1 rounded hover:bg-gray-600 transition-colors">📋 Copy</button>';
      html += '</h4>';
      html += '<pre id="api-' + index + '" class="bg-gray-900 rounded-lg p-4 overflow-x-auto"><code class="language-bash">' + escapeHtml(result.apiCall) + '</code></pre>';
      html += '</div>';
      
      if (result.expression) {
        html += '<div>';
        html += '<h4 class="text-gray-400 font-medium mb-2 flex items-center gap-2">';
        html += '<span class="text-purple-500">▸</span> Cloudflare Expression';
        html += '<button onclick="copyToClipboard(\\'expr-' + index + '\\')" class="copy-btn ml-auto bg-gray-700 text-gray-300 text-xs px-3 py-1 rounded hover:bg-gray-600 transition-colors">📋 Copy</button>';
        html += '</h4>';
        html += '<pre id="expr-' + index + '" class="bg-gray-900 rounded-lg p-4 overflow-x-auto"><code class="language-javascript">' + escapeHtml(result.expression) + '</code></pre>';
        html += '</div>';
      }
      
      if (result.notes) {
        html += '<div class="bg-blue-900/30 border border-blue-700 rounded-lg p-4">';
        html += '<p class="text-blue-200 text-sm">💡 <strong>Note:</strong> ' + result.notes + '</p>';
        html += '</div>';
      }
      
      html += '</div></div>';
      return html;
    }
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    function copyToClipboard(elementId) {
      const element = document.getElementById(elementId);
      const text = element.textContent;
      navigator.clipboard.writeText(text).then(function() {
        const btn = element.parentElement.querySelector('.copy-btn');
        if (btn) {
          const originalText = btn.textContent;
          btn.textContent = '✓ Copied!';
          setTimeout(function() { btn.textContent = originalText; }, 2000);
        }
      });
    }
  </script>
</body>
</html>`;

function parseIRules(content) {
  const rules = [];
  const iRuleBlocks = content.split(/(?=when\s+(?:HTTP_REQUEST|HTTP_RESPONSE|CLIENT_ACCEPTED|SERVER_CONNECTED))/gi);
  
  for (const block of iRuleBlocks) {
    if (!block.trim()) continue;
    
    if (/when\s+HTTP_REQUEST/i.test(block)) {
      rules.push(...parseHttpRequestBlock(block));
    }
    
    if (/when\s+HTTP_RESPONSE/i.test(block)) {
      rules.push(...parseHttpResponseBlock(block));
    }
    
    if (/(?:pool|node)\s+/i.test(block) && !rules.some(r => r.type === 'Origin Rule')) {
      rules.push(...parsePoolNodeBlock(block));
    }
  }
  
  if (rules.length === 0 && content.trim()) {
    rules.push(createSnippetSuggestion(content));
  }
  
  return rules;
}

function parseHttpRequestBlock(block) {
  const rules = [];
  
  const redirectRegex = /if\s*\{\s*\[HTTP::(?:uri|host|path)(?:\s+[^\]]+)?\]\s*(starts_with|ends_with|contains|equals?|==|eq)\s*"([^"]+)"\s*\}\s*\{[^}]*HTTP::redirect\s+"([^"]+)"/gi;
  let match;
  while ((match = redirectRegex.exec(block)) !== null) {
    rules.push(createRedirectRule(match[1], match[2], match[3], block));
  }
  
  const simpleRedirectRegex = /HTTP::redirect\s+"([^"]+)"/gi;
  while ((match = simpleRedirectRegex.exec(block)) !== null) {
    if (!rules.some(r => r.original.includes(match[0]))) {
      rules.push(createSimpleRedirectRule(match[1], block));
    }
  }
  
  const uriRegex = /if\s*\{[^}]+\}\s*\{[^}]*HTTP::uri\s+"([^"]+)"/gi;
  while ((match = uriRegex.exec(block)) !== null) {
    rules.push(createUriRewriteRule(match[0], match[1]));
  }
  
  const headerInsertRegex = /HTTP::header\s+insert\s+"([^"]+)"\s+"([^"]+)"/gi;
  while ((match = headerInsertRegex.exec(block)) !== null) {
    rules.push(createRequestHeaderInsertRule(match[1], match[2], block));
  }
  
  const headerRemoveRegex = /HTTP::header\s+remove\s+"([^"]+)"/gi;
  while ((match = headerRemoveRegex.exec(block)) !== null) {
    rules.push(createRequestHeaderRemoveRule(match[1], block));
  }
  
  const headerReplaceRegex = /HTTP::header\s+replace\s+"([^"]+)"\s+"([^"]+)"/gi;
  while ((match = headerReplaceRegex.exec(block)) !== null) {
    rules.push(createRequestHeaderReplaceRule(match[1], match[2], block));
  }
  
  return rules;
}

function parseHttpResponseBlock(block) {
  const rules = [];
  
  const headerInsertRegex = /HTTP::header\s+insert\s+"([^"]+)"\s+"([^"]+)"/gi;
  let match;
  while ((match = headerInsertRegex.exec(block)) !== null) {
    rules.push(createResponseHeaderInsertRule(match[1], match[2], block));
  }
  
  const headerRemoveRegex = /HTTP::header\s+remove\s+"([^"]+)"/gi;
  while ((match = headerRemoveRegex.exec(block)) !== null) {
    rules.push(createResponseHeaderRemoveRule(match[1], block));
  }
  
  return rules;
}

function parsePoolNodeBlock(block) {
  const rules = [];
  
  const poolRegex = /if\s*\{\s*\[HTTP::(?:uri|host|path)(?:\s+[^\]]+)?\]\s*(starts_with|ends_with|contains|equals?|==|eq)\s*"([^"]+)"\s*\}\s*\{[^}]*(?:pool|node)\s+(\S+)/gi;
  let match;
  while ((match = poolRegex.exec(block)) !== null) {
    rules.push(createOriginRule(match[1], match[2], match[3], block));
  }
  
  return rules;
}

function createRedirectRule(operator, pattern, targetUrl, originalBlock) {
  const cfExpression = convertConditionToExpression(operator, pattern);
  
  return {
    type: 'Single Redirect',
    name: 'Redirect ' + pattern + ' requests',
    original: extractRelevantBlock(originalBlock, pattern),
    expression: cfExpression,
    guiSteps: [
      'Navigate to your zone in the Cloudflare dashboard',
      'Go to <strong>Rules</strong> → <strong>Redirect Rules</strong>',
      'Click <strong>Create rule</strong>',
      'Enter a descriptive rule name',
      'Set the filter expression to: <code>' + cfExpression + '</code>',
      'Set the URL redirect to: <code>' + targetUrl + '</code>',
      'Choose the appropriate status code (301 for permanent, 302 for temporary)',
      'Click <strong>Deploy</strong>'
    ],
    apiCall: generateRedirectApiCall(cfExpression, targetUrl),
    notes: 'Review the redirect URL to ensure any dynamic components are properly handled. You may need to use dynamic URL redirects for complex patterns.'
  };
}

function createSimpleRedirectRule(targetUrl, originalBlock) {
  return {
    type: 'Single Redirect',
    name: 'Redirect all requests to ' + targetUrl.substring(0, 30) + '...',
    original: 'HTTP::redirect "' + targetUrl + '"',
    expression: 'true',
    guiSteps: [
      'Navigate to your zone in the Cloudflare dashboard',
      'Go to <strong>Rules</strong> → <strong>Redirect Rules</strong>',
      'Click <strong>Create rule</strong>',
      'Enter a descriptive rule name',
      'Set the filter expression to match all traffic or add specific conditions',
      'Set the URL redirect to: <code>' + targetUrl + '</code>',
      'Choose the appropriate status code (301 for permanent, 302 for temporary)',
      'Click <strong>Deploy</strong>'
    ],
    apiCall: generateRedirectApiCall('true', targetUrl),
    notes: 'This redirect has no condition in the original iRule. Add an appropriate filter expression to target specific traffic.'
  };
}

function createUriRewriteRule(originalBlock, newUri) {
  return {
    type: 'URL Rewrite',
    name: 'Rewrite URI to ' + newUri,
    original: originalBlock,
    expression: 'http.request.uri.path eq "/original-path"',
    guiSteps: [
      'Navigate to your zone in the Cloudflare dashboard',
      'Go to <strong>Rules</strong> → <strong>Transform Rules</strong>',
      'Select <strong>Rewrite URL</strong> tab',
      'Click <strong>Create rule</strong>',
      'Enter a descriptive rule name',
      'Set the filter expression to match the appropriate requests',
      'Under <strong>Path</strong>, select "Rewrite to..." and choose Static or Dynamic',
      'Enter the new path: <code>' + newUri + '</code>',
      'Click <strong>Deploy</strong>'
    ],
    apiCall: generateUrlRewriteApiCall(newUri),
    notes: 'URL Rewrite rules can use static values or dynamic expressions. For complex rewrites, consider using Cloudflare Snippets.'
  };
}

function createRequestHeaderInsertRule(headerName, headerValue, originalBlock) {
  return {
    type: 'Request Header Transform',
    name: 'Add request header: ' + headerName,
    original: 'HTTP::header insert "' + headerName + '" "' + headerValue + '"',
    expression: 'true',
    guiSteps: [
      'Navigate to your zone in the Cloudflare dashboard',
      'Go to <strong>Rules</strong> → <strong>Transform Rules</strong>',
      'Select <strong>Modify Request Header</strong> tab',
      'Click <strong>Create rule</strong>',
      'Enter a descriptive rule name',
      'Set the filter expression (or leave as "All incoming requests")',
      'Under <strong>Then</strong>, click <strong>Set header</strong>',
      'Header name: <code>' + headerName + '</code>',
      'Value: <code>' + headerValue + '</code>',
      'Click <strong>Deploy</strong>'
    ],
    apiCall: generateRequestHeaderApiCall('set', headerName, headerValue),
    notes: 'Use "Set" to add or overwrite the header. Use "Add" if you want to append without overwriting existing values.'
  };
}

function createRequestHeaderRemoveRule(headerName, originalBlock) {
  return {
    type: 'Request Header Transform',
    name: 'Remove request header: ' + headerName,
    original: 'HTTP::header remove "' + headerName + '"',
    expression: 'true',
    guiSteps: [
      'Navigate to your zone in the Cloudflare dashboard',
      'Go to <strong>Rules</strong> → <strong>Transform Rules</strong>',
      'Select <strong>Modify Request Header</strong> tab',
      'Click <strong>Create rule</strong>',
      'Enter a descriptive rule name',
      'Set the filter expression (or leave as "All incoming requests")',
      'Under <strong>Then</strong>, click <strong>Remove header</strong>',
      'Header name: <code>' + headerName + '</code>',
      'Click <strong>Deploy</strong>'
    ],
    apiCall: generateRequestHeaderApiCall('remove', headerName),
    notes: 'This will remove the specified header from all matching requests.'
  };
}

function createRequestHeaderReplaceRule(headerName, headerValue, originalBlock) {
  return {
    type: 'Request Header Transform',
    name: 'Replace request header: ' + headerName,
    original: 'HTTP::header replace "' + headerName + '" "' + headerValue + '"',
    expression: 'true',
    guiSteps: [
      'Navigate to your zone in the Cloudflare dashboard',
      'Go to <strong>Rules</strong> → <strong>Transform Rules</strong>',
      'Select <strong>Modify Request Header</strong> tab',
      'Click <strong>Create rule</strong>',
      'Enter a descriptive rule name',
      'Set the filter expression (or leave as "All incoming requests")',
      'Under <strong>Then</strong>, click <strong>Set header</strong>',
      'Header name: <code>' + headerName + '</code>',
      'Value: <code>' + headerValue + '</code>',
      'Click <strong>Deploy</strong>'
    ],
    apiCall: generateRequestHeaderApiCall('set', headerName, headerValue),
    notes: 'In Cloudflare, "Set" will replace any existing header value, functioning the same as F5\'s "replace" command.'
  };
}

function createResponseHeaderInsertRule(headerName, headerValue, originalBlock) {
  return {
    type: 'Response Header Transform',
    name: 'Add response header: ' + headerName,
    original: 'HTTP::header insert "' + headerName + '" "' + headerValue + '"',
    expression: 'true',
    guiSteps: [
      'Navigate to your zone in the Cloudflare dashboard',
      'Go to <strong>Rules</strong> → <strong>Transform Rules</strong>',
      'Select <strong>Modify Response Header</strong> tab',
      'Click <strong>Create rule</strong>',
      'Enter a descriptive rule name',
      'Set the filter expression (or leave as "All incoming requests")',
      'Under <strong>Then</strong>, click <strong>Set header</strong>',
      'Header name: <code>' + headerName + '</code>',
      'Value: <code>' + headerValue + '</code>',
      'Click <strong>Deploy</strong>'
    ],
    apiCall: generateResponseHeaderApiCall('set', headerName, headerValue),
    notes: 'Response headers are added to responses sent back to the client.'
  };
}

function createResponseHeaderRemoveRule(headerName, originalBlock) {
  return {
    type: 'Response Header Transform',
    name: 'Remove response header: ' + headerName,
    original: 'HTTP::header remove "' + headerName + '"',
    expression: 'true',
    guiSteps: [
      'Navigate to your zone in the Cloudflare dashboard',
      'Go to <strong>Rules</strong> → <strong>Transform Rules</strong>',
      'Select <strong>Modify Response Header</strong> tab',
      'Click <strong>Create rule</strong>',
      'Enter a descriptive rule name',
      'Set the filter expression (or leave as "All incoming requests")',
      'Under <strong>Then</strong>, click <strong>Remove header</strong>',
      'Header name: <code>' + headerName + '</code>',
      'Click <strong>Deploy</strong>'
    ],
    apiCall: generateResponseHeaderApiCall('remove', headerName),
    notes: 'This removes the specified header from responses.'
  };
}

function createOriginRule(operator, pattern, poolOrNode, originalBlock) {
  const cfExpression = convertConditionToExpression(operator, pattern);
  
  return {
    type: 'Origin Rule',
    name: 'Route ' + pattern + ' to ' + poolOrNode,
    original: extractRelevantBlock(originalBlock, pattern),
    expression: cfExpression,
    guiSteps: [
      'Navigate to your zone in the Cloudflare dashboard',
      'Go to <strong>Rules</strong> → <strong>Origin Rules</strong>',
      'Click <strong>Create rule</strong>',
      'Enter a descriptive rule name',
      'Set the filter expression to: <code>' + cfExpression + '</code>',
      'Under <strong>Destination overrides</strong>:',
      '  - Set <strong>Host Header</strong> to your origin hostname',
      '  - Set <strong>DNS override</strong> to resolve to your origin (replaces F5 pool: ' + poolOrNode + ')',
      'Optionally set the <strong>Destination Port</strong>',
      'Click <strong>Deploy</strong>'
    ],
    apiCall: generateOriginRuleApiCall(cfExpression, poolOrNode),
    notes: 'The F5 pool/node "' + poolOrNode + '" needs to be replaced with your actual origin hostname. Origin Rules allow you to route traffic to different backends based on conditions.'
  };
}

function createSnippetSuggestion(content) {
  const lines = content.trim().split('\n').slice(0, 15);
  const truncated = lines.join('\n') + (content.split('\n').length > 15 ? '\n...' : '');
  
  return {
    type: 'Snippet',
    name: 'Complex iRule - Use Cloudflare Snippet',
    original: truncated,
    expression: null,
    guiSteps: [
      'Navigate to your zone in the Cloudflare dashboard',
      'Go to <strong>Rules</strong> → <strong>Snippets</strong>',
      'Click <strong>Create snippet</strong>',
      'Enter a descriptive snippet name',
      'Write JavaScript code to implement the iRule logic',
      'Set the filter expression to target specific traffic',
      'Test the snippet using preview mode',
      'Click <strong>Deploy</strong>'
    ],
    apiCall: generateSnippetApiCall(),
    notes: 'This iRule contains complex logic that cannot be directly converted to declarative Cloudflare Rules. Use Cloudflare Snippets to implement custom JavaScript logic. Snippets provide similar flexibility to iRules for request/response manipulation.'
  };
}

function convertConditionToExpression(operator, pattern) {
  const normalizedOp = operator.toLowerCase();
  
  switch(normalizedOp) {
    case 'starts_with':
      return 'http.request.uri.path starts_with "' + pattern + '"';
    case 'ends_with':
      return 'http.request.uri.path ends_with "' + pattern + '"';
    case 'contains':
      return 'http.request.uri.path contains "' + pattern + '"';
    case 'equals':
    case 'equal':
    case '==':
    case 'eq':
      return 'http.request.uri.path eq "' + pattern + '"';
    default:
      return 'http.request.uri.path contains "' + pattern + '"';
  }
}

function extractRelevantBlock(block, pattern) {
  const lines = block.split('\n');
  const relevantLines = [];
  let braceCount = 0;
  let capturing = false;
  
  for (const line of lines) {
    if (line.includes(pattern) || capturing) {
      capturing = true;
      relevantLines.push(line);
      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;
      if (braceCount <= 0 && capturing && relevantLines.length > 1) {
        break;
      }
    }
  }
  
  return relevantLines.join('\n') || block.trim().substring(0, 200);
}

function generateRedirectApiCall(expression, targetUrl) {
  return `curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/rulesets/phases/http_request_dynamic_redirect/entrypoint" \\
  -H "Authorization: Bearer {api_token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "rules": [
      {
        "expression": "${expression.replace(/"/g, '\\"')}",
        "action": "redirect",
        "action_parameters": {
          "from_value": {
            "status_code": 302,
            "target_url": {
              "value": "${targetUrl}"
            }
          }
        },
        "description": "Migrated from F5 iRule"
      }
    ]
  }'`;
}

function generateUrlRewriteApiCall(newUri) {
  return `curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/rulesets/phases/http_request_transform/entrypoint" \\
  -H "Authorization: Bearer {api_token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "rules": [
      {
        "expression": "true",
        "action": "rewrite",
        "action_parameters": {
          "uri": {
            "path": {
              "value": "${newUri}"
            }
          }
        },
        "description": "Migrated from F5 iRule"
      }
    ]
  }'`;
}

function generateRequestHeaderApiCall(action, headerName, headerValue) {
  if (action === 'remove') {
    return `curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/rulesets/phases/http_request_late_transform/entrypoint" \\
  -H "Authorization: Bearer {api_token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "rules": [
      {
        "expression": "true",
        "action": "rewrite",
        "action_parameters": {
          "headers": {
            "${headerName}": {
              "operation": "remove"
            }
          }
        },
        "description": "Migrated from F5 iRule - Remove header"
      }
    ]
  }'`;
  }
  
  return `curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/rulesets/phases/http_request_late_transform/entrypoint" \\
  -H "Authorization: Bearer {api_token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "rules": [
      {
        "expression": "true",
        "action": "rewrite",
        "action_parameters": {
          "headers": {
            "${headerName}": {
              "operation": "set",
              "value": "${headerValue}"
            }
          }
        },
        "description": "Migrated from F5 iRule - Set header"
      }
    ]
  }'`;
}

function generateResponseHeaderApiCall(action, headerName, headerValue) {
  if (action === 'remove') {
    return `curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/rulesets/phases/http_response_headers_transform/entrypoint" \\
  -H "Authorization: Bearer {api_token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "rules": [
      {
        "expression": "true",
        "action": "rewrite",
        "action_parameters": {
          "headers": {
            "${headerName}": {
              "operation": "remove"
            }
          }
        },
        "description": "Migrated from F5 iRule - Remove response header"
      }
    ]
  }'`;
  }
  
  return `curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/rulesets/phases/http_response_headers_transform/entrypoint" \\
  -H "Authorization: Bearer {api_token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "rules": [
      {
        "expression": "true",
        "action": "rewrite",
        "action_parameters": {
          "headers": {
            "${headerName}": {
              "operation": "set",
              "value": "${headerValue}"
            }
          }
        },
        "description": "Migrated from F5 iRule - Set response header"
      }
    ]
  }'`;
}

function generateOriginRuleApiCall(expression, poolName) {
  return `curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/rulesets/phases/http_request_origin/entrypoint" \\
  -H "Authorization: Bearer {api_token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "rules": [
      {
        "expression": "${expression.replace(/"/g, '\\"')}",
        "action": "route",
        "action_parameters": {
          "host_header": "origin.example.com",
          "origin": {
            "host": "origin.example.com",
            "port": 443
          }
        },
        "description": "Migrated from F5 iRule - Origin: ${poolName}"
      }
    ]
  }'

# Note: Replace "origin.example.com" with your actual origin hostname
# The F5 pool "${poolName}" should be mapped to your Cloudflare origin settings`;
}

function generateSnippetApiCall() {
  return `# Snippets are managed via the dashboard or Terraform
# Documentation: https://developers.cloudflare.com/rules/snippets/

# Example Terraform configuration:
resource "cloudflare_snippet" "example" {
  zone_id = var.zone_id
  name    = "migrated-irule"
  main_file {
    name    = "main.js"
    content = <<-EOT
      export default {
        async fetch(request) {
          // Implement your iRule logic here
          const newHeaders = new Headers(request.headers);
          newHeaders.set('X-Custom-Header', 'value');
          
          return new Request(request.url, {
            method: request.method,
            headers: newHeaders,
            body: request.body
          });
        }
      }
    EOT
  }
}`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (url.pathname === '/api/convert' && request.method === 'POST') {
      try {
        const body = await request.json();
        const results = parseIRules(body.irules || '');
        return new Response(JSON.stringify(results), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    return new Response(HTML_TEMPLATE, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
};
