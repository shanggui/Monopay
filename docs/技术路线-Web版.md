# Monopay 技术路线 v3：Web + 自有服务器

> 版本：v3.1 ｜ 日期：2026-11-02 ｜ 对应产品设计 v3.3
>
> v3.1：Node.js 升到 24 LTS；部署改为 GitHub Actions 构建、GHCR 镜像、服务器 Compose 只拉镜像；新增 [落地计划](落地计划.md)。
>
> 结论：**不做小程序、不做云开发、不做 LAN Host App。所有设备用浏览器打开同一个 Web 应用；服务端部署在现有服务器上。**
>
> 这是目前兼容性最好、部署最简单、改造成本最低的路线；角色、付款、退款、结算规则不变。

---

## 0. 结论先行

- **客户端**：移动优先的 Web App（Vue 3 + Vite + TypeScript + Vant 4 + Tailwind CSS + Motion One）。
- **服务端**：Node.js 24 LTS + TypeScript + Fastify + WebSocket + SQLite（已有 Postgres/MySQL 也可替换）。
- **部署**：Docker Compose + 现有 Nginx/Traefik 等反向代理；TLS 在反代终止。
- **房间**：服务端创建；房主/玩家都用浏览器；扫码/点链接加入。
- **身份**：房号 + `playerToken`；房主 `hostToken`；不需要微信登录/openid。
- **实时**：WebSocket 推送；断线重连 + 快照补偿。
- **成本**：服务器已有；新增只有域名/HTTPS（可选），没有云开发费、没有小程序审核。
- **工期**：全职约 4–6 周；云开发原路线 5–8 周，LAN Host 8–12 周。

---

## 1. 为什么 Web 版更合适

| 维度 | 小程序 + 云开发 | 小程序 + LAN Host | **Web + 自有服务器** |
|---|---|---|---|
| 兼容性 | 仅微信 | 仅微信 + 非 iPhone host | **任何现代浏览器，iOS/Android/PC** |
| 部署 | 云开发 + 审核 | Host App + 热点 + LAN TCP | **一个 Web 服务 + HTTPS** |
| 房主设备 | 任意手机 | 必须非 iPhone/Android | **任意设备，浏览器即可** |
| 实时 | 云 watch | 自写 TCP | **标准 WebSocket** |
| 审核 | 小程序类目 | 小程序 LAN TCP 风险 | **无小程序审核** |
| 成本 | 20–70 元/月 | 0 云费 + Host 设备 | **服务器已有；仅域名/证书** |
| 户外 | 有信号即可 | 热点/同 Wi-Fi | **有信号即可（服务器公网）** |
| 安装 | 微信内 | 微信 + Host App | **浏览器，无需安装** |

你已有服务器，Web 版直接把“兼容性、部署、审核、host 设备”四个问题一起解决。

---

## 2. 总体架构

```text
┌──────────────── 手机/平板/电脑浏览器 ────────────────┐
│  Monopay Web App（移动优先 SPA）                      │
│  ├─ 房主模式：开房、银行、流水、结算                   │
│  ├─ 玩家模式：加入、付款、流水、结算                   │
│  ├─ WebSocket：房间事件                                │
│  └─ 二维码/分享链接                                    │
└──────────────────────────┬───────────────────────────┘
                           │ HTTPS / WSS
┌──────────────────────────▼───────────────────────────┐
│  已有服务器                                            │
│  ├─ Nginx/Traefik（HTTPS、静态资源、反代）              │
│  ├─ Node.js + Fastify（REST + WebSocket）              │
│  ├─ SQLite/Postgres（房间、玩家、流水、结算）          │
│  └─ 备份/日志                                          │
└──────────────────────────────────────────────────────┘
```

### 2.1 一次付款

```text
玩家点确认
  → POST /api/rooms/:code/actions/playerPay
  → 服务端校验 token/房间/余额/幂等
  → DB 事务：扣款、加款、写 transactions、room.seq+1
  → WebSocket 广播 event
  → 收款人播音效；其他人静默刷新
  → 返回 transaction + 最新余额
```

### 2.2 开房/加入

```text
房主打开 Web：
  → 创建房间（身份/初始资金/人数/工资）
  → 服务端生成 roomCode + hostToken
  → 页面显示 URL/二维码：https://monopay.example.com/r/ABC123

玩家扫码/点链接：
  → 打开 /r/ABC123
  → 输入昵称 → POST join
  → 服务端返回 playerToken
  → 进入大厅；WebSocket 连接
```

---

## 3. 技术选型

| 层 | 选择 | 理由 | 备选 |
|---|---|---|---|
| 前端 | Vue 3 + Vite + TypeScript | 轻、模板直观、移动端生态好 | React + Vite |
| UI | Vant 4 + Tailwind CSS | 移动组件全、可深度主题化 | Varlet / antd-mobile（React） |
| 路由/状态 | Vue Router + Pinia | 简单、够用 | React Router + Zustand |
| 动画 | Motion One / `@vueuse/motion` | 小而流畅，CSS 优先 | Framer Motion（React） |
| 图标 | Lucide | SVG、轻、风格统一 | 自绘 SVG |
| 后端 | Node.js 24 LTS + TypeScript + Fastify | 与前端共享类型/ledger-core；性能足够 | Express/NestJS |
| 实时 | WebSocket（`ws` / `@fastify/websocket`） | 标准、低延迟、易调试 | SSE + 轮询 |
| 数据库 | SQLite（MVP）/ Postgres（已有） | 几桌人数据量极小；零运维 | MySQL |
| ORM | Drizzle 或 手写 SQL + 迁移 | 轻量、可控 | Prisma |
| 校验 | Zod | 前后端共享 schema | Yup |
| 构建 | pnpm + Vite + esbuild/tsup | 快 | npm/yarn |
| 部署 | Docker Compose + 现有反代 | 一键、HTTPS | systemd + Nginx |
| 测试 | Vitest + Fastify inject + Playwright | 单元/接口/E2E | Jest |

### 3.1 为什么 REST + WebSocket，而不是全 WebSocket

- REST 负责“命令/查询”：创建、加入、付款、退款、结算、快照；容易调试、重试、幂等。
- WebSocket 只负责“服务端 → 客户端事件”：交易、房间状态、玩家变化、结算。
- 断线时 REST 拉快照；WebSocket 重连后补 `seq`。
- 比自写 TCP 协议简单得多，浏览器/Nginx/云服务器都原生支持。

### 3.2 为什么 SQLite 够用

- 一局 2–6 人，单局几百笔交易；SQLite 轻松。
- 单进程 Node + SQLite，`BEGIN IMMEDIATE` 事务，零额外服务。
- 已有 Postgres/MySQL 时，把 repo 层替换即可；SQL 保持简单。

### 3.3 为什么 Vue 3 + Vant + Tailwind

- Vant 的移动组件正好覆盖付款场景：`NumberKeyboard`、`Field`、`Popup`、`Dialog`、`List`、`PullRefresh`、`Tabbar`。
- Tailwind 负责布局、间距、颜色 token；Vant 只提供行为和基础组件，**不要直接用默认皮肤**。
- 通过 CSS 变量 + Tailwind 主题做“奶油纸卡 + 墨蓝 + 钴蓝主色 + 珊瑚支出 + 青绿收入”的桌游银行质感；A–F 主题只换 token，关键组件（余额卡、付款面板、玩家行、成功动画）自定义。
- 动画优先 CSS transform/opacity + Motion One；150–300ms，弹簧感，不做重动画。
- 如果团队 React 更熟：React + Vite + antd-mobile + Framer Motion，后端不变。
- 如果追求极致轻/流畅且愿意换栈：Svelte + Tailwind + Bits UI；但不建议为了性能在 MVP 换团队不熟的框架。

---

## 4. 代码结构

```text
monopay/
├─ apps/
│  ├─ web/                    # Vue 3 + Vite + Vant 前端
│  │  ├─ src/
│  │  │  ├─ pages/            # 首页/加入/大厅/我的账本/银行台/付款/流水/对账
│  │  │  ├─ components/
│  │  │  ├─ services/api.ts   # REST
│  │  │  ├─ services/ws.ts    # WebSocket
│  │  │  ├─ services/audio.ts
│  │  │  ├─ store/
│  │  │  └─ styles/
│  │  └─ index.html
│  └─ server/                 # Fastify + WS
│     ├─ src/
│     │  ├─ index.ts
│     │  ├─ routes/           # rooms/actions/snapshot/transactions
│     │  ├─ ws/               # 房间频道、事件广播
│     │  ├─ usecases/         # create/join/pay/refund/settle...
│     │  ├─ repo/             # SQLite/Postgres 适配
│     │  ├─ auth.ts
│     │  └─ validate.ts
│     └─ migrations/
├─ packages/
│  ├─ ledger-core/            # 纯 TS：转账/退款/冲正/结算规则
│  └─ shared/                 # 类型、Zod schema、错误码
├─ deploy/
│  ├─ compose.yaml
│  └─ .env.example
├─ scripts/
│  ├─ backup.sh
│  └─ consistency-100.ts
└─ docs/
```

- 前端/后端共享 `ledger-core` 和 `shared`，规则只写一份。
- `ledger-core` 不依赖数据库/HTTP，可用 Vitest 单测。
- 服务端 `repo` 负责 SQLite/Postgres；用例层只依赖接口。

---

## 5. 数据模型

### 5.1 表

```sql
rooms (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE,              -- 6 位房号
  status TEXT,                   -- waiting/playing/settling/settled
  host_identity TEXT,            -- bank_only/dual
  host_token_hash TEXT,          -- 房主 token 的 hash
  config_json TEXT,              -- initialFunds/salary/maxPlayers/largeConfirm/sound
  seq INTEGER DEFAULT 0,
  created_at INTEGER, started_at INTEGER, ended_at INTEGER,
  settling_at INTEGER, settled_at INTEGER, dissolved_at INTEGER,
  last_event_at INTEGER
)

players (
  id TEXT PRIMARY KEY,
  room_id TEXT,
  token_hash TEXT,               -- 玩家 token 的 hash
  nickname TEXT, avatar TEXT,
  is_player INTEGER, is_banker INTEGER,
  balance INTEGER,
  status TEXT,                   -- active/bankrupt/left
  bankrupt_at INTEGER,
  joined_at INTEGER
)

transactions (
  id TEXT PRIMARY KEY,
  room_id TEXT,
  seq INTEGER,
  from_type TEXT, from_player_id TEXT,
  to_type TEXT, to_player_id TEXT,
  amount INTEGER,
  balance_after_from INTEGER,
  balance_after_to INTEGER,
  category TEXT, note TEXT, source TEXT,
  status TEXT,                   -- success/refunded/reversed
  reversal_of TEXT, refund_of TEXT,
  operator_id TEXT,
  client_request_id TEXT,
  created_at INTEGER,
  UNIQUE(room_id, client_request_id),
  UNIQUE(room_id, seq)
)

asset_snapshots (
  room_id TEXT, player_id TEXT,
  property_value INTEGER, debt INTEGER, note TEXT,
  updated_at INTEGER,
  PRIMARY KEY(room_id, player_id)
)

settlements (
  id TEXT PRIMARY KEY, room_id TEXT UNIQUE,
  rankings_json TEXT, created_at INTEGER
)

room_events (
  id TEXT PRIMARY KEY, room_id TEXT,
  type TEXT, actor_id TEXT, payload_json TEXT, created_at INTEGER
)
```

### 5.2 索引

- `rooms.code` 唯一；
- `rooms.status + last_event_at`；
- `players.room_id + id`；
- `transactions.room_id + seq` 唯一；
- `transactions.room_id + client_request_id` 唯一；
- `asset_snapshots(room_id, player_id)` 主键；
- `settlements.room_id` 唯一；
- `room_events.room_id + created_at`。

### 5.3 金额与事务

- 金额整数 M，>0，上限 1e9。
- 玩家转出必须 `balance >= amount`；不允许负余额。
- 银行无限，不校验余额。
- 每笔交易记录双方交易后余额；房间 `seq` 单调递增。
- 所有写操作 `BEGIN IMMEDIATE`（SQLite）/事务（Postgres）。
- 幂等：`room_id + client_request_id` 唯一；重复请求返回原交易。

---

## 6. 接口

### 6.1 通用

```ts
type ApiResponse<T> =
  | { ok: true; data: T; serverTime: number }
  | { ok: false; error: { code: string; message: string; details?: unknown }; serverTime: number };
```

认证：`Authorization: Bearer <token>`。

- 房主：创建房间返回 `hostToken`；存 localStorage。
- 玩家：加入返回 `playerToken`；存 localStorage。
- 服务端只存 token hash；不存明文。

### 6.2 REST

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/rooms` | 创建房间；返回 roomCode/hostToken/URL |
| `POST` | `/api/rooms/:code/join` | 加入；昵称；返回 playerToken |
| `GET` | `/api/rooms/:code/snapshot` | 房间/玩家/最近流水/me |
| `GET` | `/api/rooms/:code/transactions` | 分页流水 |
| `POST` | `/api/rooms/:code/actions/start` | 房主开始 |
| `POST` | `/api/rooms/:code/actions/end` | 房主结束 → settling |
| `POST` | `/api/rooms/:code/actions/resume` | 房主返回 playing |
| `POST` | `/api/rooms/:code/actions/pay` | 玩家付款 |
| `POST` | `/api/rooms/:code/actions/bank-pay` | 银行付款 / 工资 |
| `POST` | `/api/rooms/:code/actions/bank-collect` | 银行收款 |
| `POST` | `/api/rooms/:code/actions/refund` | 收款方退款 |
| `POST` | `/api/rooms/:code/actions/reverse` | 房主冲正 |
| `POST` | `/api/rooms/:code/actions/bankrupt` | 标记/取消破产 |
| `POST` | `/api/rooms/:code/actions/assets` | 提交资产/负债 |
| `POST` | `/api/rooms/:code/actions/confirm` | 房主确认结算 |
| `POST` | `/api/rooms/:code/actions/dissolve` | 解散 |
| `GET` | `/api/rooms/:code/qr` | 房间 URL 二维码（PNG/SVG） |

### 6.3 WebSocket

连接：`wss://host/ws?room=CODE&token=...`

- 服务端验证 token + 房间成员。
- 加入房间频道；推送事件。
- 客户端发送 `ping`；服务端 `pong`；30s 无响应断开。
- 事件带 `seq`；客户端记录 `lastSeq`。
- 重连：先 `GET snapshot?sinceSeq=lastSeq`，再开 WS；或 WS `resume`。

事件：

```json
{ "type": "transaction", "seq": 17, "data": { "transaction": { "...": "..." } } }
{ "type": "room", "seq": 18, "data": { "status": "playing" } }
{ "type": "player", "seq": 19, "data": { "playerId": "p_2", "balance": 2200 } }
{ "type": "settlement", "seq": 20, "data": { "rankings": [] } }
{ "type": "kick", "data": { "reason": "host" } }
```

- 收款人判断 `event.data.transaction.toPlayerId === me.playerId`；响。
- 退款事件 `toPlayerId` 是原付款人；原付款人响。
- 开局资金不发事件；冲正不发 sound 事件。

### 6.4 错误码

`INVALID_ARGUMENT` / `ROOM_NOT_FOUND` / `ROOM_FULL` / `ROOM_STATE` / `FORBIDDEN` / `INSUFFICIENT_BALANCE` / `DUPLICATE_REQUEST` / `NOT_REFUNDABLE` / `ALREADY_TERMINAL` / `NOT_SETTLING` / `ALREADY_SETTLED` / `RATE_LIMITED` / `INTERNAL`。

---

## 7. 核心流程

### 7.1 创建/加入

```text
POST /api/rooms:
  校验参数；生成 6 位 code（唯一）；生成 hostToken；写 rooms
  返回 { roomCode, hostToken, url }

POST /api/rooms/:code/join:
  校验 room waiting/playing?（MVP 只允许 waiting 加入）
  校验人数；生成 playerToken；写 players
  返回 { playerToken, playerId }
```

- 房主默认也是玩家（双身份）或银行-only；由 `hostIdentity` 决定。
- 银行-only 房主不占玩家名额；双身份占 1。
- 开局后不允许新玩家加入（MVP）。

### 7.2 开始

```text
房主 start:
  校验 waiting；玩家数 >=2（双身份计入，银行-only 不计）
  单事务：每个 isPlayer 发初始资金 + 写 initial 流水 + room.seq
  room.status = playing
```

- 初始资金只发一次；重试幂等。
- 如果事务操作数限制，逐人发放 + `funded_at` 标记（同 v1 设计）。

### 7.3 付款

```text
playerPay:
  校验 playing；token 对应玩家；toType/toPlayerId；金额/类别/备注
  事务：
    读 payer/payee/room
    玩家付款：payer.balance >= amount；银行不校验
    扣款/加款；写 transaction；room.seq+1
  WS 广播 transaction
  返回 transaction + balances
```

- 幂等：`clientRequestId` 唯一。
- 余额不足返回 `INSUFFICIENT_BALANCE`；前端提示先收款/抵押/变卖。
- 双身份房主付款必须显式 `fromType`：`player` / `bank`。
- 银行付款/收款、工资只允许 hostToken。

### 7.4 退款/冲正

- 退款：原收款方；全额；原路退回；终态。
- 冲正：房主；填原因；终态。
- 同一笔原交易只能退/冲一次；退款/冲正交易本身不能再退/冲。
- 不能造成负余额：反向转出方余额不足则拒绝，提示先补足。
- 退款/冲正和原交易状态更新在**同一个事务**。

### 7.5 结算

```text
end: playing -> settling
assets: 玩家填资产/负债；房主可代填
confirm: 房主确认
  事务：
    读 players + asset_snapshots
    净资产 = cash + propertyValue - debt
    排名；银行-only 排除；破产标记
    写 settlements；room.settled
```

- `settling` 期间可退款/冲正/填资产；确认后只读。
- 确认前房主可 `resume` 回 playing。
- 并列净资产并列名次。
- 破产玩家参与排名并标记。

---

## 8. 前端设计

### 8.1 页面

| 页面 | 内容 |
|---|---|
| 首页 | 创建房间 / 加入房间 / 最近房间 |
| 加入 | 房号/链接、昵称 |
| 大厅 | 房号/二维码、玩家列表、开始 |
| 我的账本 | 我的余额、玩家余额、最近流水 |
| 银行台 | 发工资、银行付款/收款、冲正、累计发行 |
| 付款 | 收款人、金额、类别、来源、确认 |
| 流水 | 分页、筛选、详情、退款 |
| 对账 | 资产/负债、排名、确认/返回 |
| 设置 | 音效、规则、解散 |

### 8.2 移动优先

- Viewport、`100dvh`、safe-area insets；触控目标 ≥ 44px。
- 单列布局；底部操作栏；大金额键盘。
- 不依赖 hover；兼容 iOS Safari/Android Chrome。
- 默认主题 A“奶油与钴蓝”；B–F 通过 `data-theme` 切换，只换 CSS 变量，不重挂页面；深色主题 F 需翻转文字/纸卡 token。

### 8.3 音效

- HTMLAudioElement；首次点击“开启音效”解锁。
- 收款人根据 WS 事件播放；其他玩家不播。
- 队列/去重（transactionId）；最多 5 条。
- 后台标签页/锁屏不保证播放；流水为准。
- 银行收款静音；退款原付款人响；开局资金不响。

### 8.4 二维码/分享

- 房间 URL：`https://domain/r/CODE`。
- 房主页面用 `qrcode` 生成二维码；也可复制链接。
- 玩家用相机/微信扫一扫打开浏览器；微信内浏览器若限制，提示“用 Safari/Chrome 打开”。
- 不依赖小程序码/微信登录。

### 8.5 断线重连

- `playerToken`/`hostToken` 存 localStorage；刷新/重连不丢。
- WS 断开：指数退避重连；先拉 snapshot + `sinceSeq`。
- 页面 `visibilitychange`：回前台拉快照。
- 多设备同 token：MVP 允许，可能重复音效；P1 设备心跳。

### 8.6 视觉方向（默认 A + 主题库）

> 完整视觉、组件、页面内容与文案规范见 [UI设计规范.md](UI设计规范.md)。旧 [视觉原型](design/prototype/index.html) 是深绿金币方向，仅保留页面结构参考，不作为视觉验收依据。

- 默认方向 A：**桌游银行 · 奶油与钴蓝**；像一盒桌游里的银行配件，不像赌桌。
- 材质：奶油纸卡 + 墨蓝字 + 钴蓝主色 + 珊瑚支出 + 青绿收入；不用深绿桌布、金币、黄铜、筹码、金属渐变。
- 主题库：A 奶油与钴蓝（默认）、B 燕麦与松绿、C 石墨与橘、D 雾紫与柠檬、E 海盐与番茄、F 咖啡与电光青；同一布局只换 token。
- 关键页面自定义，不要直接堆 Vant 默认皮肤：
  - 余额卡：大号金额 + 细字说明 + 钴蓝银行标签；不用金币/金属卡。
  - 玩家行：首字头像 + 昵称 + 余额 + 破产/银行标记；不用筹码。
  - 付款：白色底部抽屉 + 数字键盘 + 快捷金额 + 类别 chips。
  - 成功页：勾选 + 金额 count-up + 到账横幅；不用硬币翻转。
  - 流水：回单式账本行，收入青绿、支出珊瑚红，冲正/退款有明确状态。
- 设计 tokens：`paper / ink / primary / income / expense / line` 统一放 Tailwind theme / CSS 变量；主题只挂根节点 `data-theme`，存 localStorage。
- 字体：系统字体（PingFang SC/Noto Sans SC）；金额用等宽数字；不加载复古衬线/书法字体。
- 图标：Lucide SVG；用银行/回单/用户/箭头，不用金币/筹码/骰子/扑克。
- 品牌：旧“深绿底 + 金币 M”图标退出默认；重做为纸卡/回单 + M 字标，确认后再替换 `docs/design/brand/icon-*`。
- 新配色预览：`docs/design/preview-v2/index.html`（A）、`docs/design/preview-v2/themes.html`（A–F）。

### 8.7 动效与流畅度

- 页面切换 150–250ms 淡入/滑动；底部抽屉弹簧；按钮按压缩放；数字键盘触感。
- 付款成功：勾选/纸张滑入 + 金额 count-up；收款人到账横幅；总时长 <600ms。
- 流水只对新交易做 50ms stagger；不要每项都动画。
- 只动 `transform`/`opacity`；避免 layout/`box-shadow` 动画；`will-change` 少用。
- 用 Motion One / `@vueuse/motion`；不引 GSAP；尊重 `prefers-reduced-motion`。
- 中端 Android 目标 60fps；流水分页，超过 100 条再考虑虚拟滚动。
- 触感：`navigator.vibrate`（Android 支持较好，iOS 有限）；音效配合。
- 钱相关操作以“清晰、快”为先，不做超过 300ms 的阻塞动画。

---

## 9. 安全

- 全站 HTTPS；WSS；HSTS。
- 房号 6 位随机；加入限流（IP/token）。
- token 随机 128-bit；服务端存 hash；不写日志。
- 房主权限服务端校验；前端隐藏按钮只是体验。
- 输入校验：Zod；金额整数；备注 50 字；类别枚举；消息大小限制。
- CORS 同源；CSP；禁止内联脚本（按需）。
- 速率限制：加入/付款/退款/登录。
- 数据保留：房间 24h 过期；定时清理；备份。
- 不接真钱；不存手机号/位置；隐私政策。

---

## 10. 测试

- `ledger-core` 单测：转账/退款/冲正/结算/负余额/权限/幂等。
- API 集成：Fastify `inject`；房间生命周期、付款、退款、结算、并发。
- WS 测试：连接/广播/重连/seq。
- E2E：Playwright；iOS Safari/Android Chrome 手测。
- 100 笔付款对账；重复请求；开局失败重试；结算竞态。
- 6 人并发付款；同一付款人并发；余额边界。
- 备份/恢复演练。

---

## 11. 部署

### 11.1 服务器要求

- Linux（Ubuntu 22.04+）；Docker Engine + Compose；SQLite。
- 1 核 1G 足够几桌人；已有服务器直接用。
- 可选域名 + HTTPS 证书；TLS 由现有 Nginx/Traefik 终止，证书不放进 app 容器。
- 端口：app 默认绑定 `127.0.0.1:3000`，由反代转发；无域名时绑定 `0.0.0.0:3000`。
- Node.js 24 LTS 只用于本地开发/构建；服务器不需要装 Node。

### 11.2 Docker Compose（推荐）

镜像由 GitHub Actions 构建并推到 GHCR，服务器只拉镜像，不在服务器上编译：

```yaml
services:
  app:
    image: ghcr.io/OWNER/monopay:${MONOPAY_TAG:-latest}
    environment:
      PUBLIC_URL: ${PUBLIC_URL}
      DB_PATH: /data/monopay.db
      TRUST_PROXY: 'true'
    ports:
      - '127.0.0.1:3000:3000'
    volumes:
      - ./data:/data
      - ./backups:/backup
    restart: unless-stopped
```

复制 `compose.yaml` + `.env.example` 为 `.env`，改 `PUBLIC_URL` / `MONOPAY_TAG`，然后：

```bash
docker compose pull
docker compose up -d --wait
```

反向代理把 HTTPS 转发到 `127.0.0.1:3000`；完整步骤见 [部署运行手册](部署运行手册.md)。

### 11.3 裸机

```bash
pnpm install
pnpm build
node apps/server/dist/index.js
```

systemd + Nginx 反代；SQLite 文件放 `/var/lib/monopay/`；每日备份。

### 11.4 备份/监控

- SQLite 每日 `sqlite3 .backup` 或文件快照；保留 7 天。
- 日志：JSON 一行；`roomId`/`playerId`/`action`/`code`/`duration`；不打印 token。
- 监控：`/healthz`；进程/磁盘/证书到期；简单 uptime 监控。
- 预算：服务器已有；域名/证书按年。

---

## 12. 里程碑

| 阶段 | 内容 | 估时 |
|---|---|---|
| M0 | 仓库/构建/DB/迁移/Fastify/健康检查 | 2–3 天 |
| M1 | 房间创建/加入/大厅/二维码/snapshot | 3–5 天 |
| M2 | 付款/工资/银行/流水/WS/幂等 | 5–7 天 |
| M3 | 退款/冲正/破产/结算 | 4–6 天 |
| M4 | Web UI 移动适配/音效/重连/错误态 | 4–6 天 |
| M5 | 测试/部署/HTTPS/备份/试玩修复 | 4–6 天 |

**总计：全职约 4–6 周；业余 6–10 周。**

> 执行版计划、每个阶段的 Gate、测试矩阵与发布清单见 [落地计划](落地计划.md)。实际排期按 26–36 人日估算，含测试与部署。

---

## 13. 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| 服务器/域名/HTTPS 未就绪 | 无法开局 | 先用 IP + HTTP 内测；正式上 HTTPS |
| 移动浏览器音频限制 | 收款人漏提示 | 首次点击解锁；流水兜底；P1 订阅消息 |
| WebSocket 被反代断开 | 实时延迟 | Nginx `proxy_read_timeout`；心跳/重连；轮询兜底 |
| 微信内浏览器限制 | 打不开/音频异常 | 提示用 Safari/Chrome；二维码用相机扫 |
| 数据丢失 | 账本丢失 | 每日备份；SQLite WAL；导出 |
| 房间码被猜 | 陌生人加入 | 6 位随机；限流；房主确认；短时房间 |
| 公网暴露 | 被扫/攻击 | HTTPS、限流、CSP、最小端口、fail2ban |
| 无离线 | 户外无信号不可用 | 服务器公网 + 4G；或后续 PWA/离线模式 |
| 规则漂移 | 前后端不一致 | `ledger-core` 单一实现；共享测试 |

---

## 14. 相对 v1/v2 的删除项

- 删除微信小程序、`wx.*` API、小程序审核、`wxacode`。
- 删除云开发、云函数、云数据库、`watch`。
- 删除 LAN Host App、Android 前台服务、热点、`wx.createTCPSocket`。
- 删除 iPhone host 限制；任何浏览器都能开房。
- 删除 `openid` 依赖；改本地 token。
- 删除 Gate 0（LAN TCP spike）；改为 Web/HTTPS 部署验证。

---

## 15. 需要确认的服务器信息

1. 服务器系统：Linux 发行版/版本？
2. 是否已装 Docker Engine + Compose？服务器 CPU 架构是 amd64 还是 arm64？
3. 是否有域名 + HTTPS？还是只有公网 IP？
4. 数据库：SQLite 够用，还是已有 Postgres/MySQL？
5. 服务器是公网还是局域网？公网则玩家可远程加入；局域网则同一 Wi-Fi。
6. 是否有备份/监控/防火墙？

这些只影响部署细节，不影响上面的架构；没有域名也可以先用 `http://IP:3000` 内测，正式再上 HTTPS。

---

## 16. 结论

Web + 自有服务器是当前最优路线：

- 所有设备浏览器打开，兼容性最好；
- 不需要小程序审核/云开发/ LAN Host；
- 服务端已有，增量成本几乎为 0；
- 规则/账本/数据模型可以复用，前端重写；
- 全职 4–6 周可到可试玩。

下一步：确认服务器信息，直接进入 M0 工程骨架。
