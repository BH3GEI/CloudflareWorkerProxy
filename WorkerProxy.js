addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const myURL = new URL("https://webproxy.stratosphericus.workers.dev/")

async function handleRequest(request) {
  const url = new URL(request.url)
  var targetURL
  console.log(url.host)
  console.log(myURL.host)
  if (url.host === myURL.host) {
    console.log("Path: " + url.pathname)
    if (url.pathname.startsWith('/')) {
      targetURL = new URL(url.pathname.substring(1))
    } else {
      targetURL = new URL(url.pathname)
    }
  } else {
    targetURL = url
  }
  console.log(url.pathname.substring(1))

  if (!targetURL.toString().startsWith('http')) {
    targetURL = new URL(targetURL, `https://${myURL.hostname}/${new URL(request.url).protocol}////${request.url.host.toString()}/`)
  }

  let newHeader = new Headers(request.headers)
  newHeader.set('host', targetURL.host)
  newHeader.set('origin', targetURL.host)

  let newRequest = new Request(targetURL, {
    method: request.method,
    headers: newHeader,
    body: request.body,
    cf: {
      ssl: {
        verify: false
      }
    }
  })

  try {
    let response = await fetch(newRequest)

    // Handle 301 and 302 redirects
    let newRespHeader = new Headers(response.headers)
    let location = newRespHeader.get('Location')
    if (location) {
      location = new URL(myURL.toString() + response.url).toString()  // Resolve relative URLs
      newRespHeader.set('location', location)
      
    }
    newRespHeader.set('origin', myURL.host.toString() + "/")
    console.log(response)

    // Modify headers to allow CORS
    newRespHeader.delete('Content-Security-Policy')
    newRespHeader.set('Access-Control-Allow-Origin', '*')
    newRespHeader.set('Access-Control-Allow-Methods', '*')
    newRespHeader.set('Access-Control-Allow-Headers', '*')

    // Handle cookies
    const setCookieHeader = newRespHeader.get('Set-Cookie')
    if (setCookieHeader) {
      const cookies = setCookieHeader.split(',').map(cookie => {
        const [firstPart, ...rest] = cookie.split(';')
        const [name, value] = firstPart.split('=')
        return {name, value, rest: rest.join(';')}
      })
  
      newRespHeader.delete('Set-Cookie')
      cookies.forEach(({name, value, rest}) => {
        newRespHeader.append('Set-Cookie', `${name}=${value}; ${rest}`)
      })
    }

    // Create a new response object based on the original response
    let newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newRespHeader
    })

    // Rewrite links and form actions in the HTML content
    console.log(targetURL)
    if (newRespHeader.get('Content-Type').includes('text/html')) {
      newResponse = new HTMLRewriter()
        .on('a[href]', new rewriteSomething(targetURL, response, 'href'))
        .on('form[action]', new rewriteAction(targetURL, response))
        .on('img[src]', new rewriteSomething(targetURL, response, 'src'))
        .transform(newResponse)
    }

    return newResponse
  } catch (error) {
    return new Response(`Proxy Error: ${error.message}`, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}

class rewriteSomething {
  constructor(request, response, things) {
    this.request = request;
    this.response = response;
    this.things = things;
  }

  element(element) {
    const eleThings = element.getAttribute(this.things)
    console.log(this.things + ": " + eleThings)
    if (!eleThings.startsWith('http') || !eleThings.startsWith('https')) {
      element.setAttribute(this.things, `https://${myURL.hostname}/${new URL(this.request).protocol}////${this.request.host.toString()}/${eleThings}`)
    } else {
      element.setAttribute(this.things, `https://${myURL.hostname}/${eleThings}`)
    }
  }
}

class rewriteAction {
  constructor(request, response) {
    this.request = request;
    this.response = response;
  }
  element(element) {
    const action = element.getAttribute('action')
    if (!action.startsWith('http')) {
      element.setAttribute('action', `https://${myURL.hostname}/${new URL(this.request).protocol}//${this.request.host.toString()}${action}`)
    } else {
      element.setAttribute('href', `https://${myURL.hostname}/${action}`)
    }
  }
}
