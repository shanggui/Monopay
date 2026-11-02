# Monopay 桌游账房

> 只接管钱，不接管棋盘。2–6 人桌游的电子银行账本。

当前进度：**M5 本地验收完成，等待生产部署**。完整账本、纠错、结算、六套主题、音效和实时反馈已本地通过；1000 笔重放、6 人并发、备份恢复、安全头和重启持久化已验证。服务器 HTTPS 部署是最后一步。

## 技术栈

- Web：Vue 3 + Vite + TypeScript + Vant 4 + Tailwind CSS
- Server：Fastify 5 + TypeScript + SQLite + Drizzle
- 共享：`packages/shared`（Zod / API 类型）、`packages/ledger-core`（纯账本规则）
- 部署：Docker Compose + Caddy + GHCR

## 本地开发

要求：Node.js 24+、pnpm 12+。

```bash
cp .env.example .env
pnpm install
pnpm dev
```

- Web：http://localhost:5173
- API：http://localhost:3000
- 健康检查：`/healthz`、`/readyz`
- 本地 SQLite：`apps/server/data/dev.db`

Vite 会把 `/healthz`、`/readyz`、`/api`、`/ws` 代理到 3000 端口。

## 质量检查

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

浏览器流程（需要先启动服务）：

```bash
pnpm flow:m1
pnpm flow:m2
pnpm flow:m3
pnpm flow:m4
pnpm load:m5
pnpm viewports:m5
```

生产构建后可直接跑：

```bash
pnpm build
node apps/server/dist/index.js
```

默认从 `apps/web/dist` 提供 SPA，API 和静态文件同源。

## 目录

```text
apps/web                 Vue 3 前端
apps/server              Fastify + SQLite
packages/shared          前后端共享类型/Zod
packages/ledger-core     纯账本规则（金额/扣款/入账）
deploy                   compose / Caddy / 生产 env 示例
.github/workflows        CI + GHCR 镜像发布
Dockerfile               多阶段生产镜像
docs                     产品、UI、技术、落地计划
```

## 镜像与 GHCR

GitHub Actions 在 `main` 和 `v*` tag 上构建镜像：

```text
ghcr.io/shanggui/monopay:main
ghcr.io/shanggui/monopay:sha-xxxxxxx
ghcr.io/shanggui/monopay:v0.1.0
```

第一次发布后，到 GitHub：

```text
仓库 → Packages → monopay → Package settings → Danger Zone → Change visibility → Public
```

否则服务器 `docker pull` 需要先 `docker login ghcr.io`。

手工触发：GitHub Actions → `publish-image` → Run workflow。

## 服务器部署

服务器只需要 Docker Engine + Compose，不需要 Node。

```bash
mkdir -p /opt/monopay/data
cd /opt/monopay

# 复制 deploy/compose.yaml、deploy/Caddyfile、deploy/.env.example 到当前目录
cp /path/to/deploy/compose.yaml .
cp /path/to/deploy/Caddyfile .
cp /path/to/deploy/.env.example .env

# 编辑 .env：DOMAIN / PUBLIC_URL / MONOPAY_TAG
sudo chown -R 1000:1000 data

docker compose pull
docker compose up -d
docker compose ps
```

打开 `https://<DOMAIN>/readyz` 验证。Caddy 会自动申请 HTTPS 证书。

完整步骤、备份/恢复、回滚和排障见 [部署运行手册](docs/部署运行手册.md)。数据边界见 [隐私与数据删除](docs/隐私与数据删除.md)。

更新：

```bash
docker compose pull
docker compose up -d
```

回滚：把 `.env` 里的 `MONOPAY_TAG` 改回旧版本，再执行上面两条命令。

> 如果服务器已有 Nginx 且 80/443 被占用，删掉 compose 里的 `caddy` 服务，把 app 改成
> `ports: ["127.0.0.1:3000:3000"]`，由现有 Nginx 反代。
>
> 没有域名时使用 [deploy/compose.ip.yaml](deploy/compose.ip.yaml) 与
> [deploy/.env.ip.example](deploy/.env.ip.example)，走 `http://IP:3000`；可完成功能验证，
> 但不等于 HTTPS 生产验收。

## M1 房间生命周期（本地完成）

- 创建房间：银行-only / 双身份、初始资金、人数、工资、大额阈值、音效。
- 加入房间：6 位房号、昵称、头像；重复凭证按重连处理。
- 大厅：房号、二维码、复制链接、玩家列表、房主/银行标识、实时连接状态。
- 服务端：`POST /api/rooms`、`POST /api/rooms/:code/join`、`GET /api/rooms/:code/snapshot`、`POST /api/rooms/:code/actions/dissolve`。
- WebSocket：首帧 `auth` 鉴权、`ready` / `player_joined` / `room_updated`、断线重连。
- 数据库：`rooms`、`players`、`room_events`，Drizzle 迁移 `0001`。
- 24 小时无活动房间自动标记解散。

详见 [M1 验收记录](docs/M1验收记录.md)。

## M2 账本核心与付款（本地完成）

- 开局：房主开始，至少 2 名玩家，初始资金只发一次。
- 玩家付款：玩家 → 玩家 / 玩家 → 银行；余额不足拒绝；双身份可切换“我的钱/银行”。
- 银行台：发工资、银行付款、银行收款、累计发行/回收/净投放。
- 幂等：`clientRequestId` 唯一；重复请求返回原交易；同键不同参数拒绝。
- 流水：最近流水、双方、类别、备注、状态；WS `transaction` 实时刷新。
- 页面：我的账本、付款页、银行台；大厅开始游戏后自动进入。
- 测试：`ledger-core` 3 + server 21；包含 100 笔对账、6 笔并发、幂等、余额不足、权限。

详见 [M2 验收记录](docs/M2验收记录.md)。

## M3 纠错、破产与结算（本地完成）

- 退款：收款方发起、全额原路、关联原交易；初始资金/退款/冲正不可再退。
- 冲正：房主操作、必须原因、保留原交易；退款/冲正不可再冲。
- 破产：房主标记/取消；不能主动付款/退款，可被动收款；排名保留标记。
- 流水：全部/我付出/我收到/银行、游标分页、详情、退款/冲正入口。
- 对账：结束游戏 → 结算中 → 资产/负债 → 净资产排名 → 只读。
- 排名：并列名次；银行-only 房主不参与。
- 测试：`ledger-core` 3 + server 30；含退款、冲正、破产、结算、只读。

详见 [M3 验收记录](docs/M3验收记录.md)。

## M4 体验与实时打磨（本地完成）

- 主题：A 奶油与钴蓝默认，B–F 六套；localStorage；F 深色翻转。
- 反馈：收款人专属 toasts/音效/震动；Web Audio 合成；静音持久化。
- 付款：自绘数字键盘；快捷金额；余额不足/离线禁用。
- 动效：160ms 页面过渡、成功卡、骨架屏、`prefers-reduced-motion`。
- 实时：WS 状态、离线横幅、回前台刷新、自动重连。
- 图标：纸卡 M favicon、manifest、theme-color。
- 回归：`flow:m2`、`flow:m3`、`flow:m4` 均通过。

详见 [M4 验收记录](docs/M4验收记录.md)。

## M5 验收、安全与上线准备（本地完成）

- 测试：`ledger-core` 3 + server 32，共 35；lint/format/typecheck/build 全通过。
- 重放：1000 笔顺序付款余额/流水一致；6 人并发付款 6/6 成功。
- 恢复：SQLite Online Backup → 新库 → `/readyz` 200，房间/流水计数一致。
- 重启：同 DB 重启后房间与凭证仍可读。
- 安全：CSP/HSTS/Helmet、创建/加入/付款限流、token hash、日志脱敏；`pnpm audit --prod` 0 漏洞。
- 布局：390/768/1440 无横向滚动。
- 文档：运行手册、隐私与数据删除、Changelog。

详见 [M5 验收记录](docs/M5验收记录.md)。

## M0 工程与部署验收

详见 [M0 验收记录](docs/M0验收记录.md)。

- [x] pnpm workspace
- [x] Vue/Vite 前端 + 默认主题 A
- [x] Fastify `/healthz` / `/readyz`
- [x] SQLite + Drizzle 初始迁移 + `app_meta`
- [x] 生产构建 + SPA fallback
- [x] Dockerfile / Compose / Caddy
- [x] CI / GHCR workflow
- [x] 首次 GitHub Actions 镜像（`sha-738b12c`）
- [ ] 服务器 HTTPS 部署
- [ ] 重启持久化 / 回滚演练

## 下一步

本地 M0–M5 已完成。剩余：把 `v0.1.0` 镜像部署到用户的服务器，完成 HTTPS、smoke test、备份定时任务和回滚演练。步骤见 [部署运行手册](docs/部署运行手册.md)。

## 合规边界

仅使用游戏币 M，不可充值、提现、兑换现金。不接入真钱，不登记真实资产。
