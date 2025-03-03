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
  // Browser emulation settings
  browserEmulation: {
    // Common desktop browser user agent
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    acceptLanguage: 'en-US,en;q=0.9',
    acceptEncoding: 'gzip, deflate, br',
    connection: 'keep-alive',
    upgradeInsecureRequests: '1',
    secFetchDest: 'document',
    secFetchMode: 'navigate',
    secFetchSite: 'none',
    secFetchUser: '?1',
  },
  // Fallback options for failed requests
  fallback: {
    enabled: true,
    // If true, will add JS to try loading resources directly when proxy fails
    autoReload: true,
  }
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

  // Prepare request headers to emulate a real browser
  let newHeaders = new Headers()
  
  // Copy select headers from the original request
  const headersToKeep = [
    'cookie', 
    'range',
    'if-none-match',
    'if-modified-since',
    'content-type',
    'content-length'
  ]
  
  headersToKeep.forEach(header => {
    if (request.headers.has(header)) {
      newHeaders.set(header, request.headers.get(header))
    }
  })

  // Add browser emulation headers
  newHeaders.set('User-Agent', config.browserEmulation.userAgent)
  newHeaders.set('Accept', config.browserEmulation.accept)
  newHeaders.set('Accept-Language', config.browserEmulation.acceptLanguage)
  newHeaders.set('Accept-Encoding', config.browserEmulation.acceptEncoding)
  newHeaders.set('Connection', config.browserEmulation.connection)
  newHeaders.set('Upgrade-Insecure-Requests', config.browserEmulation.upgradeInsecureRequests)
  newHeaders.set('Sec-Fetch-Dest', config.browserEmulation.secFetchDest)
  newHeaders.set('Sec-Fetch-Mode', config.browserEmulation.secFetchMode)
  newHeaders.set('Sec-Fetch-Site', config.browserEmulation.secFetchSite)
  newHeaders.set('Sec-Fetch-User', config.browserEmulation.secFetchUser)
  
  // Essential headers for the target site
  newHeaders.set('Host', targetURL.host)
  newHeaders.set('Origin', targetURL.origin)
  newHeaders.set('Referer', targetURL.href)
  
  // Check if this is XHR/fetch request from the browser
  const isXHR = request.headers.get('X-Requested-With') === 'XMLHttpRequest' || 
                request.headers.get('Accept')?.includes('application/json');
  
  if (isXHR) {
    newHeaders.set('X-Requested-With', 'XMLHttpRequest')
  }

  // Create new request
  let newRequest = new Request(targetURL, {
    method: request.method,
    headers: newHeaders,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
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
    
    // Copy all response cookies
    const setCookieHeaders = response.headers.getAll ? response.headers.getAll('Set-Cookie') : null
    if (setCookieHeaders) {
      // Multiple cookie support for browsers
      setCookieHeaders.forEach(cookie => {
        newRespHeaders.append('Set-Cookie', cookie)
      })
    }
    
    // Modify CORS related headers
    newRespHeaders.delete('Content-Security-Policy')
    newRespHeaders.delete('Content-Security-Policy-Report-Only')
    newRespHeaders.delete('X-Frame-Options') // Allow framing
    newRespHeaders.delete('X-Content-Type-Options') // Remove nosniff
    newRespHeaders.set('Access-Control-Allow-Origin', '*')
    newRespHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
    newRespHeaders.set('Access-Control-Allow-Headers', '*')
    newRespHeaders.set('Access-Control-Allow-Credentials', 'true')
    
    // Create new response object
    let newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newRespHeaders
    })
    
    // Get content type
    const contentType = newRespHeaders.get('Content-Type') || ''
    
    // Rewrite links in HTML content
    if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
      // Use current accessed domain as proxy domain
      const currentProxyDomain = url.host
      
      let rewriter = new HTMLRewriter()
        .on('a[href]', new LinkRewriter(targetURL, 'href', currentProxyDomain))
        .on('form[action]', new LinkRewriter(targetURL, 'action', currentProxyDomain))
        .on('img[src]', new LinkRewriter(targetURL, 'src', currentProxyDomain))
        .on('link[href]', new LinkRewriter(targetURL, 'href', currentProxyDomain))
        .on('script[src]', new LinkRewriter(targetURL, 'src', currentProxyDomain))
        .on('iframe[src]', new LinkRewriter(targetURL, 'src', currentProxyDomain))
        .on('source[src]', new LinkRewriter(targetURL, 'src', currentProxyDomain))
        .on('video[src]', new LinkRewriter(targetURL, 'src', currentProxyDomain))
        .on('audio[src]', new LinkRewriter(targetURL, 'src', currentProxyDomain))
        .on('embed[src]', new LinkRewriter(targetURL, 'src', currentProxyDomain))
        .on('object[data]', new LinkRewriter(targetURL, 'data', currentProxyDomain))
        .on('track[src]', new LinkRewriter(targetURL, 'src', currentProxyDomain))
        .on('meta[content]', new MetaContentRewriter(targetURL, currentProxyDomain))
      
      // Handle base tag
      rewriter = rewriter.on('base[href]', new BaseTagRewriter(targetURL, currentProxyDomain))
      
      // Handle inline styles and attributes with URLs
      rewriter = rewriter.on('*[style]', new StyleAttributeRewriter(targetURL, currentProxyDomain))
      
      // Inject scripts for fallback mechanism if enabled
      if (config.fallback.enabled && config.fallback.autoReload) {
        rewriter = rewriter.on('head', new HeadRewriter(targetURL.href))
      }
      
      newResponse = rewriter.transform(newResponse)
    }
    // Handle CSS content separately to rewrite URLs
    else if (contentType.includes('text/css')) {
      const currentProxyDomain = url.host
      const cssText = await response.text()
      const rewrittenCSS = rewriteCSS(cssText, targetURL, currentProxyDomain)
      
      newResponse = new Response(rewrittenCSS, {
        status: response.status,
        statusText: response.statusText,
        headers: newRespHeaders
      })
    }
    
    return newResponse
  } catch (error) {
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Proxy Error</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          .error-container {
            background-color: #f8d7da;
            color: #721c24;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
          }
          .direct-access {
            background-color: #d4edda;
            color: #155724;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
          }
          h1 { color: #d63031; }
          a.direct-link {
            display: inline-block;
            margin-top: 10px;
            color: #fff;
            background-color: #17a2b8;
            padding: 8px 16px;
            text-decoration: none;
            border-radius: 4px;
          }
          a.direct-link:hover {
            background-color: #138496;
          }
          .details {
            background-color: #f8f9fa;
            padding: 15px;
            border-radius: 4px;
            margin-top: 20px;
            font-family: monospace;
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body>
        <h1>Proxy Request Failed</h1>
        <div class="error-container">
          <strong>Error:</strong> ${error.message}
        </div>
        
        <div class="direct-access">
          <p>The proxy couldn't reach the requested resource. You can try to access it directly:</p>
          <a class="direct-link" href="${targetURL.href}" target="_blank">Open ${targetURL.href} directly</a>
        </div>
        
        <div class="details">
          Request URL: ${targetURL.href}
          Time: ${new Date().toISOString()}
        </div>
      </body>
      </html>
    `, {
      status: 500,
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}

// Unified link rewrite handling with better URL handling
class LinkRewriter {
  constructor(baseURL, attributeName, proxyDomain) {
    this.baseURL = baseURL
    this.attributeName = attributeName
    this.proxyDomain = proxyDomain
  }
  
  element(element) {
    const attributeValue = element.getAttribute(this.attributeName)
    if (!attributeValue || attributeValue.startsWith('data:') || attributeValue.startsWith('javascript:')) return
    
    // Don't modify already proxied URLs
    if (attributeValue.startsWith(`https://${this.proxyDomain}/`)) return
    
    try {
      // Handle special URL cases for files, media, etc.
      let normalizedValue = attributeValue.trim()
      if (normalizedValue.startsWith('//')) {
        // Protocol-relative URL
        normalizedValue = this.baseURL.protocol + normalizedValue
      }
      
      // Build complete URL (handle relative paths)
      const absoluteURL = new URL(normalizedValue, this.baseURL)
      
      // Add onerror fallback for images
      if (this.attributeName === 'src' && element.tagName === 'img') {
        const originalSrc = absoluteURL.href
        element.setAttribute('data-original-src', originalSrc)
        element.setAttribute('onerror', `this.onerror=null;if(this.src!==this.dataset.originalSrc){this.src=this.dataset.originalSrc;}`)
      }
      
      // Rewrite as proxy URL, using current accessed domain
      const newURL = `https://${this.proxyDomain}/${absoluteURL.href}`
      element.setAttribute(this.attributeName, newURL)
    } catch (e) {
      // If URL is invalid, keep it as is
      console.error(`URL rewrite error [${attributeValue}]:`, e)
    }
  }
}

// Handle meta refresh and other meta tags with URLs
class MetaContentRewriter {
  constructor(baseURL, proxyDomain) {
    this.baseURL = baseURL
    this.proxyDomain = proxyDomain
  }
  
  element(element) {
    const httpEquiv = element.getAttribute('http-equiv')
    const content = element.getAttribute('content')
    
    if (httpEquiv && httpEquiv.toLowerCase() === 'refresh' && content) {
      // Handle meta refresh redirects
      const parts = content.split(';url=')
      if (parts.length === 2) {
        try {
          const url = new URL(parts[1], this.baseURL)
          const newURL = `https://${this.proxyDomain}/${url.href}`
          element.setAttribute('content', `${parts[0]};url=${newURL}`)
        } catch (e) {
          console.error(`Meta refresh URL rewrite error:`, e)
        }
      }
    }
    
    // Handle Open Graph and other meta tags
    const property = element.getAttribute('property') || element.getAttribute('name')
    if (property && content && 
       (property.includes('og:image') || 
        property.includes('og:url') || 
        property.includes('twitter:image'))) {
      try {
        const url = new URL(content, this.baseURL)
        const newURL = `https://${this.proxyDomain}/${url.href}`
        element.setAttribute('content', newURL)
      } catch (e) {
        console.error(`Meta tag URL rewrite error:`, e)
      }
    }
  }
}

// Handle base tag to ensure relative URLs work correctly
class BaseTagRewriter {
  constructor(baseURL, proxyDomain) {
    this.baseURL = baseURL
    this.proxyDomain = proxyDomain
  }
  
  element(element) {
    const href = element.getAttribute('href')
    if (href) {
      try {
        const url = new URL(href, this.baseURL)
        const newURL = `https://${this.proxyDomain}/${url.href}`
        element.setAttribute('href', newURL)
      } catch (e) {
        console.error(`Base tag URL rewrite error:`, e)
      }
    }
  }
}

// Handle style attributes with URLs
class StyleAttributeRewriter {
  constructor(baseURL, proxyDomain) {
    this.baseURL = baseURL
    this.proxyDomain = proxyDomain
  }
  
  element(element) {
    const style = element.getAttribute('style')
    if (!style) return
    
    const rewrittenStyle = rewriteCSS(style, this.baseURL, this.proxyDomain)
    element.setAttribute('style', rewrittenStyle)
  }
}

// Helper function to rewrite URLs in CSS
function rewriteCSS(css, baseURL, proxyDomain) {
  // Match url(...) in CSS
  return css.replace(/url\((['"]?)([^'")]+)(['"]?)\)/g, (match, quote1, url, quote2) => {
    if (url.startsWith('data:')) return match
    
    try {
      const absoluteURL = new URL(url, baseURL)
      return `url(${quote1}https://${proxyDomain}/${absoluteURL.href}${quote2})`
    } catch (e) {
      return match
    }
  })
}

// Inject fallback scripts in the head
class HeadRewriter {
  constructor(originalURL) {
    this.originalURL = originalURL
  }
  
  element(element) {
    element.append(`
      <script>
        // Add fallback mechanism for images and other resources that fail to load
        document.addEventListener('DOMContentLoaded', function() {
          // Fallback for images
          document.querySelectorAll('img').forEach(img => {
            if (!img.hasAttribute('data-original-src')) {
              const originalSrc = new URL(img.src).pathname.slice(1);
              img.setAttribute('data-original-src', originalSrc);
              img.setAttribute('onerror', "this.onerror=null;if(this.src!==this.dataset.originalSrc){this.src=this.dataset.originalSrc;}");
            }
          });
          
          // Enhance behavior for links opening in new tabs
          document.querySelectorAll('a[target="_blank"]').forEach(link => {
            // Get the original URL from the proxy URL
            let originalUrl = link.href;
            if (originalUrl.includes('/${this.originalURL.split('/')[2]}/')) {
              try {
                const parts = new URL(originalUrl).pathname.split('/');
                parts.shift(); // Remove empty first element
                originalUrl = parts.join('/');
              } catch(e) {}
            }
            
            // Add event to capture click and modify behavior
            link.addEventListener('click', function(e) {
              // Allow middle-click and ctrl+click to work normally
              if (e.button !== 0 || e.ctrlKey || e.metaKey) return;
              
              e.preventDefault();
              link.setAttribute('rel', 'noreferrer noopener');
              window.open(link.href, '_blank');
            });
          });
        });
      </script>
    `, {html: true});
  }
}

// Return enhanced homepage HTML
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
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      text-align: center;
      line-height: 1.6;
      color: #333;
      background-color: #f8f9fa;
    }
    .container {
      background-color: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    h1 {
      color: #2c3e50;
      margin: 20px 0;
    }
    form {
      margin: 30px 0;
    }
    .input-group {
      width: 100%;
      display: flex;
      margin-bottom: 15px;
    }
    input[type="url"] {
      flex: 1;
      padding: 12px;
      font-size: 16px;
      border: 1px solid #ddd;
      border-radius: 4px 0 0 4px;
      box-sizing: border-box;
    }
    button {
      background: #3498db;
      color: white;
      border: none;
      padding: 12px 20px;
      font-size: 16px;
      border-radius: 0 4px 4px 0;
      cursor: pointer;
      transition: background 0.3s;
    }
    button:hover {
      background: #2980b9;
    }
    .example {
      color: #7f8c8d;
      font-size: 14px;
      margin: 15px 0;
    }
    .features {
      background-color: #ecf0f1;
      padding: 20px;
      border-radius: 8px;
      margin-top: 30px;
      text-align: left;
    }
    .features h2 {
      font-size: 20px;
      margin-top: 0;
      color: #2c3e50;
    }
    .features ul {
      padding-left: 20px;
    }
    .features li {
      margin: 8px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Web Proxy Service</h1>
    <p>Browse websites privately through this proxy service</p>
    
    <form id="proxyForm" onsubmit="navigateToProxy(event)">
      <div class="input-group">
        <input type="url" id="urlInput" placeholder="https://example.com" required>
        <button type="submit">Access</button>
      </div>
    </form>
    
    <p class="example">Examples: https://en.wikipedia.org, https://news.ycombinator.com</p>
    
    <div class="features">
      <h2>Welcome!</h2>
      <ul>
        <li>Browse websites anonymously</li>
        <li>Bypass network restrictions</li>
      </ul>
    </div>
  </div>
  
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
    
    // Handle paste events to clean URLs
    document.getElementById('urlInput').addEventListener('paste', function(e) {
      // Let the paste happen naturally, then clean it after
      setTimeout(function() {
        const url = e.target.value.trim();
        e.target.value = url.replace(/\\s+/g, '');
      }, 0);
    });
  </script>
</body>
</html>`, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'no-cache'
    }
  })
}
