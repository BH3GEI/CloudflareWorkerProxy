# Cloudflare Worker Proxy

## Example of Use

Access:

https://webproxy.stratosphericus.workers.dev/<the URL to be proxied, either https or http>

For example:

https://webproxy.stratosphericus.workers.dev/https://www.tsukuba.ac.jp/

https://webproxy.stratosphericus.workers.dev/https://www.jlu.edu.cn/

https://webproxy.stratosphericus.workers.dev/https://news.ycombinator.com

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


## Request-Distribution
<img width="736" alt="{3643D574-A15F-4CDA-B211-6C3B584D524F}" src="https://github.com/user-attachments/assets/4a81d1bc-3870-4ab8-9327-372286876824" />


