# 医智呼 · 静态演示版（GitHub / Vercel / Cloudflare Pages）

这是把 `app.zip`（FastAPI + 原生 JS + SQLite）改造成**纯静态站点**后的部署包。

## 为什么要改造

原始应用是一个常驻的 Python FastAPI 进程 + 本地 SQLite 文件：

- Vercel 的 Python 是 **Serverless Functions**（无状态、文件系统只读、冷启动），跑不了常驻 uvicorn，SQLite 也无法持久化写入；
- Cloudflare Pages / Workers 是**静态托管 + 边缘 JS 运行时**，同样跑不了 Python 后端；
- GitHub 本身只是代码仓库，不是应用托管。

所以本包把「接口响应」预先导出成快照，用 `static/mock-fetch.js` 在浏览器里拦截 `/api/*` 请求并模拟应答。
**界面、数据、AI 外呼回放、语音转写、结构化抽取、风险评估、工单闭环全部保留**，只是数据不落服务器。

## 目录结构

```
index.html              应用首页（内含登录守卫）
login.html              评审登录页
static/
  app.js                原版前端，未改动
  style.css             原版样式，未改动
  cloud.js / cloud-config.js / vendor/   原版云服务模块
  snapshot.js           从真实后端导出的接口数据快照
  mock-fetch.js         API 模拟层（拦截 fetch）
```

## 评审账号

- 账号：`reviewer`
- 密码：`Yizhihu2026`

登录状态存在 `sessionStorage`，关闭标签页即失效。这是**前端演示门禁**，不是服务端鉴权；
如需真正的服务端鉴权，请走「完整后端 + Cloudflare Tunnel」路线（见部署向导）。

## 部署要点

- 仓库根目录必须直接是这些文件（`index.html` 在根），不要多套一层文件夹。
- Vercel：Framework Preset 选 **Other**，Build Command / Output Directory 全部留空，直接 Deploy。
- Cloudflare Pages：构建命令留空，输出目录填 `/`（或留空），直接部署。
- 不要加 `/*  /index.html 200` 这类 SPA 重写规则：本应用用 hash 路由（`#/dashboard`），
  加了该规则会把 `login.html` 也重写掉，导致登录页打不开。
- 不需要域名备案，平台会给你 `https://xxx.vercel.app` / `https://xxx.pages.dev`。

## 已知限制

- 刷新页面后，演示期间的新增/修改会恢复为初始快照（数据只存在浏览器内存）。
- 「云服务接入」页签仍指向原 WorkBuddy 云服务域名，静态部署下自检可能报错，评审时跳过该页签即可；
  主体业务（工作台 / 病种方案 / 患者 / 外呼 / 工单 / 设置）不受影响。
- 导入 xlsx 只返回成功提示，不会真的写库。
- 患者姓名等演示数据已脱敏；请勿替换为真实患者信息。
