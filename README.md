# Monopay 桌游账房

> 只接管钱，不接管棋盘。2–6 人桌游的电子银行账本。

[![CI](https://github.com/shanggui/Monopay/actions/workflows/ci.yml/badge.svg)](https://github.com/shanggui/Monopay/actions/workflows/ci.yml)
[![Release](https://img.shields.io/badge/release-v0.1.1-2563EB)](https://github.com/shanggui/Monopay/releases/tag/v0.1.1)
[![Node](https://img.shields.io/badge/node-%3E%3D24-339933)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-12.14-F69220)](https://pnpm.io/)

实体桌游继续用棋盘、骰子和卡牌；**钱由 Monopay 接管**。开桌、发初始资金、付款、退款、银行收款、对账和结算都在浏览器完成。所有设备打开同一个 Web 应用，手机扫码即可加入。

![Monopay 首页](docs/images/m5-home-1440.png)

## 功能

- **房间**：银行-only / 双身份房主、房号 + 二维码加入、2–6 名玩家、断线重连。
- **账本**：初始资金、玩家付款、银行付款/收款、工资、余额不足保护、幂等重试。
- **纠错**：收款方退款、房主冲正、矫正原因、破产标记/取消。
- **流水**：全部/我付出/我收到/银行、分页、详情、退款/冲正入口。
- **结算**：结束游戏 → 资产/负债 → 净资产排名 → 只读；银行-only 不参与排名。
- **体验**：六套主题、深色、数字键盘、到账 toast、音效/震动、骨架、页面过渡。
- **实时**：WebSocket 房间事件、收款人到账提示、离线横幅、回前台刷新。
- **安全**：CSP/HSTS、创建/加入/付款限流、token hash、日志脱敏、7 天数据清理。

> 仅使用游戏币 **M**，不可充值、提现或兑换现金。

## 快速开始

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
pnpm audit --prod
```

浏览器流程（先启动服务）：

```bash
pnpm flow:m1
pnpm flow:m2
pnpm flow:m3
pnpm flow:m4
pnpm load:m5
pnpm viewports:m5
```

生产构建：

```bash
pnpm build
node apps/server/dist/index.js
```

默认从 `apps/web/dist` 提供 SPA，API 和静态文件同源。

## 架构

```text
apps/
  web/                    Vue 3 + Vite + TypeScript
  server/                 Fastify 5 + Drizzle + SQLite
packages/
  shared/                 Zod schema、API / WS 类型
  ledger-core/            纯账本规则（金额/扣款/入账）
deploy/                   Compose、Caddy、部署/ smoke 脚本
docs/                     产品、设计、验收、运维文档
scripts/                  Playwright 流程、压测、截图
.github/workflows/        CI + 多架构镜像发布
Dockerfile                多阶段生产镜像
```

关键设计：

- **单 app 副本 + 进程内 WebSocket**，SQLite WAL；不支持水平扩容。
- 所有余额变动写 `transactions`，保存双方交易后余额与房间 `seq`。
- 客户端 `clientRequestId` 幂等；同键不同参数拒绝。
- 退款/冲正保留原流水并通过 `refundOf` / `reversalOf` 关联。
- 主题只切 CSS Variables；默认 A 奶油与钴蓝。

## 部署

有域名（Caddy 自动 HTTPS）：

```text
deploy/compose.yaml
deploy/Caddyfile
deploy/.env.example
deploy/deploy.sh
deploy/smoke.sh
```

无域名 / IP + HTTP：

```text
deploy/compose.ip.yaml
deploy/.env.ip.example
```

```bash
mkdir -p /opt/monopay/{data,backups}
cd /opt/monopay
cp /path/to/Monopay/deploy/{compose.yaml,Caddyfile,deploy.sh,smoke.sh} .
cp /path/to/Monopay/deploy/.env.example .env
sudo chown -R 1000:1000 data backups
# 编辑 DOMAIN / PUBLIC_URL / MONOPAY_TAG
chmod +x deploy.sh smoke.sh
./deploy.sh
```

完整步骤、备份恢复、回滚和排障见 **[部署运行手册](docs/部署运行手册.md)**。

镜像：

```text
ghcr.io/shanggui/monopay:v0.1.1   # amd64 + arm64
ghcr.io/shanggui/monopay:latest
```

## 状态与限制

- 当前版本：`v0.1.1`；本地 M0–M5 验收完成。
- 服务器公网 HTTPS 部署待执行；真实 iOS/Android 实机与真实桌游试玩待完成。
- 单副本；SQLite；无离线队列、无真钱、无充值/提现。
- 房间 24 小时无活动自动解散；已结算/已解散房间 7 天后清理。

## 文档

- [文档索引](docs/README.md)
- [产品设计](docs/产品设计.md)
- [UI 设计规范](docs/UI设计规范.md)
- [技术路线（Web）](docs/技术路线-Web版.md)
- [M5 验收记录](docs/M5验收记录.md)
- [部署运行手册](docs/部署运行手册.md)
- [隐私与数据删除](docs/隐私与数据删除.md)
- [Changelog](CHANGELOG.md)

## 参与

- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
