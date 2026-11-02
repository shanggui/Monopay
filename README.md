# Monopay 桌游账房

> 只接管钱，不接管棋盘。2–6 人桌游的电子银行账本。

当前进度：**M0 工程与部署闭环**。页面是工程验收页，房间、付款、账本尚未实现。

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
pnpm typecheck
pnpm test
pnpm build
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
packages/ledger-core     纯账本规则（M2 开始填充）
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

更新：

```bash
docker compose pull
docker compose up -d
```

回滚：把 `.env` 里的 `MONOPAY_TAG` 改回旧版本，再执行上面两条命令。

> 如果服务器已有 Nginx 且 80/443 被占用，删掉 compose 里的 `caddy` 服务，把 app 改成
> `ports: ["127.0.0.1:3000:3000"]`，由现有 Nginx 反代。

## 当前 M0 验收

详见 [M0 验收记录](docs/M0验收记录.md)。

- [x] pnpm workspace
- [x] Vue/Vite 前端 + 默认主题 A
- [x] Fastify `/healthz` / `/readyz`
- [x] SQLite + Drizzle 初始迁移 + `app_meta`
- [x] 生产构建 + SPA fallback
- [x] Dockerfile / Compose / Caddy
- [x] CI / GHCR workflow
- [ ] 首次 GitHub Actions 镜像
- [ ] 服务器 HTTPS 部署
- [ ] 重启持久化 / 回滚演练

## 下一步

按 [落地计划](docs/落地计划.md) 进入 M1：创建/加入房间、大厅、二维码、snapshot、WebSocket 鉴权。

## 合规边界

仅使用游戏币 M，不可充值、提现、兑换现金。不接入真钱，不登记真实资产。
