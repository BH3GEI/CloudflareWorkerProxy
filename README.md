# Cloudflare Worker Proxy

[中文](README_CN.md)


## Example of Use

Examples:

https://proxy.liyao.space/------https://www.tsukuba.ac.jp/

https://proxy.liyao.space/------https://www.jlu.edu.cn/

https://proxy.liyao.space/------https://news.ycombinator.com

You can also just visit the site and input the url manually:

https://proxy.liyao.space/

https://webproxy.stratosphericus.workers.dev/

This example link demonstrates a proxy to some simple websites.

## Usage Instructions

1. Deploy a worker on Cloudflare.
2. **Modify the value of `proxyDomains`** in the code according to the actual configuration of the worker. 
3. Click on 'Deploy', then use it following the method in the example of use.

## Matters Needing Attention

- Make sure the routing configuration for Cloudflare Worker is correct
- Make sure to modify  `proxyDomains`  in your code to fit your own domain name


## Request-Distribution
<img width="967" alt="image" src="https://github.com/user-attachments/assets/6d0c94af-5012-4f33-a7b5-2a5ca1218bc9" />


## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=BH3GEI/CloudflareWorkerProxy&type=Date)](https://star-history.com/#bytebase/star-history&Date)
