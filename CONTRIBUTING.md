# 贡献指南

## 环境

- Node.js 24+
- pnpm 12+
- 可选：Docker（仅部署需要）

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Web: `http://localhost:5173`；API: `http://localhost:3000`。

## 修改前

- 先读 [架构说明](README.md#架构) 与 [产品设计](docs/产品设计.md)。
- 规则改动必须同时改 `packages/ledger-core` / `apps/server/src/rooms/ledger.ts` 和测试。
- 数据库结构改动用 Drizzle 生成迁移，不手改历史迁移：

```bash
pnpm --filter @monopay/server db:generate
```

## 提交前

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

涉及页面/实时流程时，先启动服务再跑：

```bash
pnpm flow:m1
pnpm flow:m2
pnpm flow:m3
pnpm flow:m4
pnpm load:m5
pnpm viewports:m5
```

## 代码约定

- TypeScript strict；共享类型放 `packages/shared`。
- 组件使用 `<script setup lang="ts">`，样式使用 CSS Variables，不引入 UI 框架。
- 金额统一整数游戏币 M；输入输出使用 `moneySchema`。
- 余额变动必须走 `transactions`，禁止只改余额不写流水。
- 客户端写操作带 `clientRequestId`，保持幂等。
- 不提交 `.env`、token、数据库、备份、截图临时文件。

## Commit

使用 Conventional Commits：

```text
feat: add ...
fix: ...
docs: ...
chore: ...
```

一个提交只做一件事；规则、UI、迁移尽量分开，便于回滚。

## 部署文件

改 `deploy/` 时同时检查：

- 有域名版 `compose.yaml` + `Caddyfile`
- 无域名版 `compose.ip.yaml`
- `docs/部署运行手册.md`
- `deploy/smoke.sh` 仍能通过

单副本约束不能改：SQLite + 进程内 WebSocket，不支持多 app 副本。
