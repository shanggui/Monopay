<p align="center">
  <img src="apps/web/public/favicon.svg" width="76" alt="Monopay logo">
</p>

<h1 align="center">Monopay 桌游账房</h1>

<p align="center">
  只接管钱，不接管棋盘。2–6 人桌游的电子银行账本。
</p>

<p align="center">
  <a href="https://github.com/shanggui/Monopay/actions/workflows/ci.yml"><img src="https://github.com/shanggui/Monopay/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/release-v0.1.1-2563EB" alt="v0.1.1">
  <img src="https://img.shields.io/badge/docker%20compose-ready-2496ED" alt="Docker Compose">
</p>

Monopay 是给实体桌游用的电子账本。棋盘、骰子和卡牌照常玩，钱交给它：开桌、发初始资金、付款、退款、银行收款、对账和排名，全部在浏览器完成。手机扫码即可加入，不需要安装 App。

![Monopay 首页](docs/images/m5-home-1440.png)

## 功能

- 房主可创建银行-only 或双身份房间，2–6 名玩家通过房号/二维码加入。
- 玩家付款、银行付款/收款、工资、退款、冲正、破产标记和只读结算。
- 每笔流水保留双方交易后余额，支持幂等重试、筛选、分页和详情。
- 六套主题、数字键盘、到账提示、音效/震动，以及移动端适配。
- 仅使用游戏币 **M**，不可充值、提现或兑换现金。

## 用 Docker Compose 部署

### 准备

- Linux 服务器，`amd64` 或 `arm64`
- Docker Engine 24+ 与 Docker Compose v2
- 有域名：DNS 指向服务器，80/443 可用
- 无域名：放行 `3000` 端口，使用 `http://服务器IP:3000`

镜像：`ghcr.io/shanggui/monopay:v0.1.1`。如果 GHCR 包是私有的，先登录：

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
```

### 有域名：Caddy 自动 HTTPS

```bash
mkdir -p /opt/monopay/{data,backups}
cd /opt/monopay

cp /path/to/Monopay/deploy/compose.yaml .
cp /path/to/Monopay/deploy/Caddyfile .
cp /path/to/Monopay/deploy/deploy.sh .
cp /path/to/Monopay/deploy/smoke.sh .
cp /path/to/Monopay/deploy/.env.example .env

chmod +x deploy.sh smoke.sh
sudo chown -R 1000:1000 data backups
```

编辑 `.env`：

```dotenv
DOMAIN=monopay.example.com
PUBLIC_URL=https://monopay.example.com
MONOPAY_IMAGE=ghcr.io/shanggui/monopay
MONOPAY_TAG=v0.1.1
LOG_LEVEL=info
```

启动并验证：

```bash
./deploy.sh
```

`deploy.sh` 会拉取镜像、等待健康检查，并执行 `smoke.sh`。完成后访问：

```text
https://monopay.example.com/readyz
```

Caddy 会自动申请和续期 HTTPS 证书。

### 没有域名：IP + HTTP

适合局域网试玩或临时验证。生产环境建议补一个域名或免费 DDNS 子域名。

```bash
mkdir -p /opt/monopay/{data,backups}
cd /opt/monopay

cp /path/to/Monopay/deploy/compose.ip.yaml compose.yaml
cp /path/to/Monopay/deploy/.env.ip.example .env

sudo chown -R 1000:1000 data backups
```

编辑 `.env`：

```dotenv
PUBLIC_URL=http://203.0.113.10:3000
APP_PORT=3000
MONOPAY_IMAGE=ghcr.io/shanggui/monopay
MONOPAY_TAG=v0.1.1
```

启动：

```bash
docker compose up -d --wait
```

打开 `http://203.0.113.10:3000`。

> [!NOTE]
> `PUBLIC_URL` 必须和浏览器实际访问地址一致，否则二维码和分享链接会指向错误地址。

### 更新与回滚

```bash
docker compose pull
docker compose up -d --wait
```

通过 `.env` 的 `MONOPAY_TAG` 固定版本；回滚时改回旧 tag，再执行上面两条命令。

### 数据与备份

- `./data`：SQLite 数据库，必须持久化。
- `./backups`：备份目录。
- 每日备份：

```bash
docker compose exec app node scripts/backup.mjs
```

默认保留 7 天。完整备份恢复、回滚和排障见 [部署运行手册](docs/部署运行手册.md)。

> [!IMPORTANT]
> 只运行一个 `app` 副本。房间、余额和 WebSocket 都在单进程内，使用 SQLite，不支持水平扩容。
