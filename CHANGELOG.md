# Changelog

## 0.1.1 — 2026-11-02

### Added

- GHCR 镜像同时构建 `linux/amd64` 与 `linux/arm64`（QEMU + buildx）。
- `deploy/deploy.sh`：拉取镜像、等待健康检查、执行 smoke test。
- `deploy/smoke.sh`：健康检查、首页、安全头、创建/加入房间。
- `.gitattributes` 固定 shell 脚本 LF。

## 0.1.0 — 2026-11-02

首个可试玩 MVP（本地验证完成，生产部署待执行）。

### Added

- 房间：创建、加入、二维码、房号、6 人上限、银行-only/双身份、24 小时自动解散。
- 账本：初始资金、玩家付款、银行付款/收款、工资、余额不足保护、幂等键。
- 纠错：收款方退款、房主冲正、矫正原因、破产标记/取消。
- 流水：筛选、分页、详情、关联退款/冲正、只读结算。
- 结算：结束游戏、资产/负债、净资产排名、并列名次、银行-only 不参与、只读。
- 体验：六套主题、深色、数字键盘、到账 toast、音效/震动、骨架屏、页面过渡、离线提示。
- 实时：WebSocket 鉴权、房间事件、断线重连、回前台刷新。
- 安全：Helmet/CSP、Caddy HSTS、创建/加入/付款限流、token hash、日志脱敏。
- 运维：Docker Compose + Caddy、GHCR、备份/恢复脚本、健康检查、运行手册。
- 测试：ledger-core 3 + server 32；1000 笔重放、6 人并发、100 笔对账、退款/冲正/结算。

### Known limitations

- 单 app 副本；SQLite。
- 未在真实 iOS Safari / Android Chrome 实机验收。
- 未做真实桌游试玩。
- 服务器 HTTPS/备份恢复待最终环境验证。
