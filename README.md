# Tape — Personal Multi-Market Equity Dashboard

**English** · [中文](#tape--个人多市场股票看板)

A personal dashboard for tracking equities across markets (US / HK / China A-shares).
The frontend is built with Vue 3 + TypeScript + Vite; the backend is a Python
bridge that wraps Futu OpenAPI's binary protocol as JSON HTTP and folds in a
handful of public data sources (yfinance / FRED / SEC EDGAR / CNN / Polymarket).

A built-in **Mock data source** means `pnpm install && pnpm dev` runs out of the
box — no account or API key required. Wire up Futu OpenD later for live quotes.

> **Disclaimer**: This project is for personal learning and research only and is
> **not** investment advice. Quotes, backtests, and AI analysis are not
> guaranteed to be accurate — use at your own risk.

## Features

| Module | What it does |
| --- | --- |
| Overview | News, Fear & Greed index, Polymarket, sector heatmap, portfolio summary, AI daily brief |
| Watchlist | Watchlist + live quotes |
| Movers | Gainers / losers |
| Heatmap | Sector / stock heatmap |
| Indicator Lab | Technical-indicator computation and overlays |
| Backtest | vectorbt-style strategy backtests with LLM compose / explain / suggest |
| Compare | Side-by-side comparison of multiple symbols |
| Portfolio | Positions / transactions / plans + AI diagnosis |
| Alerts | Price / indicator alerts |
| Earnings | Earnings calendar |
| Macro | FRED + Shiller CAPE + Buffett indicator |
| Stock Detail | K-line / news / earnings / analyst / AI analysis |

The UI ships with English & Chinese (Settings → Language) and light / dark themes.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Vue 3.5 + `<script setup>` + Composition API |
| Language | TypeScript 5.6 (strict) |
| Build | Vite 6 (package manager: pnpm 10) |
| Styling | UnoCSS (class-based dark mode, theme tokens via CSS variables) |
| State | Pinia + `pinia-plugin-persistedstate` |
| Routing | `vue-router` 4 (hash mode, works from `file://`) |
| Auto-import | `unplugin-auto-import` + `unplugin-vue-components` + `unplugin-icons` |
| Charts | ECharts 6 (heatmap) + Highcharts 12 (macro dual-axis) + lightweight-charts (K-line) |
| Quote bridge | Python 3.10+ (`futu` official SDK + stdlib `http.server`) |
| Persistence | SQLite (`server-py/data/tape.db`; browser Pinia state mirrors here) |
| AI | DeepSeek-compatible (OpenAI-style) chat completion, optional |

## Data path

```
[Browser] ─ HTTP/JSON ─▶ [Vite /api proxy] ─▶ [server-py :8787] ─┬─ Futu OpenD :11111 (TCP) ─▶ [Futu]
                                                                 ├─ yfinance / FRED / SEC EDGAR / CNN / Polymarket (HTTPS)
                                                                 ├─ SQLite (server-py/data/tape.db)
                                                                 └─ DeepSeek-compatible LLM API
```

OpenD speaks Futu's own Protobuf protocol over TCP — not HTTP/JSON — so the
browser cannot talk to it directly. That is exactly why the Python bridge exists.

## Repository layout

```
.
├── src/                       # Vue frontend
│   ├── api/                   # provider abstraction (mock / bridge) + per-domain REST modules
│   ├── stores/                # Pinia stores (one store per domain)
│   ├── views/                 # routed views (one directory per route)
│   ├── components/            # layout / shared UI / chart components
│   ├── composables/ utils/    # composables and formatters
│   ├── i18n/                  # vue-i18n English & Chinese
│   └── router/index.ts        # routes (hash mode)
├── server-py/                 # Python bridge
│   ├── app.py                 # ThreadingHTTPServer, HTTP routing only
│   ├── futu_bridge.py         # the single OpenD client + DataFrame→JSON transforms
│   ├── sources/               # broker-agnostic HTTPS fetchers (one file per source)
│   ├── indicators/            # technical-indicator subpackage (registry / compute / schemas)
│   ├── backtests/             # backtest engine + strategies
│   ├── ai/                    # LLM orchestration for the backtest UX
│   ├── db.py                  # SQLite layer (WAL, locked)
│   ├── llm.py                 # LLM provider adapter (DeepSeek-compatible)
│   └── requirements.txt
├── public/  index.html
├── vite.config.ts             # proxies /api → :8787
└── uno.config.ts
```

## Quick start (Mock data, zero config)

Requires Node ≥ 18.18 (20 LTS recommended) and pnpm 10.

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

The default data source is **Mock** — the dashboard fills itself with randomly
drifting quotes, ideal for UI / layout work. No OpenD, no API key needed.

### Common scripts

```bash
pnpm dev          # dev server (port 5173, auto-proxies /api → :8787)
pnpm build        # vue-tsc --noEmit && vite build
pnpm typecheck    # type-check only
pnpm preview      # preview the production build locally
```

> There is **no test suite and no ESLint** — type safety relies entirely on `vue-tsc`.

## Wiring up Futu OpenAPI (live quotes)

```bash
# 1. Install and log into Futu OpenD (TCP port 11111 is open by default)
#    https://openapi.futunn.com/futu-api-doc/quick/opend-base.html

# 2. Start the Python bridge (in a new terminal)
cd server-py
python -m venv .venv
# Windows PowerShell:  .\.venv\Scripts\Activate.ps1
# macOS / Linux:        source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill in keys as needed (see below)
python app.py                 # listens on http://127.0.0.1:8787

# 3. Start the frontend (back in the original terminal)
pnpm dev                      # http://localhost:5173
```

Then open the app, go to **Settings → Data source**, switch from **Mock** to
**Tape bridge**, and click **Test connection**. A green status light means
you're connected.

> Most features work even without a Futu market-data subscription: indicator /
> backtest data fetches fall back to yfinance when Futu refuses. Only live
> `/api/quotes` has no fallback — quotes are unavailable when OpenD is offline.

## Environment variables & API keys

**All keys belong to the backend bridge and live in `server-py/.env`
(gitignored — never commit it).** The frontend `.env` only holds `VITE_*`
variables, which are baked into the build, so never put secrets there.

Copy `server-py/.env.example` to `server-py/.env` and fill in what you need:

| Variable | Default | Required? | Notes |
| --- | --- | --- | --- |
| `BRIDGE_PORT` | `8787` | No | Bridge HTTP listen port |
| `OPEND_HOST` | `127.0.0.1` | No | OpenD host |
| `OPEND_PORT` | `11111` | No | OpenD TCP port (**not** the WebSocket 33333) |
| `FRED_API_KEY` | — | For macro | `/api/fred/*` and the Buffett indicator. [Free key](https://fred.stlouisfed.org/docs/api/api_key.html) |
| `DEEPSEEK_API_KEY` | — | For AI | `/api/ai/*` (daily brief, backtest explain, AI diagnosis, etc.) |
| `DEEPSEEK_MODEL` | provider default | No | LLM model id |
| `DEEPSEEK_BASE_URL` | provider default | No | OpenAI-compatible endpoint |
| `TAVILY_API_KEY` | — | For web search | `search_web` tool used by the AI brief / web Q&A. [Free tier](https://tavily.com) |

It still runs without keys — the relevant features degrade gracefully and the
core dashboard keeps working.

## Futu symbol conventions

- `US.AAPL`, `HK.00700`, `SH.000001`, `SZ.399001` — single dot for stocks / ETFs.
- **US indices use a double dot**: `US..DJI`, `US..IXIC`, `US..SPX`, `US..VIX`.
  A single dot is parsed as a stock symbol and rejected by `get_market_snapshot`.
- Futu returns `change_rate` as a **percent** (`-0.265` = -0.265%), while the
  frontend `Quote.changePct` is a **decimal** (`0.01` = 1%) — the bridge divides
  by 100.

## Conventions

- Path alias `@/* → src/*` (configured in both `vite.config.ts` and `tsconfig.json`).
- Auto-import: Vue / Vue Router / Pinia APIs plus everything exported from
  `src/composables` and `src/stores` are injected by `unplugin-auto-import` — **no
  manual `import`**. The generated `src/auto-imports.d.ts` and
  `src/components.d.ts` must not be hand-edited.
- Icons: `unplugin-icons`, `Icon` prefix, Lucide / svg-spinners collections,
  e.g. `<i-lucide-flame />`.
- New data source: add a **new file** under `server-py/sources/` (don't extend an
  existing one) and re-export it from `sources/__init__.py`. New indicator /
  strategy: register metadata in the matching `registry.py` first, then add the
  implementation — the frontend picker reads the registry directly.

## License

[MIT](./LICENSE)

---

<a name="tape--个人多市场股票看板"></a>

# Tape — 个人多市场股票看板

[English](#tape--personal-multi-market-equity-dashboard) · **中文**

一个面向个人使用的多市场（美股 / 港股 / A 股）股票看板。前端基于
Vue 3 + TypeScript + Vite，后端是一个 Python 桥接层 —— 它把富途
OpenAPI 的二进制协议封装成 JSON HTTP，并整合了一批公开数据源
（yfinance / FRED / SEC EDGAR / CNN / Polymarket 等）。

默认内置 **Mock 数据源**，`pnpm install && pnpm dev` 即可开箱运行，
无需任何账号或 Key；准备好之后再接入富途 OpenD 获取实时行情。

> **免责声明**：本项目仅供个人学习与研究使用，不构成任何投资建议。
> 行情、回测、AI 分析等结果均不保证准确，据此操作风险自负。

## 功能一览

| 模块 | 说明 |
| --- | --- |
| 市场总览 Overview | 资讯、恐惧贪婪指数、Polymarket、板块热力图、组合摘要、AI 每日简报 |
| 自选 Watchlist | 自选清单 + 实时报价 |
| 异动 Movers | 涨跌幅榜 |
| 热力图 Heatmap | 板块 / 个股热力图 |
| 指标实验室 Indicator Lab | 技术指标计算与叠加 |
| 回测 Backtest | vectorbt 风格策略回测，支持 LLM 自然语言生成 / 解释 / 建议 |
| 对比 Compare | 多标的横向对比 |
| 组合 Portfolio | 持仓 / 交易 / 计划 + AI 诊断 |
| 提醒 Alerts | 价格 / 指标提醒 |
| 财报 Earnings | 财报日历 |
| 宏观 Macro | FRED + Shiller CAPE + 巴菲特指标 |
| 个股详情 Stock Detail | K 线 / 资讯 / 财报 / 分析师 / AI 分析 |

界面支持中英双语（Settings → Language）与明 / 暗主题。

## 技术栈

| 层级 | 选型 |
| --- | --- |
| 框架 | Vue 3.5 + `<script setup>` + Composition API |
| 语言 | TypeScript 5.6（strict） |
| 构建 | Vite 6（包管理器 pnpm 10） |
| 样式 | UnoCSS（class 模式暗黑，主题 token 走 CSS 变量） |
| 状态 | Pinia + `pinia-plugin-persistedstate` |
| 路由 | `vue-router` 4（hash 模式，`file://` 可直接打开） |
| 自动导入 | `unplugin-auto-import` + `unplugin-vue-components` + `unplugin-icons` |
| 图表 | ECharts 6（热力图）+ Highcharts 12（宏观双轴）+ lightweight-charts（K 线） |
| 行情桥接 | Python 3.10+（`futu` 官方 SDK + 标准库 `http.server`） |
| 持久化 | SQLite（`server-py/data/tape.db`，浏览器侧 Pinia 状态镜像于此） |
| AI | DeepSeek 兼容（OpenAI 风格）Chat Completion，可选 |

## 数据链路

```
[浏览器] ─ HTTP/JSON ─▶ [Vite /api 代理] ─▶ [server-py :8787] ─┬─ 富途 OpenD :11111 (TCP) ─▶ [富途]
                                                              ├─ yfinance / FRED / SEC EDGAR / CNN / Polymarket (HTTPS)
                                                              ├─ SQLite (server-py/data/tape.db)
                                                              └─ DeepSeek 兼容 LLM API
```

OpenD 走的是富途自研 Protobuf 协议（TCP），不提供 HTTP/JSON 接口，
浏览器无法直连 —— 这正是 Python 桥接层存在的原因。

## 仓库结构

```
.
├── src/                       # Vue 前端
│   ├── api/                   # provider 抽象（mock / bridge）+ 各域 REST 模块
│   ├── stores/                # Pinia store（一域一 store）
│   ├── views/                 # 路由视图（一路由一目录）
│   ├── components/            # 布局 / 通用 UI / 图表组件
│   ├── composables/ utils/    # 组合式工具与格式化
│   ├── i18n/                  # vue-i18n 中英双语
│   └── router/index.ts        # 路由（hash 模式）
├── server-py/                 # Python 桥接层
│   ├── app.py                 # ThreadingHTTPServer，仅负责 HTTP 路由
│   ├── futu_bridge.py         # 唯一的 OpenD 客户端 + DataFrame→JSON 转换
│   ├── sources/               # 与券商无关的 HTTPS 抓取器（一源一文件）
│   ├── indicators/            # 技术指标子包（registry / compute / schemas）
│   ├── backtests/             # 回测引擎 + 策略
│   ├── ai/                    # 面向回测 UX 的 LLM 编排
│   ├── db.py                  # SQLite 层（WAL，加锁）
│   ├── llm.py                 # LLM provider 适配（DeepSeek 兼容）
│   └── requirements.txt
├── public/  index.html
├── vite.config.ts             # /api 代理到 :8787
└── uno.config.ts
```

## 快速上手（Mock 数据，零配置）

需要 Node ≥ 18.18（建议 20 LTS）与 pnpm 10。

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

默认数据源是 **Mock**，看板会用随机漂移的行情自动填充，适合先做界面 /
布局调整，无需启动 OpenD，也不需要任何 Key。

### 常用脚本

```bash
pnpm dev          # 开发服务器（端口 5173，自动代理 /api → :8787）
pnpm build        # vue-tsc --noEmit && vite build
pnpm typecheck    # 仅做类型检查
pnpm preview      # 本地预览构建产物
```

> 项目**没有**测试套件和 ESLint，类型安全完全依赖 `vue-tsc`。

## 接入富途 OpenAPI（实时行情）

```bash
# 1. 安装并登录富途 OpenD（默认 TCP 11111 端口已开启）
#    https://openapi.futunn.com/futu-api-doc/quick/opend-base.html

# 2. 启动 Python 桥接层（新开一个终端）
cd server-py
python -m venv .venv
# Windows PowerShell:  .\.venv\Scripts\Activate.ps1
# macOS / Linux:        source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # 按需填入 Key（见下文）
python app.py                 # 监听 http://127.0.0.1:8787

# 3. 启动前端（回到原终端）
pnpm dev                      # http://localhost:5173
```

启动后打开页面，进入 **Settings → Data source**，把数据源从 **Mock**
切到 **Tape bridge**，点 **Test connection**，状态指示灯变绿即连接成功。

> 没有富途行情订阅也能用大部分功能：指标 / 回测的取数会在 Futu 拒绝时
> 自动回退到 yfinance。只有实时 `/api/quotes` 没有回退 —— OpenD 离线时
> 报价不可用。

## 环境变量与 API Key

**所有 Key 都属于后端桥接层，写在 `server-py/.env`（已 gitignore，切勿提交）。**
前端 `.env` 只有 `VITE_*` 变量，会被打进构建产物，不要放任何密钥。

复制 `server-py/.env.example` 为 `server-py/.env` 后按需填写：

| 变量 | 默认 | 必填？ | 说明 |
| --- | --- | --- | --- |
| `BRIDGE_PORT` | `8787` | 否 | 桥接 HTTP 监听端口 |
| `OPEND_HOST` | `127.0.0.1` | 否 | OpenD 主机 |
| `OPEND_PORT` | `11111` | 否 | OpenD TCP 端口（**不是** WebSocket 的 33333） |
| `FRED_API_KEY` | — | 宏观功能需要 | `/api/fred/*` 与巴菲特指标。[免费申请](https://fred.stlouisfed.org/docs/api/api_key.html) |
| `DEEPSEEK_API_KEY` | — | AI 功能需要 | `/api/ai/*`（每日简报、回测解释、AI 诊断等） |
| `DEEPSEEK_MODEL` | provider 默认 | 否 | LLM 模型 id |
| `DEEPSEEK_BASE_URL` | provider 默认 | 否 | OpenAI 兼容端点 |
| `TAVILY_API_KEY` | — | 联网搜索需要 | AI 简报 / 联网问答的 `search_web` 工具。[免费层](https://tavily.com) |

不填 Key 也能运行：相关功能会优雅降级，看板核心仍可用。

## 富途证券代码约定

- `US.AAPL`、`HK.00700`、`SH.000001`、`SZ.399001` —— 股票 / ETF 用单点分隔。
- **美股指数用双点**：`US..DJI`、`US..IXIC`、`US..SPX`、`US..VIX`。单点会被
  当成普通股票代码、被 `get_market_snapshot` 拒绝。
- Futu 返回的 `change_rate` 单位是**百分比**（`-0.265` 表示 -0.265%），而前端
  `Quote.changePct` 用**小数**（`0.01` = 1%）—— 桥接层会自动除以 100。

## 开发约定

- 路径别名 `@/* → src/*`（`vite.config.ts` 与 `tsconfig.json` 双向配置）。
- 自动导入：Vue / Vue Router / Pinia 常用 API 与 `src/composables`、`src/stores`
  下的全部导出由 `unplugin-auto-import` 注入，**无需手写 `import`**。生成的
  `src/auto-imports.d.ts`、`src/components.d.ts` 请勿手动修改。
- 图标：`unplugin-icons`，前缀 `Icon`，集合 Lucide / svg-spinners，
  例如 `<i-lucide-flame />`。
- 新增数据源：在 `server-py/sources/` 下**新建一个文件**（不要扩展现有文件），
  并从 `sources/__init__.py` 再导出。新增指标 / 策略：先在对应 `registry.py`
  登记元数据，再写实现 —— 前端选择器直接读 registry。

## License

[MIT](./LICENSE)
