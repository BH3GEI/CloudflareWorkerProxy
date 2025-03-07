# Cloudflare Worker Proxy

[中文](README_CN.md)


## Example of Use

Access:

https://webproxy.stratosphericus.workers.dev/<the URL to be proxied, either https or http>

https://proxy.liyao.space/<the URL to be proxied, either https or http>


For example:

https://proxy.liyao.space/https://www.tsukuba.ac.jp/

https://proxy.liyao.space/https://www.jlu.edu.cn/

https://proxy.liyao.space/https://news.ycombinator.com

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
<img width="556" alt="{A5947BDC-F4BB-4F18-9C46-5E899E65B178}" src="https://github.com/user-attachments/assets/7f339f1d-7c14-4b75-a84d-4c88108ec95b" />


