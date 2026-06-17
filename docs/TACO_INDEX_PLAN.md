# TACO 指数（川普压力指数）实施方案

> 参考图：`川普压力指数（TACO指数）` —— 来源 X @宏观边际 / ocmacro.com
> 目标：在 Tape 的 `/macro` 路由下新增一张 TACO 综合压力指数卡片，与 Buffett / Yield Curve / Treasury 等并列。

---

## 1. 指标定义（口径还原）

TACO 总指数 = **若干分量的"反向 N 日变化"加总**（单位：百分点）。
"反向" = 对川普的政策偏好不利时为正贡献（压力↑），有利时为负贡献。

参考图截至 2026-05-18 数据示例：
```
总指数 +4.6% =
  净支持率 +2.0%   (Approval - Disapproval 上行 → 利好川普 → 但图上为正，说明这一项不翻转，或翻转规则需进一步核对)
+ 10Y UST +1.9%   (收益率上行 → 融资成本上升 → 川普压力↑)
+ S&P 500 -0.9%   (股市上涨 → 川普压力↓ → 取负贡献)
+ 2Y INF  +0.2%   (通胀预期上行 → 川普压力↑)
+ BRENT   +1.5%   (油价上行 → 川普压力↑)
```

> **注意**：原图对"净支持率"的处理方向需要在实现时和图例验证一致。最稳妥的口径是：
> - **市场四项**（股、债、通胀、油）：取近 N（默认 20）个交易日的 % 变化，按"对川普不利=正"翻转。
> - **净支持率**：取近 N 个交易日的**百分点差值**，无需翻转（支持率上升 = 政治压力下降 = 负贡献）；但截图上+2%为正，可能作者用的是"支持率下行的负值"或单纯展示净支持率绝对水位变化。**实现时提供 `approval_sign: +1 | -1` 配置项**。

### 1.1 分量、数据源与翻转规则

| 分量 | 缩写 | 数据源 | 计算 | 翻转 |
|---|---|---|---|---|
| 净支持率 | `approval` | Silver Bulletin / 538 / RCP（外抓） | `approval_t - approval_{t-N}` 百分点差 | 见上方注释 |
| 美股 | `sp500` | yfinance `^GSPC` 收盘价 | `pct_change(N)` | **× (-1)** |
| 10Y 美债收益率 | `ust10y` | FRED `DGS10` | `level_t - level_{t-N}` 百分点差 | **× (+1)**（上行=压力） |
| 通胀预期 | `inflation` | FRED `T5YIE` 或 `T10YIE` | `level_t - level_{t-N}` 百分点差 | **× (+1)** |
| 布伦特原油 | `brent` | FRED `DCOILBRENTEU` 或 yfinance `BZ=F` | `pct_change(N)` | **× (+1)** |

总指数：
```
total_t = Σ component_contribution_t
```

### 1.2 背景色带（固定阈值，可配置）

| 区间 | 标签 | 颜色（与图对齐） |
|---|---|---|
| ≥ +7% | 压力山大 | `rgba(244,67,54,0.16)` |
| +3% ~ +7% | 压力 | `rgba(255,152,0,0.14)` |
| 0 ~ +3% | 观察 | `rgba(255,235,180,0.18)` |
| -3% ~ 0 | 舒适 | `rgba(76,175,80,0.14)` |
| < -3% | 膨胀 | `rgba(46,125,154,0.16)` |

阈值定义到后端响应里返回（前端不要 hardcode），方便后续调参。

### 1.3 事件标注

参考图顶部有手工标注的关键事件（"对等关税暂停"、"中美关税休战" 等）。

实现方案：
- **后端不抓**：事件由人工维护。
- 在 `server-py/data/taco_events.json` 维护静态 JSON：`[{ date: 'YYYY-MM-DD', label: '中美关税休战', tone: 'red'|'gray' }]`
- `/api/macro/taco` 响应里附带 `events` 字段（仅返回时间窗内的事件）。
- 提供一个简单的 README 让用户后续手工追加。

---

## 2. 后端实现

遵循 [CLAUDE.md](../CLAUDE.md) 的 sources/ 约定：**一个数据源一个文件，不要扩张已有文件**。

### 2.1 新增文件清单

```
server-py/
├── sources/
│   ├── approval.py          ← 新：抓净支持率
│   └── taco.py              ← 新：组装 TACO 指数（聚合多个 source）
├── data/
│   └── taco_events.json     ← 新：人工维护的事件标注（git 跟踪）
└── app.py                   ← 改：新增 /api/macro/taco 路由
```

### 2.2 `sources/approval.py`

净支持率数据，**三选一**，按可行性排序：

**方案 A（推荐）：Silver Bulletin CSV**
- URL 形如：`https://www.natesilver.net/p/trump-approval-rating-update` 页面里嵌的 CSV 链接
- 优点：Nate Silver 自己的聚合，质量高
- 缺点：URL 不稳定，需要定期校验

**方案 B：RealClearPolitics**
- `https://www.realclearpolitics.com/epolls/other/president_trump_job_approval-7383.html`
- 解析 HTML 里嵌入的 JS 数据数组
- 优点：历史长，免费
- 缺点：HTML 抓取脆弱

**方案 C：暂时省略（占位）**
- 返回空 series 或常数 0，先把架子搭起来
- 子 Agent 实现时**默认走这个**，把 `approval.py` 留为 TODO，避免抓取问题阻塞主流程

**接口签名**：
```python
def fetch_approval_series(start: str | None = None) -> dict:
    """
    返回 MacroSeries 形状：
    {
        "id": "TRUMP_APPROVAL_NET",
        "label": "Trump Net Approval",
        "unit": "pp",
        "points": [{"date": "2025-01-20", "value": -3.2}, ...]
    }
    """
```

### 2.3 `sources/taco.py`

核心组装逻辑。**不要把这写到 `macro_fred.py` 里**。

```python
from __future__ import annotations
import json, os
from datetime import date, timedelta
from typing import TypedDict

from .macro_fred import fetch_fred_series
from .yf_bars import fetch_bars_yf
from .approval import fetch_approval_series  # 若 C 方案，则返回占位

# ---- 配置：分量定义 ----
COMPONENTS = [
    # key, source_kind, source_id, sign, kind ('pct' | 'diff')
    ("approval",  "approval", None,           +1, "diff"),  # 见 1.1 注释
    ("sp500",     "yf",       "^GSPC",        -1, "pct"),
    ("ust10y",    "fred",     "DGS10",        +1, "diff"),
    ("inflation", "fred",     "T5YIE",        +1, "diff"),
    ("brent",     "fred",     "DCOILBRENTEU", +1, "pct"),
]

DEFAULT_WINDOW = 20  # 交易日

def fetch_taco_index(window: int = DEFAULT_WINDOW,
                     start: str | None = None) -> dict:
    """
    Returns:
    {
        "window": 20,
        "asOf": "2026-05-18",
        "total": 4.6,
        "componentsLatest": {
            "approval": 2.0, "sp500": -0.9, "ust10y": 1.9,
            "inflation": 0.2, "brent": 1.5
        },
        "series": [
            {"date": "2025-02-19", "total": 4.1,
             "components": {"approval": 1.2, "sp500": -0.4, ...}},
            ...
        ],
        "thresholds": [
            {"min": 7,  "label": "压力山大", "color": "rgba(244,67,54,0.16)"},
            {"min": 3,  "label": "压力",     "color": "rgba(255,152,0,0.14)"},
            {"min": 0,  "label": "观察",     "color": "rgba(255,235,180,0.18)"},
            {"min": -3, "label": "舒适",     "color": "rgba(76,175,80,0.14)"},
            {"min": -999, "label": "膨胀",  "color": "rgba(46,125,154,0.16)"}
        ],
        "events": [
            {"date": "2025-04-08", "label": "对等关税暂停", "tone": "red"},
            ...
        ]
    }
    """
```

实现要点：
1. **统一对齐到交易日**：以 S&P 500 的日期为基准 index，其他序列 forward-fill 到这个 index 上（避免周末/假期错位）。
2. **N 日变化**：`pct_change(N)` 用对数变化更稳定，但简单起见用 `(v[t] - v[t-N]) / v[t-N] * 100`。债/通胀类用绝对差 `v[t] - v[t-N]`，单位都是 pp。
3. **加总输出百分比**：让前端拿到 `total` 时单位就是 `%`，无需再换算。
4. **`start` 默认值**：往前推 540 天（约 2.5 年），与参考图 `2/19 → 5/18` 一致。

### 2.4 `app.py` 路由

参考现有 `/api/macro/buffett-indicator` 的写法，仅加一个 case：

```python
elif self.path == "/api/macro/taco":
    body = self._read_json_body()
    window = int(body.get("window") or 20)
    start  = body.get("start")
    payload = fetch_taco_index(window=window, start=start)
    self._send_json(payload)
```

并在 `app.py` 顶部 `from sources import fetch_taco_index`。同时在 `sources/__init__.py` re-export。

### 2.5 `data/taco_events.json`

```json
[
  { "date": "2025-03-04", "label": "北美汽车豁免",     "tone": "gray" },
  { "date": "2025-04-09", "label": "对等关税暂停",     "tone": "red"  },
  { "date": "2025-04-11", "label": "科技品豁免",       "tone": "gray" },
  { "date": "2025-04-15", "label": "鲍威尔降温",       "tone": "gray" },
  { "date": "2025-05-12", "label": "中美关税休战",     "tone": "red"  },
  { "date": "2025-05-22", "label": "欧盟关税延期",     "tone": "gray" }
]
```

子 Agent 实现时**只放 2-3 条示例**即可，剩余由用户后续追加。

---

## 3. 前端实现

遵循 [CLAUDE.md](../CLAUDE.md) 约定：`src/api/<domain>.ts` → `src/stores/<domain>.ts` → `src/views/<Domain>/`。

### 3.1 文件清单

```
src/
├── types/macro.ts                            ← 改：新增 TacoIndex 类型
├── api/macro.ts                              ← 改：新增 fetchTacoIndex()
├── stores/macro.ts                           ← 改：新增 taco 缓存槽位
└── views/Macro/
    ├── index.vue                             ← 改：插入新卡片
    └── components/
        └── TacoIndexChart.vue                ← 新：图表组件
```

### 3.2 类型（`src/types/macro.ts`）

```ts
export interface TacoComponentPoint {
  approval: number | null
  sp500: number | null
  ust10y: number | null
  inflation: number | null
  brent: number | null
}

export interface TacoSeriesPoint {
  date: string                  // YYYY-MM-DD
  total: number                 // %
  components: TacoComponentPoint
}

export interface TacoThreshold {
  min: number                   // 区间下界（含），按降序排列
  label: string
  color: string                 // rgba string
}

export interface TacoEvent {
  date: string
  label: string
  tone: 'red' | 'gray'
}

export interface TacoIndex {
  window: number
  asOf: string
  total: number
  componentsLatest: TacoComponentPoint
  series: TacoSeriesPoint[]
  thresholds: TacoThreshold[]
  events: TacoEvent[]
}
```

### 3.3 API（`src/api/macro.ts`）

```ts
export function fetchTacoIndex(window = 20, start?: string): Promise<TacoIndex> {
  return postMacro('/macro/taco', { window, start }, 'TACO Index') as unknown as Promise<TacoIndex>
}
```

> 注意：现有 `postMacro` 返回 `MacroSeries`，TACO 形状不一样，需要 cast 或新增一个内部辅助函数。建议改造 `postMacro` 为泛型 `postMacro<T>(...)`。

### 3.4 Store（`src/stores/macro.ts`）

不要把 TACO 塞到现有的 `cache` 里（形状不一样）。新增独立槽位：

```ts
const taco = ref<TacoIndex | null>(null)
const tacoLoading = ref(false)
const tacoError = ref<string | null>(null)
const tacoFetchedAt = ref<number | null>(null)

async function loadTaco(window = 20, force = false) {
  if (!force && taco.value && tacoFetchedAt.value &&
      Date.now() - tacoFetchedAt.value < TTL_MS) return
  tacoLoading.value = true
  tacoError.value = null
  try {
    taco.value = await fetchTacoIndex(window)
    tacoFetchedAt.value = Date.now()
  } catch (e: any) {
    tacoError.value = e?.message || String(e)
  } finally {
    tacoLoading.value = false
  }
}
```

记得加进 `return { ... }` 暴露。

### 3.5 图表组件（`src/views/Macro/components/TacoIndexChart.vue`）

**用 Highcharts**（项目里已有 `MacroDualChartHC.vue`、`TreasuryRatesChart.vue` 在用），不要引入新库。

技术要点：
- **主轴**：折线，画 `total`，黑色粗线 2px。
- **同轴堆叠柱**：5 个分量 `column` 类型，`stacking: 'normal'`，颜色与图例对齐：
  - approval — `#bba37a`（暗金）
  - sp500    — `#7cb89a`（青绿）
  - ust10y   — `#e57373`（粉红）
  - inflation— `#9aa0d4`（紫蓝）
  - brent    — `#c39bd3`（淡紫）
- **Y 轴**：`plotBands` 用 `thresholds` 渲染色带。
- **X 轴**：`plotLines` 在每个 event 日期画虚线 + `label`（事件名称），`tone === 'red'` 用红色字体，否则用灰色。
- **Tooltip**：`shared: true`，依次列出 total + 5 个分量贡献，单位都加 `%`。
- **右上角**：组件外层做一个 `<header>`，左侧标题 + 副标题，右侧大字号显示 `total` 当前值 + `较 N 个交易日前` 的环比。

样式：参考 `TreasuryRatesChart.vue` 的卡片外壳（`bg-[var(--surface)]` + `rounded-xl` + `p-5`）。

### 3.6 在 `views/Macro/index.vue` 中接入

在文件顶部 import：
```ts
import TacoIndexChart from './components/TacoIndexChart.vue'
```

在合适位置（建议放在 Buffett Indicator 之前，因为这个最有"宏观信号"的视觉冲击力）插入：
```vue
<TacoIndexChart />
```

组件内部自己调用 `macroStore.loadTaco()`，外层不传 props。

---

## 4. 验收清单

实现完成后，**子 Agent 必须验证**：

- [ ] `pnpm typecheck` 通过（vue-tsc 无错误）。
- [ ] `python server-py/app.py` 启动后，`curl http://127.0.0.1:8787/api/macro/taco -X POST -H "Content-Type: application/json" -d "{}"` 返回 200，JSON 形状匹配 §2.3 的契约。
- [ ] 前端 `/macro` 路由打开后，新卡片渲染出黑线 + 5 色堆叠柱 + 5 个色带 + 事件标注。
- [ ] 切换 `window` 参数（如改成 10/60）能看到曲线幅度变化。
- [ ] 当 FRED_API_KEY 未配置时，卡片显示明确的报错（沿用现有 `errors` 提示模式），不应整页崩溃。
- [ ] 当 approval 数据源失败时，组件继续渲染其余 4 项 + 在 tooltip 中将 `approval` 显示为 `n/a`。

---

## 5. 已知坑 & 不要做的事

1. **不要把 approval 抓取硬塞进主流程**。如果方案 A/B 抓不到，**直接返回空 series**，让其余 4 项先跑起来。失败重试别写在请求时序里。
2. **不要在 `macro_fred.py` 里加 TACO 逻辑**。CLAUDE.md 明确要求一个 source 一个文件。
3. **不要新建一个 `src/api/taco.ts`**。它属于 macro 域，按现有 macro.ts 扩展即可。
4. **不要 hardcode 阈值/颜色到前端**。后端返回 `thresholds` 数组，前端遍历渲染 `plotBands`。这样以后调参不用动前端代码。
5. **不要用 ECharts**。Macro 页其他图都是 Highcharts，保持一致。
6. **不要新增依赖**。所有所需库（urllib、pandas、yfinance、highcharts）已在项目中。

---

## 6. 子 Agent 任务拆分建议

如果交给子 Agent 分批做：

**Phase 1（后端骨架）**：
- 写 `sources/taco.py`，approval 走占位（返回空）
- 写 `data/taco_events.json` 含 2-3 条示例
- 写 `app.py` 路由
- 用 curl 自测响应

**Phase 2（前端骨架）**：
- 类型 + api + store
- 写 `TacoIndexChart.vue`，先只渲染 `total` 折线 + 色带
- 接入 `Macro/index.vue`

**Phase 3（完善）**：
- 堆叠柱、事件标注、tooltip
- 右上角 KPI 头部

**Phase 4（可选）**：
- 实现真实的 `approval.py`（Silver Bulletin 或 RCP）
- 把事件 JSON 补全到参考图水平

---

## 7. 数据源参考

- FRED：https://fred.stlouisfed.org/
  - `DGS10`：10-Year Treasury Constant Maturity Rate
  - `T5YIE` / `T10YIE`：5Y / 10Y Breakeven Inflation Rate
  - `DCOILBRENTEU`：Brent Spot Price FOB
- yfinance：`^GSPC`、`BZ=F`
- 净支持率：
  - Silver Bulletin（natesilver.net，需观察其 CSV 链接稳定性）
  - RealClearPolitics（HTML 解析）
  - 538（已下线，仅历史数据可用）
