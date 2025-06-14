addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

// Configuration options
const config = {
  // Support multiple domains, you should modifiy this if you wish to deploy it to your own Cloudflare Worker.
  proxyDomains: ['webproxy.stratosphericus.workers.dev', 'proxy.liyao.space'],
  separator: '------', // Delimiter between worker path and real target URL
  homepage: true, // Whether to enable the homepage
  allowedDomains: [], // Domain whitelist, set to [] to allow all

  
  // Browser emulation settings
  browserEmulation: {
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
  fallback: {
    enabled: true,
    autoReload: true,
  },
  specialSites: {
    wikipedia: {
      enabled: true,
      domains: ['wikipedia.org', 'wikimedia.org', 'mediawiki.org']
    }
  }
}

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Check if the current domain is one of our proxy domains
  const isProxyHost = config.proxyDomains.includes(url.host)
  
  // If the request is for the proxy root
  if (isProxyHost && url.pathname === '/') {
    // a) When no query-string is present we treat it as a genuine homepage request
    if (config.homepage && !url.search) {
      return getHomePage()
    }

    /*
      b) When a query-string exists (e.g. "/?q=search" coming from a proxied
      site like DuckDuckGo) we attempt to determine the intended target by
      inspecting the Referer header, which still contains the full proxied
      URL including the original host. Using that information we rebuild the
      real destination so the request will be forwarded correctly instead of
      falling back to the homepage.
    */
    if (url.search) {
      const ref = request.headers.get('Referer') || ''
      try {
        const refURL = new URL(ref)
        const rawPath = refURL.pathname.substring(1)
        const sep = config.separator
        let path = rawPath
        if (rawPath.startsWith(sep)) {
          path = rawPath.substring(sep.length)
        }
        const inner = path
        if (inner.startsWith('http://') || inner.startsWith('https://')) {
          const base = new URL(inner)
          const targetStr = `${base.origin}${url.search}` // e.g. https://duckduckgo.com/?q=foo
          url.pathname = '/' + config.separator + targetStr
        }
      } catch (_) {
        /* ignore – fallback handled later */
      }
    }
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
        // Handle /------https://example.com format
        const rawPath = url.pathname.substring(1)
        const sep = config.separator
        let path = rawPath
        if (rawPath.startsWith(sep)) {
          path = rawPath.substring(sep.length)
        }
        if (path.startsWith('http://') || path.startsWith('https://')) {
          targetURL = new URL(path)
        } else if (path) {
          /*
            Handle relative paths such as "/i.js" or "/next/page" that
            originate from within the currently proxied site.  We first try to
            reconstruct the full base URL from the Referer header (if present)
            so we can resolve the relative path accurately.
          */
          let resolved = null
          const ref = request.headers.get('Referer') || ''
          if (ref.startsWith(`https://${url.host}/`)) {
            let refInner = ref.substring(`https://${url.host}/`.length)
            if (refInner.startsWith(config.separator)) refInner = refInner.substring(config.separator.length)
            if (refInner.startsWith('http://') || refInner.startsWith('https://')) {
              try {
                const baseRefURL = new URL(refInner)
                resolved = new URL(path, baseRefURL) // relative resolution
              } catch {}
            }
          }
          if (resolved) {
            targetURL = resolved
          } else {
            // Try to rebuild using Referer (root-relative request like "/?q=...")
            let rebuilt = null
            const ref = request.headers.get('Referer') || ''
            if (ref.startsWith(`https://${url.host}/`)) {
              let refInner = ref.substring(`https://${url.host}/`.length)
              if (refInner.startsWith(config.separator)) refInner = refInner.substring(config.separator.length)
              if (refInner.startsWith('http://') || refInner.startsWith('https://')) {
                try {
                  const baseOrigin = new URL(refInner).origin
                  const rebuiltStr = `${baseOrigin}/${url.search.startsWith('?') ? url.search.substring(1) : url.search}`
                  rebuilt = new URL(rebuiltStr)
                } catch {}
              }
            }
            
            if (rebuilt) {
              targetURL = rebuilt
              // No need to modify pathname further
            } else if (!path.includes('.') && url.search === '') {
              // This is a plain keyword with no search string
              targetURL = new URL('https://duckduckgo.com/?q=' + encodeURIComponent(path))
            } else if (!path.includes('.')) {
              // Plain keyword + existing search parameters appended to keyword search
              const q = encodeURIComponent(path)
              const ddg = new URL('https://duckduckgo.com/?q=' + q + '&' + url.search.substring(1))
              targetURL = ddg
            } else if (url.searchParams.has('q')) {
              // Fallback to DuckDuckGo search when 'q' parameter present
              const ddgURL = new URL('https://duckduckgo.com/')
              url.searchParams.forEach((value, key) => ddgURL.searchParams.append(key, value))
              targetURL = ddgURL
            } else {
              // Treat as domain with implied https
              try {
                targetURL = new URL('https://' + path)
              } catch {
                return new Response('Invalid URL request', { status: 400 })
              }
            }
          }
        } else {
          /*
            Empty path but we might still have a query-string. Many sites such as
            DuckDuckGo use root-relative URLs like "https://duckduckgo.com/?q=foo".
            When a proxied page generates such a link we will receive a request
            for "/?q=foo". If this happens – and there is no Referer we can use
            to restore the full URL (handled earlier) – we treat it as a DuckDuckGo
            search request by default so users aren't thrown back to an error page.
          */
          if (url.searchParams.has('q')) {
            // Preserve all parameters so that bangs etc. keep working
            const ddgURL = new URL('https://duckduckgo.com/')
            url.searchParams.forEach((value, key) => ddgURL.searchParams.append(key, value))
            targetURL = ddgURL
          } else {
            // Empty path with no query – invalid usage
            return new Response('Invalid URL request', { status: 400 })
          }
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

  // Check if this is a Wikipedia/Wikimedia site
  const isWikipediaSite = config.specialSites.wikipedia.enabled && 
    config.specialSites.wikipedia.domains.some(domain => 
      targetURL.hostname.endsWith(domain));

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
          // Build new proxy URL, using current accessed domain and custom separator
          const currentProxyDomain = url.host
          const newLocation = `https://${currentProxyDomain}/${config.separator}${redirectURL.href}`
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
        .on('img[srcset]', new SrcsetRewriter(targetURL, currentProxyDomain))
        .on('source[srcset]', new SrcsetRewriter(targetURL, currentProxyDomain))
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
      
      // Add Wikipedia specific handlers if needed
      if (isWikipediaSite) {
        // Wikipedia uses data-src for lazy loading
        rewriter = rewriter.on('img[data-src]', new LinkRewriter(targetURL, 'data-src', currentProxyDomain))
        // Handle Wikipedia's specific style elements
        rewriter = rewriter.on('style', new StyleElementRewriter(targetURL, currentProxyDomain))
      }
      
      // Inject scripts for fallback mechanism if enabled
      if (config.fallback.enabled && config.fallback.autoReload) {
        rewriter = rewriter.on('head', new HeadRewriter(targetURL.href))
      }
      
      newResponse = rewriter.transform(newResponse)
    }
    // Handle CSS content separately to rewrite URLs
    else if (contentType.includes('text/css') || contentType.includes('application/x-stylesheet')) {
      const currentProxyDomain = url.host
      const cssText = await response.text()
      const rewrittenCSS = rewriteCSS(cssText, targetURL, currentProxyDomain)
      
      newResponse = new Response(rewrittenCSS, {
        status: response.status,
        statusText: response.statusText,
        headers: newRespHeaders
      })
    }
    // Handle JavaScript to rewrite URLs directly embedded in code
    else if (contentType.includes('application/javascript') || contentType.includes('text/javascript')) {
      const currentProxyDomain = url.host
      const jsText = await response.text()
      
      // Very simplified JS URL rewriting - this could be enhanced
      const rewrittenJS = rewriteJavaScript(jsText, targetURL, currentProxyDomain)
      
      newResponse = new Response(rewrittenJS, {
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
      
      // Rewrite as proxy URL, using current accessed domain and custom separator
      const newURL = `https://${this.proxyDomain}/${config.separator}${absoluteURL.href}`
      element.setAttribute(this.attributeName, newURL)
    } catch (e) {
      // If URL is invalid, keep it as is
      console.error(`URL rewrite error [${attributeValue}]:`, e)
    }
  }
}

// Handle srcset attribute used in responsive images
class SrcsetRewriter {
  constructor(baseURL, proxyDomain) {
    this.baseURL = baseURL
    this.proxyDomain = proxyDomain
  }
  
  element(element) {
    const srcset = element.getAttribute('srcset')
    if (!srcset) return
    
    try {
      // Split the srcset attribute by commas, taking care of spaces
      const srcsetParts = srcset.split(/,\s+/)
      const newSrcsetParts = srcsetParts.map(part => {
        // Each part is in format "url size"
        const [url, size] = part.trim().split(/\s+/)
        if (!url) return part
        
        // Skip data URLs
        if (url.startsWith('data:')) return part
        
        // Don't modify already proxied URLs
        if (url.startsWith(`https://${this.proxyDomain}/`)) return part
        
        try {
          // Handle protocol-relative URLs
          let normalizedUrl = url
          if (normalizedUrl.startsWith('//')) {
            normalizedUrl = this.baseURL.protocol + normalizedUrl
          }
          
          // Convert to absolute URL
          const absoluteURL = new URL(normalizedUrl, this.baseURL)
          
          // Create new proxied URL
          const newURL = `https://${this.proxyDomain}/${config.separator}${absoluteURL.href}`
          
          // Return new URL with size if exists
          return size ? `${newURL} ${size}` : newURL
        } catch (e) {
          return part // Keep original if can't parse
        }
      })
      
      // Set the new srcset attribute
      element.setAttribute('srcset', newSrcsetParts.join(', '))
    } catch (e) {
      console.error(`Srcset rewrite error:`, e)
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
          const newURL = `https://${this.proxyDomain}/${config.separator}${url.href}`
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
        const newURL = `https://${this.proxyDomain}/${config.separator}${url.href}`
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
        const newURL = `https://${this.proxyDomain}/${config.separator}${url.href}`
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

// Handle style elements with CSS content
class StyleElementRewriter {
  constructor(baseURL, proxyDomain) {
    this.baseURL = baseURL
    this.proxyDomain = proxyDomain
  }
  
  element(element) {
    // We need to rewrite all URLs in the style element
    element.onEndTag(endTag => {
      element.replace(endTag.before + endTag.name + endTag.after)
    })
  }
  
  text(text) {
    // Rewrite URLs in the CSS text content
    const rewrittenCSS = rewriteCSS(text.text, this.baseURL, this.proxyDomain)
    text.replace(rewrittenCSS)
  }
}

// Helper function to rewrite URLs in CSS with improved handling
function rewriteCSS(css, baseURL, proxyDomain) {
  if (!css) return css
  
  // First handle @import statements
  css = css.replace(/@import\s+(?:url\(\s*['"]?([^'")]+)['"]?\s*\)|['"]([^'"]+)['"]).*/g, 
    function(match, urlMatch, directMatch) {
      const importUrl = urlMatch || directMatch
      if (!importUrl) return match
      if (importUrl.startsWith('data:')) return match
      if (importUrl.startsWith(`https://${proxyDomain}/`)) return match
      
      try {
        let normalizedUrl = importUrl
        if (normalizedUrl.startsWith('//')) {
          normalizedUrl = baseURL.protocol + normalizedUrl
        }
        
        const absoluteURL = new URL(normalizedUrl, baseURL)
        return match.replace(importUrl, `https://${proxyDomain}/${config.separator}${absoluteURL.href}`)
      } catch (e) {
        return match
      }
    }
  )
  
  // Handle url() patterns
  css = css.replace(/url\(\s*(['"]?)([^'")]+)(['"]?)\s*\)/g, 
    function(match, quote1, url, quote2) {
      if (!url) return match
      if (url.startsWith('data:')) return match
      if (url.startsWith(`https://${proxyDomain}/`)) return match
      
      try {
        let normalizedUrl = url
        if (normalizedUrl.startsWith('//')) {
          normalizedUrl = baseURL.protocol + normalizedUrl
        }
        
        const absoluteURL = new URL(normalizedUrl, baseURL)
        return `url(${quote1}https://${proxyDomain}/${config.separator}${absoluteURL.href}${quote2})`
      } catch (e) {
        return match
      }
    }
  )
  
  // Handle image-set() CSS function used in some modern websites
  css = css.replace(/image-set\(\s*(?:[^)]|(?:\([^)]*\)))+\)/g, 
    function(match) {
      return match.replace(/url\(\s*(['"]?)([^'")]+)(['"]?)\s*\)/g, 
        function(urlMatch, quote1, url, quote2) {
          if (!url) return urlMatch
          if (url.startsWith('data:')) return urlMatch
          if (url.startsWith(`https://${proxyDomain}/`)) return urlMatch
          
          try {
            let normalizedUrl = url
            if (normalizedUrl.startsWith('//')) {
              normalizedUrl = baseURL.protocol + normalizedUrl
            }
            
            const absoluteURL = new URL(normalizedUrl, baseURL)
            return `url(${quote1}https://${proxyDomain}/${config.separator}${absoluteURL.href}${quote2})`
          } catch (e) {
            return urlMatch
          }
        }
      )
    }
  )
  
  return css
}

// Basic JavaScript URL rewriting
function rewriteJavaScript(js, baseURL, proxyDomain) {
  if (!js) return js
  
  // This is a very simplified approach and might not catch all cases
  // A proper solution would require JS parsing, which is complex
  
  // Replace absolute URLs in common patterns
  return js.replace(/'(https?:\/\/[^']+)'/g, function(match, url) {
    if (url.startsWith(`https://${proxyDomain}/`)) return match
    try {
      return `'https://${proxyDomain}/${config.separator}${url}'`
    } catch (e) {
      return match
    }
  }).replace(/"(https?:\/\/[^"]+)"/g, function(match, url) {
    if (url.startsWith(`https://${proxyDomain}/`)) return match
    try {
      return `"https://${proxyDomain}/${config.separator}${url}"`
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
          
          // Add Wikipedia specific fixes
          if (document.querySelector('body.mediawiki')) {
            // Force load lazy images
            document.querySelectorAll('img[data-src]').forEach(img => {
              if (!img.src && img.dataset.src) {
                img.src = img.dataset.src;
              }
            });
            
            // Fix any inline styles with backgrounds
            document.querySelectorAll('[style*="background"]').forEach(el => {
              // Handle any broken background images
              if (el.style.backgroundImage) {
                el.setAttribute('data-original-bg', el.style.backgroundImage);
              }
            });
          }
        });
      </script>
    `, {html: true});
  }
}

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
    input[type="text"] {
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
        <input type="text" id="urlInput" placeholder="https://example.com" autocomplete="off">
        <button type="submit">Access</button>
      </div>
    </form>
    
    <p class="example">
    Examples: 
    <a href="https://proxy.liyao.space/------https://www.tsukuba.ac.jp/">tsukuba.ac.jp</a>, 
    <a href="https://proxy.liyao.space/------https://www.jlu.edu.cn/">jlu.edu.cn</a>, 
    <a href="https://proxy.liyao.space/------https://news.ycombinator.com">ycombinator.com</a>, 
    <a href="https://proxy.liyao.space/------https://www.example.com">example.com</a>, 
    <a href="https://github.com/BH3GEI/CloudflareWorkerProxy">Github Repo</a>
</p>

    <div class="features">
      <h2>Welcome! Using this site, you can:</h2>
      <ul>
        <li>Browse websites anonymously</li>
        <li>Bypass some network restrictions</li>
        <li>Do some tests for your site</li>

      </ul>
    </div>
  </div>
  
  <script>
    function navigateToProxy(e) {
      e.preventDefault();
      const input = document.getElementById('urlInput').value.trim();
      if (!input) return;
      const hasScheme = /^https?:\/\//i.test(input);
      const looksLikeDomain = input.includes('.') && !input.startsWith(' ');
      let target;
      if (hasScheme) {
        target = input;
      } else if (looksLikeDomain) {
        target = 'https://' + input;
      } else {
        // Treat as search keyword
        const q = encodeURIComponent(input);
        target = 'https://duckduckgo.com/?q=' + q;
      }
      window.location.href = '/'+ '------' + target;
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
