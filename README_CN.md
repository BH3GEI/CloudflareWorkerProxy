# Cloudflare Worker 代理

[English](README.md)


## 使用示例

例：

https://proxy.liyao.space/------https://www.tsukuba.ac.jp/

https://proxy.liyao.space/------https://www.jlu.edu.cn/

https://proxy.liyao.space/------https://news.ycombinator.com

您也可以访问该站点并手动输入url：

https://proxy.liyao.space/

https://webproxy.stratosphericus.workers.dev/

以上是一些简单网站的代理。

## 部署说明

1. 在Cloudflare上部署Worker。
2. **根据Worker实际配置修改代码中`proxyDomain`** 的值。
3. 单击“部署”，完成!

## 注意

- 确保Cloudflare Worker的路由配置正确
- 确保在您的代码中修改 `proxyDomain` 以适合您自己的域名

## Request-Distribution
<img width="967" alt="image" src="https://github.com/user-attachments/assets/4f02d5ef-ecc6-4ef2-8b13-350b7787e802" />
