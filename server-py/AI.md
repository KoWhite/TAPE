# AI gateway

The Python bridge exposes a server-side AI gateway so browser code never
sees model API keys.

## Configure DeepSeek

Set these variables in the shell that starts `app.py`:

```powershell
$env:DEEPSEEK_API_KEY="sk-..."
$env:DEEPSEEK_MODEL="deepseek-v4-flash"
python app.py
```

Optional settings:

```text
AI_PROVIDER=deepseek
DEEPSEEK_BASE_URL=https://api.deepseek.com
AI_TIMEOUT_SECONDS=60
```

DeepSeek uses an OpenAI-compatible Chat Completions API. The default model
is `deepseek-v4-flash`; `deepseek-v4-pro` can be selected per request.

## Endpoints

```text
GET  /api/ai/providers
POST /api/ai/chat
```

Example:

```bash
curl http://127.0.0.1:8787/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-v4-flash",
    "messages": [
      {"role": "system", "content": "You are a concise market analyst."},
      {"role": "user", "content": "Summarize today risk factors for NVDA."}
    ],
    "temperature": 0.2,
    "maxTokens": 800
  }'
```

Frontend code should use `src/api/ai.ts` instead of calling DeepSeek
directly.
