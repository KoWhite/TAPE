# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Tape** — a personal multi-market equity dashboard. Vue 3 + TS + Vite frontend, plus a Python bridge that wraps Futu OpenAPI's binary protocol and re-exposes it as JSON HTTP. Beyond live quotes the app now covers: market overview (news / fear-greed / Polymarket / sector heatmap / portfolio summary / AI daily brief), watchlist, movers, sector heatmap, indicator lab, vectorbt-style backtests (with LLM compose/suggest/explain), compare, portfolio (positions + transactions + plans + AI diagnosis), alerts, earnings calendar, macro (FRED + Shiller CAPE + Buffett indicator), and per-symbol detail (K-line / news / earnings / analyst / AI analysis).

## Commands

Frontend (run from repo root):

```bash
pnpm install         # repo uses pnpm@10 — see packageManager
pnpm dev             # Vite dev server on :5173 (proxies /api → :8787)
pnpm build           # vue-tsc --noEmit && vite build
pnpm typecheck       # vue-tsc --noEmit
pnpm preview
```

Python bridge (run from `server-py/`):

```bash
python app.py        # requires `futu`, `pandas`, `yfinance` etc. — see requirements.txt
```

There used to be a Node bridge in `server/` but it never reliably connected to OpenD on this setup, so it was removed. All bridge work happens in `server-py/`. A leftover `server/node_modules/` may exist on disk from the old install — safe to delete.

There is **no test suite and no linter** configured — only `vue-tsc` for type-checking via `pnpm typecheck` (also runs as part of `pnpm build`).

### Node version (fnm)

The system default Node on this machine is **v16**, which pnpm 10 refuses
to run on (`This version of pnpm requires at least Node.js v18.12`). Don't
chase this as a real bug — switch the shell's Node with `fnm` before
running any `pnpm` command:

```bash
fnm use 20    # or 18 — either works
pnpm typecheck
```

`fnm list` shows installed versions; `v18.19.1` and `v20.19.x` are both
available. The switch is per-shell, so a fresh Bash invocation needs it
again. Equivalent in PowerShell: `fnm use 20`.

## Architecture

### Data path

```
[Browser] ─ HTTP/JSON ─▶ [Vite /api proxy] ─▶ [server-py :8787] ─┬─ Futu OpenD :11111 (TCP) ─▶ [Futu]
                                                                  ├─ yfinance / FRED / SEC EDGAR / CNN / Polymarket (HTTPS)
                                                                  ├─ SQLite (server-py/data/tape.db)
                                                                  └─ DeepSeek-compatible LLM API
```

OpenD does **not** speak HTTP/JSON — that's the entire reason the bridge exists. Do not point `/api` at OpenD directly.

`server-py/app.py` is a `ThreadingHTTPServer` that only owns HTTP routing — every domain is delegated:

- `server-py/futu_bridge.py` — single OpenD `OpenQuoteContext` + Futu DataFrame → JSON transforms (`fetch_quotes`, `fetch_kline`, `fetch_bars_smart`, `quote_from_row`, `health_payload`, `search_symbols`, `close_ctx`). Holds the `_ctx` singleton + lock. **All Futu-specific code lives here**; `app.py` only imports symbols.
- `server-py/sources/` — broker-agnostic HTTPS fetchers, split by domain. **No Futu calls anywhere in this package.** One file per source: `earnings.py`, `macro_fred.py`, `macro_buffett.py`, `shiller.py`, `sentiment.py` (CNN F&G + Polymarket), `news.py`, `analyst.py`, `institutional.py` (SEC EDGAR), `sectors.py`, `yf_bars.py`. Shared helpers in `_helpers.py`. Public surface is re-exported from `__init__.py` so `app.py` does `from sources import fetch_*` and never reaches into submodules.
- `server-py/db.py` — SQLite layer (`data/tape.db`) with `app_state` key/value table and a `cache_entries` table. WAL mode, threading.RLock-protected. Frontend Pinia state mirrors here via `/api/app-state`.
- `server-py/llm.py` — LLM provider adapter. DeepSeek-compatible (OpenAI-style) chat completion + streaming. Reads `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` / `DEEPSEEK_BASE_URL`.
- `server-py/indicators/` — technical-indicator subpackage.
- `server-py/backtests/` — backtest engine + strategies.
- `server-py/ai/` — LLM orchestration for the backtest UX.

The quant subpackages follow the same **registry / compute|engine / schemas** convention (matches the modular-files preference):

```
indicators/   registry.py  compute.py   schemas.py   __init__.py
backtests/    registry.py  engine.py    schemas.py   stats.py runner.py strategies/
ai/           explain.py   suggest.py   compose.py   json_response.py
sources/      _helpers.py  __init__.py + one file per data source
```

Public APIs are re-exported from each `__init__.py` so `app.py` only imports symbols (never reaches into submodules). When adding a new indicator or strategy, register metadata in `registry.py` first, then add the implementation — the frontend picker reads the registry list verbatim. When adding a new HTTPS-backed data source, add a new file under `sources/` (don't extend an existing one) and re-export the public fetcher from `sources/__init__.py`.

### Bar-fetching fallback

`fetch_bars_smart(code, ktype, count)` in `app.py` is the bar source used by both indicators and backtests. It tries Futu's `request_history_kline` first (already running, no rate limit) and falls back to yfinance (`fetch_bars_yf` in `data.py`) when Futu refuses — unsupported market, missing subscription, OpenD offline. The fallback keeps backtest/indicator features usable for users who don't have a live Futu market data subscription. Live `/api/quotes` has no fallback; if OpenD is offline, quotes are unavailable.

### JSON contract (a.k.a. the surface `app.py` exposes)

Stable endpoints used by the frontend — the docstring at the top of `server-py/app.py` is the canonical list. Highlights:

- Market data: `/api/health`, `/api/quotes`, `/api/search`, `/api/kline`, `/api/bars`
- Quant: `/api/indicators` (catalog), `/api/indicator/compute`, `/api/backtests` (catalog), `/api/backtest/run`
- Reference data: `/api/fred/series`, `/api/shiller/cape`, `/api/macro/buffett-indicator`, `/api/market/sector-etfs`, `/api/sectors`
- Symbol context: `/api/earnings`, `/api/news/ticker`, `/api/news/market`, `/api/analyst`, `/api/institutional/context`
- Sentiment: `/api/cnn/fear-greed`, `/api/polymarket/top`
- AI: `/api/ai/providers`, `/api/ai/chat`, `/api/ai/chat/stream` (SSE), `/api/ai/backtest/explain` (+ `/stream`), `/api/ai/backtest/suggest`, `/api/ai/backtest/compose`
- Persistence: `/api/app-state` (GET/POST, drives server-side state mirror)

SSE endpoints use `text/event-stream` with `data: <json>\n\n` framing; the handler tolerates `BrokenPipeError` when the client disconnects mid-stream.

### Frontend provider abstraction

`src/api/types.ts` defines `QuoteProvider` (fetchQuotes / subscribe? / searchSymbols / status). Two implementations:
- `src/api/providers/mock.ts` — randomized drift for UI work, no setup needed
- `src/api/providers/bridge.ts` — calls the Python bridge over `/api`

`src/api/index.ts#getProvider()` resolves the active provider from the **Settings store** at call time. It memoizes by `(dataSource, bridge.baseUrl)` and rebuilds when either changes. Always go through `getProvider()` — never import a provider module directly into a view/store.

The user toggles the source in **Settings → Data source** (Mock vs Tape bridge); default is `mock`.

Domain-specific REST endpoints (kline, earnings, news, AI, etc.) are hit via thin per-domain modules under `src/api/*.ts` (e.g. `src/api/kline.ts`, `src/api/ai.ts`). They use the same `settings.bridge.baseUrl` so switching back to mock data doesn't break — they just return empty/null. Pattern: one `src/api/<domain>.ts` file → one `src/stores/<domain>.ts` store → one `src/views/<Domain>/` route.

### State + reactivity

- Pinia with `pinia-plugin-persistedstate`. Persisted store keys are namespaced (`tape:settings`, `tape:watchlist`, `tape:portfolio`, etc.). The bridge's SQLite mirror is the source of truth across browsers; localStorage is a per-browser cache.
- `src/stores/quotes.ts` is the singleton polling/subscription engine. Every caller (Dashboard, ticker strip, Portfolio P&L, alerts evaluator, etc.) shares one polling cycle and one `provider.fetchQuotes()` round-trip.
- `allCodes` = watchlist ∪ portfolio positions ∪ `GLOBAL_TICKER_CODES` — deduped. Portfolio codes are included so off-watchlist holdings still get live P&L.
- The store has **exponential backoff** on failure (`consecutiveFailures` → `nextRefreshAt`, capped at 60s) and **pauses when the tab is hidden** (`document.visibilitychange`). Don't bypass these — they keep the bridge from being hammered when OpenD is down or the laptop is closed.
- The store re-binds (`bind()`) whenever `[allCodes, dataSource, refreshInterval]` change. If the provider exposes `subscribe`, the store uses it for ticks; otherwise it polls via `setInterval(refresh, refreshInterval)`.

### Futu code conventions (load-bearing)

- `US.AAPL`, `HK.00700`, `SH.000001`, `SZ.399001` — single-dot for stocks/ETFs.
- **US indices use double-dot**: `US..DJI`, `US..IXIC`, `US..SPX`, `US..VIX`. A single-dot index code is parsed as a stock symbol and rejected by `get_market_snapshot`. (Currently the global ticker strip uses ETF proxies — `US.SPY`, `US.QQQ` — to avoid index-subscription requirements; the `US..*` codes in `GLOBAL_TICKER_CODES` are commented out.)
- Futu returns `change_rate` as a **percent** (e.g. `-0.265` = -0.265%). The frontend's `Quote.changePct` is a **decimal** (`0.01` = 1%). The Python bridge divides by 100; do the same anywhere new conversion happens.
- US extended-hours (`pre`, `after`, `overnight`) sessions are populated only outside RTH and only for US securities. `_session_block` returns `null` when the price is missing/zero so the UI can hide the block cleanly.
- The `/api/kline` handler emits **unix seconds** for intraday bars and **ISO date strings** for daily-and-above, matching what `lightweight-charts` expects. Don't unify them.

### Routes (frontend)

Routes live in `src/router/index.ts` (hash mode). Top-level views and their stores:

| Route | View | Store(s) |
|---|---|---|
| `/` | Overview | aiDailyBrief, fearGreed, polymarket, marketSectors, portfolio, news |
| `/watchlist` | Dashboard | watchlist, quotes |
| `/movers` | Movers | quotes |
| `/heatmap` | Heatmap | marketSectors |
| `/indicators` | IndicatorLab | indicators |
| `/backtest` | Backtest | backtests, backtestPresets, ai |
| `/compare` | Compare | (per-component) |
| `/portfolio` | Portfolio | portfolio, portfolioHistory, ai |
| `/alerts` | Alerts | alerts |
| `/earnings` | Earnings | earnings |
| `/macro` | Macro | macro |
| `/stock/:code` | StockDetail | quotes, news, analyst, earnings, stockAiAnalysis, institutional, sectors |
| `/settings` | Settings | settings |

### Build/tooling specifics

- Vite alias: `@/* → src/*` (also configured in `tsconfig.json` paths).
- `unplugin-auto-import` auto-imports Vue, Vue Router, and Pinia APIs plus everything in `src/composables` and `src/stores` — no need to `import { ref }` etc. Generated declarations land in `src/auto-imports.d.ts` and `src/components.d.ts` (do not hand-edit).
- `unplugin-icons` with the `Icon` prefix and Lucide/svg-spinners collections — use as `<i-lucide-flame />` or import as `~icons/lucide/flame` (see `router/index.ts`).
- Router uses **hash mode** (`createWebHashHistory`) so the built bundle works when opened from `file://`.
- UnoCSS dark mode is class-based (`presetUno({ dark: 'class' })`). Theme tokens live as CSS variables in `src/assets/styles/main.css` — reference via `bg-[var(--surface)]`, etc. Add new tokens there, not in `uno.config.ts`.
- Charting: ECharts (heatmap, sectors), Highcharts (macro dual-axis), lightweight-charts (K-line). They are not interchangeable — pick by feature already in use in the surrounding view.

### Frontend env

- `VITE_API_BASE` (default `/api`) — overridable via Settings store at runtime.
- `VITE_POLL_INTERVAL` (default `5000` in code, `3000` in `.env.example`) — initial value for `settings.refreshInterval`; user-adjustable.

### Bridge env

| Var | Default | Notes |
|---|---|---|
| `BRIDGE_PORT` | 8787 | HTTP listen port |
| `OPEND_HOST` | 127.0.0.1 | Futu OpenD host |
| `OPEND_PORT` | 11111 | OpenD native TCP port (NOT the WebSocket 33333) |
| `TAPE_DB_PATH` | `server-py/data/tape.db` | SQLite file; created on first run |
| `FRED_API_KEY` | "" (required for `/api/fred/*` and Buffett indicator) | Free key at https://fred.stlouisfed.org/docs/api/api_key.html |
| `DEEPSEEK_API_KEY` | "" | required for `/api/ai/*` |
| `DEEPSEEK_MODEL` | provider default | LLM model id |
| `DEEPSEEK_BASE_URL` | provider default | OpenAI-compatible endpoint |

