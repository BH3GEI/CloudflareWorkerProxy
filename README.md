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

## Matters Needing Attention

- Ensure that the Cloudflare Worker is correctly configured and can access the Internet.
- Since this is a reverse proxy server, all requests will go through it. Therefore, make sure your Cloudflare plan includes sufficient bandwidth and processing power.

