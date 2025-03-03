addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

// Configuration options
const config = {
  // Support multiple domains
  proxyDomains: ['webproxy.stratosphericus.workers.dev', 'proxy.liyao.space'],
  homepage: true, // Whether to enable the homepage
  // Domain whitelist, set to [] to allow all
  allowedDomains: [], 
}

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Check if the current domain is one of our proxy domains
  const isProxyHost = config.proxyDomains.includes(url.host)
  
  // If homepage is enabled and this is a root path request, return homepage
  if (config.homepage && url.pathname === '/' && isProxyHost) {
    return getHomePage()
  }

  let targetURL
  
  try {
    // Determine target URL
    if (isProxyHost) {
      // Extract target URL from path
      if (url.pathname === '/proxy' && url.searchParams.has('url')) {
        // Handle /proxy?url=https://example.com format
        const urlParam = url.searchParams.get('url')
        targetURL = new URL(urlParam)
      } else if (url.pathname.startsWith('/')) {
        // Handle /https://example.com format
        const path = url.pathname.substring(1)
        if (path.startsWith('http://') || path.startsWith('https://')) {
          targetURL = new URL(path)
        } else if (path) { // Ensure path is not empty
          // Handle relative path /example.com format, default to https
          targetURL = new URL('https://' + path)
        } else {
          // Empty path but not root path, possibly an error
          return new Response('Invalid URL request', { status: 400 })
        }
      }
    } else {
      // Use request URL directly
      targetURL = url
    }
    
    // Check domain whitelist
    if (config.allowedDomains.length > 0) {
      const isAllowed = config.allowedDomains.some(domain => 
        targetURL.hostname === domain || targetURL.hostname.endsWith(`.${domain}`)
      )
      if (!isAllowed) {
        return new Response('Domain not in whitelist', { status: 403 })
      }
    }
  } catch (error) {
    return new Response(`URL parsing error: ${error.message}`, { 
      status: 400, 
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
    })
  }

  // Prepare request headers
  let newHeaders = new Headers(request.headers)
  newHeaders.set('Host', targetURL.host)
  newHeaders.set('Referer', targetURL.href)

  // Create new request
  let newRequest = new Request(targetURL, {
    method: request.method,
    headers: newHeaders,
    body: request.body,
    redirect: 'manual', // Handle redirects manually
  })

  try {
    // Send request to target server
    let response = await fetch(newRequest)
    
    // Handle redirects
    let newRespHeaders = new Headers(response.headers)
    if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
      const location = newRespHeaders.get('Location')
      if (location) {
        try {
          // Handle absolute and relative URLs
          const redirectURL = new URL(location, targetURL)
          // Build new proxy URL, using current accessed domain
          const currentProxyDomain = url.host
          const newLocation = `https://${currentProxyDomain}/${redirectURL.href}`
          newRespHeaders.set('Location', newLocation)
        } catch (error) {
          console.error('Redirect URL processing error:', error)
        }
      }
    }
    
    // Modify CORS related headers
    newRespHeaders.delete('Content-Security-Policy')
    newRespHeaders.delete('Content-Security-Policy-Report-Only')
    newRespHeaders.set('Access-Control-Allow-Origin', '*')
    newRespHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    newRespHeaders.set('Access-Control-Allow-Headers', '*')
    
    // Create new response object
    let newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newRespHeaders
    })
    
    // Rewrite links in HTML content
    const contentType = newRespHeaders.get('Content-Type') || ''
    if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
      // Use current accessed domain as proxy domain
      const currentProxyDomain = url.host
      
      newResponse = new HTMLRewriter()
        .on('a[href]', new LinkRewriter(targetURL, 'href', currentProxyDomain))
        .on('form[action]', new LinkRewriter(targetURL, 'action', currentProxyDomain))
        .on('img[src]', new LinkRewriter(targetURL, 'src', currentProxyDomain))
        .on('link[href]', new LinkRewriter(targetURL, 'href', currentProxyDomain))
        .on('script[src]', new LinkRewriter(targetURL, 'src', currentProxyDomain))
        .transform(newResponse)
    }
    
    return newResponse
  } catch (error) {
    return new Response(`Proxy request failed: ${error.message}`, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}

// Unified link rewrite handling
class LinkRewriter {
  constructor(baseURL, attributeName, proxyDomain) {
    this.baseURL = baseURL
    this.attributeName = attributeName
    this.proxyDomain = proxyDomain
  }
  
  element(element) {
    const attributeValue = element.getAttribute(this.attributeName)
    if (!attributeValue) return
    
    try {
      // Build complete URL (handle relative paths)
      const absoluteURL = new URL(attributeValue, this.baseURL)
      
      // Rewrite as proxy URL, using current accessed domain
      const newURL = `https://${this.proxyDomain}/${absoluteURL.href}`
      element.setAttribute(this.attributeName, newURL)
    } catch (e) {
      // If URL is invalid, keep it as is
      console.error(`URL rewrite error [${attributeValue}]:`, e)
    }
  }
}

// Return simple homepage HTML
function getHomePage() {
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Web Proxy Service</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      text-align: center;
      line-height: 1.6;
    }
    h1 {
      color: #333;
      margin: 20px 0;
    }
    form {
      margin: 30px 0;
    }
    input[type="url"] {
      width: 100%;
      padding: 10px;
      font-size: 16px;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-sizing: border-box;
      margin-bottom: 10px;
    }
    button {
      background: #4a89dc;
      color: white;
      border: none;
      padding: 10px 20px;
      font-size: 16px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.3s;
    }
    button:hover {
      background: #3b7dd8;
    }
    .example {
      color: #666;
      font-size: 14px;
      margin: 15px 0;
    }
  </style>
</head>
<body>
  <h1>Web Proxy Service</h1>
  <p>Enter the URL you want to visit through this proxy</p>
  
  <form id="proxyForm" onsubmit="navigateToProxy(event)">
    <input type="url" id="urlInput" placeholder="https://example.com" required>
    <button type="submit">Access</button>
  </form>
  
  <p class="example">Example: https://example.com</p>
  
  <script>
    function navigateToProxy(e) {
      e.preventDefault();
      const url = document.getElementById('urlInput').value.trim();
      if (url) {
        window.location.href = '/' + url;
      }
    }
    
    // Auto-focus on input field
    document.getElementById('urlInput').focus();
  </script>
</body>
</html>`, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'no-cache'
    }
  })
}
