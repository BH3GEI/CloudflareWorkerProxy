# Cloudflare Worker Proxy

## Example of Use

Access:

https://webproxy.stratosphericus.workers.dev/<the URL to be proxied, either https or http>

For example:

https://webproxy.stratosphericus.workers.dev/https://www.jlu.edu.cn/

You can also just visit the site and input the url manually:

https://webproxy.stratosphericus.workers.dev/

https://proxy.liyao.space/

This example link demonstrates a proxy to the official website of Jilin University.

## Usage Instructions

1. Deploy a worker on Cloudflare.
2. **Modify the value of `proxyDomains`** in the code according to the actual configuration of the worker. 
3. Click on 'Deploy', then use it following the method in the example of use.

## Code Structure Analysis

The main function is to serve as a reverse proxy server, handling HTTP requests, performing the corresponding redirection, dealing with CORS issues, and modifying HTML content, such as links, form actions, and image sources.

### Event Listener

```javascript
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})
```

This part of the code listens to all incoming HTTP requests and passes these requests to the `handleRequest` function for processing.

### HandleRequest Function

```javascript
async function handleRequest(request) {
  // ...
}
```

This is an asynchronous function that takes an HTTP request, parses and processes it, and then returns a new HTTP response.

Its main functions include:

- Parsing and redirecting URLs
- Modifying request headers
- Modifying response headers to handle CORS issues
- Modifying HTML content, such as links, form actions, and image sources


## Matters Needing Attention

- Ensure that the Cloudflare Worker is correctly configured and can access the Internet.
- Since this is a reverse proxy server, all requests will go through it. Therefore, make sure your Cloudflare plan includes sufficient bandwidth and processing power.
- Ensure server security to prevent malicious use. 

