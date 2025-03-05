# Cloudflare Worker Proxy

[中文](README_CN.md)


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

This example link demonstrates a proxy to some simple websites.

## Usage Instructions

1. Deploy a worker on Cloudflare.
2. **Modify the value of `proxyDomains`** in the code according to the actual configuration of the worker. 
3. Click on 'Deploy', then use it following the method in the example of use.

## Matters Needing Attention

- Make sure the routing configuration for Cloudflare Worker is correct
- Make sure to modify  `proxyDomains`  in your code to fit your own domain name

## Request-Distribution
<img width="736" alt="{3643D574-A15F-4CDA-B211-6C3B584D524F}" src="https://github.com/user-attachments/assets/4a81d1bc-3870-4ab8-9327-372286876824" />


