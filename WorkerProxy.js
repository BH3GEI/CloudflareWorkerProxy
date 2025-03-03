addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const config = {
  proxyDomain: 'testcf.stratosphericus.workers.dev',
  homepage: true, 
  allowedDomains: [], 
}

async function handleRequest(request) {
  const url = new URL(request.url)
  
  if (config.homepage && url.pathname === '/' && url.host === config.proxyDomain) {
    return getHomePage()
  }

  let targetURL
  
  try {
    // 确定目标URL
    if (url.host === config.proxyDomain) {
      // 从路径中提取目标URL
      if (url.pathname === '/proxy' && url.searchParams.has('url')) {
        // 处理/proxy?url=https://example.com格式
        const urlParam = url.searchParams.get('url')
        targetURL = new URL(urlParam)
      } else if (url.pathname.startsWith('/')) {
        // 处理/https://example.com格式
        const path = url.pathname.substring(1)
        if (path.startsWith('http://') || path.startsWith('https://')) {
          targetURL = new URL(path)
        } else {
          // 处理相对路径/example.com格式，默认为https
          targetURL = new URL('https://' + path)
        }
      }
    } else {
      // 直接使用请求URL
      targetURL = url
    }
    
    // 检查域名白名单
    if (config.allowedDomains.length > 0) {
      const isAllowed = config.allowedDomains.some(domain => 
        targetURL.hostname === domain || targetURL.hostname.endsWith(`.${domain}`)
      )
      if (!isAllowed) {
        return new Response('域名不在白名单内', { status: 403 })
      }
    }
  } catch (error) {
    return new Response(`URL解析错误: ${error.message}`, { 
      status: 400, 
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
    })
  }

  // 准备请求头
  let newHeaders = new Headers(request.headers)
  newHeaders.set('Host', targetURL.host)
  newHeaders.set('Referer', targetURL.href)

  // 创建新请求
  let newRequest = new Request(targetURL, {
    method: request.method,
    headers: newHeaders,
    body: request.body,
    redirect: 'manual', // 手动处理重定向
  })

  try {
    // 发送请求到目标服务器
    let response = await fetch(newRequest)
    
    // 处理重定向
    let newRespHeaders = new Headers(response.headers)
    if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
      const location = newRespHeaders.get('Location')
      if (location) {
        try {
          // 处理绝对和相对URL
          const redirectURL = new URL(location, targetURL)
          // 构建新的代理URL
          const newLocation = `https://${config.proxyDomain}/${redirectURL.href}`
          newRespHeaders.set('Location', newLocation)
        } catch (error) {
          console.error('重定向URL处理错误:', error)
        }
      }
    }
    
    // 修改CORS相关头
    newRespHeaders.delete('Content-Security-Policy')
    newRespHeaders.delete('Content-Security-Policy-Report-Only')
    newRespHeaders.set('Access-Control-Allow-Origin', '*')
    newRespHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    newRespHeaders.set('Access-Control-Allow-Headers', '*')
    
    // 创建新的响应对象
    let newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newRespHeaders
    })
    
    // 重写HTML内容中的链接
    const contentType = newRespHeaders.get('Content-Type') || ''
    if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
      newResponse = new HTMLRewriter()
        .on('a[href]', new LinkRewriter(targetURL, 'href'))
        .on('form[action]', new LinkRewriter(targetURL, 'action'))
        .on('img[src]', new LinkRewriter(targetURL, 'src'))
        .on('link[href]', new LinkRewriter(targetURL, 'href'))
        .on('script[src]', new LinkRewriter(targetURL, 'src'))
        .transform(newResponse)
    }
    
    return newResponse
  } catch (error) {
    return new Response(`代理请求失败: ${error.message}`, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}

// 统一处理链接重写
class LinkRewriter {
  constructor(baseURL, attributeName) {
    this.baseURL = baseURL
    this.attributeName = attributeName
  }
  
  element(element) {
    const attributeValue = element.getAttribute(this.attributeName)
    if (!attributeValue) return
    
    try {
      // 构建完整URL (处理相对路径)
      const absoluteURL = new URL(attributeValue, this.baseURL)
      
      // 重写为代理URL
      const newURL = `https://${config.proxyDomain}/${absoluteURL.href}`
      element.setAttribute(this.attributeName, newURL)
    } catch (e) {
      // 如果URL无效，保持原样
      console.error(`URL重写错误 [${attributeValue}]:`, e)
    }
  }
}

// 返回简洁的主页HTML
function getHomePage() {
  return new Response(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Web代理服务</title>
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
  <h1>Web代理服务</h1>
  <p>输入要访问的网址，通过此代理访问目标网站</p>
  
  <form id="proxyForm" onsubmit="navigateToProxy(event)">
    <input type="url" id="urlInput" placeholder="https://example.com" required>
    <button type="submit">访问</button>
  </form>
  
  <p class="example">例如: https://example.com</p>
  
  <script>
    function navigateToProxy(e) {
      e.preventDefault();
      const url = document.getElementById('urlInput').value.trim();
      if (url) {
        window.location.href = '/' + url;
      }
    }
    
    // 自动聚焦到输入框
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
