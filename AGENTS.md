# Repository Guidelines

## Project Overview

**Tape** is a personal US-equity dashboard. The frontend is Vue 3 + TypeScript + Vite + UnoCSS + Pinia. Market data flows through a JSON HTTP bridge.

- `src/` - Vue frontend.
- `src/api/` - frontend API clients and provider abstractions.
- `src/stores/` - Pinia state and shared quotes engine.
- `src/views/` - route-level screens.
- `server-py/` - Python bridge (the only bridge; talks to OpenD over TCP :11111).

## Commands

```bash
pnpm install
pnpm run dev        # Vite on :5173, proxies /api to :8787
pnpm run typecheck  # vue-tsc --noEmit
pnpm run build      # typecheck + production build
pnpm run preview
```

```bash
pip install -r requirements.txt
python app.py       # Futu bridge, OpenD TCP :11111
```

There is no test suite or linter. Use `vue-tsc` for frontend checks and `python -m py_compile server-py\app.py server-py\llm.py` for bridge checks.

## Architecture Rules

```text
[Browser] -> [Vite /api proxy] -> [bridge :8787] -> [OpenD]
```

OpenD does not speak HTTP/JSON. Never point `/api` directly at OpenD.

Keep bridge contracts stable.

Use `getProvider()` from `src/api/index.ts` for quote access. Do not import provider modules directly into views or stores.

`src/stores/quotes.ts` is the singleton quote engine. Do not start independent polling loops.

## Futu Code Conventions

Use Futu-style codes: stocks/ETFs use `US.AAPL`, `HK.00700`, `SH.000001`; US indices use `US..DJI`, `US..IXIC`, `US..SPX`, `US..VIX`.

The double dot is intentional. Futu `change_rate` is percent; frontend `Quote.changePct` is decimal. Divide by `100` in new conversions.

## Frontend Style

Use Vue `<script setup>` and Composition API. Components are PascalCase, composables use `useX.ts`, and stores use names such as `quotes.ts`.

Vue, Vue Router, Pinia, composables, and stores are auto-imported. Do not hand-edit generated declarations.

Style with UnoCSS and CSS variables from `src/assets/styles/main.css`.

## Configuration & Secrets

- `VITE_API_BASE` defaults to `/api`.
- `VITE_POLL_INTERVAL` seeds refresh interval.
- Python Futu bridge uses `OPEND_PORT=11111`.
- Node bridge uses `OPEND_PORT=33333`.
- AI keys such as `DEEPSEEK_API_KEY` must stay server-side in the environment.

Never commit local `.env` files, API keys, or access tokens.

## Commits & Pull Requests

Recent commits are short (`fix`, `first commit`). Prefer concise imperative messages, for example `fix: preserve US index codes`.

Pull requests should include changes, affected areas, verification commands, and UI screenshots.
