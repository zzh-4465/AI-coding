# 饭饭有余后端（AI、账号、邮箱找回与云备份）

独立 Node.js 后端。AI 可单独运行；账号与云备份使用 `pg` 连接 PostgreSQL。此目录可单独部署。

## Railway 部署

1. 将本目录中的所有运行时 `.mjs`（不含 `accounts.test.mjs`）、`package.json`、`package-lock.json`、`Dockerfile`、`.dockerignore`、`.gitignore` 和本说明文件上传到仓库根目录。
2. Railway 新建项目，选择 Deploy from GitHub repo，选择该私有仓库。
3. 在 Variables 填写以下变量，再部署：

| 变量 | 内容 |
| --- | --- |
| ARK_API_KEY | 火山方舟密钥，仅填写在 Railway |
| ARK_MODEL | 已开通的模型 ID |
| AI_ACCESS_TOKEN | 自行生成的长随机内测访问码 |
| AI_RATE_LIMIT | 60 |
| AI_ALLOWED_ORIGINS | https://localhost,http://localhost,capacitor://localhost,http://localhost:5173 |
| DATABASE_URL | 账号数据库的 PostgreSQL 连接串，仅服务端配置；留空禁用账号功能 |

`Dockerfile` 已设置监听 `0.0.0.0`，程序自动读取 Railway 的 `PORT`，无需安装依赖或构建前端。

4. Settings 中将 Healthcheck Path 设置为 `/api/health`。
5. Networking > Generate Domain 生成 HTTPS 域名，目标端口使用服务实际监听的 PORT。
6. 打开 `https://你的域名/api/health`，确认 `ok` 和 `configured` 均为 true。这个接口仅检查服务与密钥是否配置，完整验证还需要发起一次 AI 请求。
7. 本机主项目 `.env.production.local` 设置 `VITE_AI_API_BASE=https://你的域名`（末尾不加斜杠）和 `VITE_AI_ACCESS_TOKEN=与服务端一致的访问码`，然后重新打包 APK。

## 内测边界

访问码可从 APK 中提取，仅适合小范围内测。正式开放前需要用户登录、持久化的调用额度和费用上限。当前限流按连接来源 IP 计算，云代理后的多个用户可能共用同一个额度；重启会清零。CORS 不是身份验证。

账本默认保存在用户本机。登录后，只有用户主动点击“备份当前账本”才上传完整快照；恢复会替换当前账号的本机账本并保留恢复前快照。当前没有自动同步或多设备合并。

不要上传 `.env`、真实密钥、账本备份或个人文档。Docker 镜像仅安装生产依赖并复制后端 `.mjs`。

## 开通账号与云备份

1. 准备一个持久化 PostgreSQL 数据库，把连接串设置为后端 `DATABASE_URL`。数据库需允许创建表；初次启动会创建 `fanfan_users`、`fanfan_sessions`、`fanfan_backups`，不会删除已有表。连接串按数据库供应方要求开启 TLS，不要关闭证书校验。
2. 后端执行 `npm ci --omit=dev` 后启动，或使用本目录 Dockerfile。账号与 AI 共用同一服务地址，无需向前端提供数据库密码。
3. `/api/health` 的 `accounts: true` 表示启动时已连接数据库并完成建表；数据库后续故障由实际请求返回错误。未配置或启动连接失败时，账号接口返回 503，本地记账和已配置的 AI 不受影响。
4. 前端沿用 `VITE_AI_API_BASE`。仅当账号服务独立部署时设置 `VITE_ACCOUNT_API_BASE`。更改前端配置后需要重新构建网页或 APK。将网页实际域名加入 `AI_ALLOWED_ORIGINS`，云端使用 HTTPS。
5. 真机验证：注册 → 复制游客账本 → 手动上传 → 另一设备登录 → 从初始化页面进入账号面板 → 恢复云端备份。

### 当前范围

- 用户名为 4–32 位字母、数字、下划线，大小写不敏感；密码为 10–128 位。已验证邮箱可用于登录和找回原账号。手机号、第三方登录和邮箱换绑暂未接入。
- 密码使用随机盐 scrypt 派生，服务端仅保存会话令牌的 SHA-256 摘要。会话有效期 30 天，退出即时撤销当前会话，注销级联删除全部会话和该用户云备份。
- 昵称和四种预设头像可编辑，没有上传头像、社区、评论、私信或支付。
- 每个账号保留一份最新云备份，最大 2MB。上传使用版本比较，旧设备覆盖会返回 409，需刷新并再次确认。云备份不可代替数据库级灾难恢复，应由部署方另行开启数据库自动备份并验证恢复。
- 游客与各账号使用不同的本地键。登录不自动迁移游客账本；“复制游客账本”保留游客原件。退出保留账号本地账本，重新登录后可继续；共享设备需注意本地数据。注销会清理当前设备上该账号的数据及快照，其他设备离线副本需自行清理。
- 登录状态保存在前端本地存储；当前为受控内测方案。当前登录限流在进程内，按连接 IP 和用户名计数，重启会清零；反向代理下连接 IP 可能共享，扩大部署前应接入可信代理来源及共享限流。
- AI 仍使用原内测访问码和原额度机制，账号登录不代表已接通正式会员、支付或用户级 AI 额度。

### 验证

`npm ci` 后运行 `npm test`。测试使用仅开发依赖 PGlite 执行 PostgreSQL 表结构和查询，覆盖注册、密码验证、账号隔离、并发备份冲突、坏备份拒绝、会话到期、退出、注销。它不替代目标云数据库的连接/TLS/持久化验收。

从项目根目录运行 `npm run test:accounts` 可同时检查前端账号命名空间和跨页面身份切换保护。根目录 `npm ci`、后端 `npm ci --prefix server` 后，启动前端 `npm run dev`，执行 `npm run test:accounts-ui` 可用本机 Chrome 验证完整界面流程；可通过 `CHROME_PATH` 指定浏览器，`APP_URL` 指定前端地址。界面测试将账号请求接到独立的 PGlite 测试库，不连接真实云库、不触发短信或 AI 费用，截图保存于 `docs/verification/account-mobile.png`。

## 邮箱验证与密码找回

Railway 官方明确说明：Trial、Free、Hobby 禁用对外 SMTP；SMTP 仅适用于 Pro 及以上。不要为试用环境填写163邮箱授权码，也不要仅为 SMTP 自动升级付费套餐。此限制此前漏查，原 SMTP 适配在当前试用部署上无法使用。

当前优先使用 Brevo HTTPS API，服务端配置 `MAIL_PROVIDER=brevo`、`BREVO_API_KEY`、`MAIL_FROM`（已在 Brevo 验证的发信邮箱地址），可选 `MAIL_FROM_NAME=饭饭有余`。不会使用或发送163的 SMTP 授权码。账号审批、发件人验证和实际送达必须通过后才能宣告可用。免费额度以平台后台当前规则为准，达到限额时返回发送失败，不自动购买额度。

Brevo 支持对未认证/公共邮箱发件地址进行平台域名替换，这只适合初期测试；上线时应配置自有域名认证以改善可信度及送达。新注册的163邮箱仍可用作产品联系、平台注册和验证邮箱，不等于获得了163域名的发信认证权限。

仅在允许 SMTP 的部署环境中，才使用 `MAIL_PROVIDER=smtp` 和 `SMTP_HOST`、`SMTP_PORT`（465 或 587）、`SMTP_USER`、`SMTP_PASS`、`MAIL_FROM`。SMTP密码项使用专用发信邮箱授权码。465 使用隐式 TLS，587 强制 STARTTLS，保留证书校验。以上所有密钥仅保存在服务端，不能设置为 VITE 变量、写进代码或发在聊天中。

官方限制：https://docs.railway.com/networking/outbound-networking

API文档：https://developers.brevo.com/reference/send-transac-email

未配置完整时 `/api/account/capabilities` 返回 `emailRecovery: false`，前端提示服务未开通，不使用假邮件或公开验证码。配置存在不等于已验证实际送达；开通前必须由发信邮箱持有人收取一次真实测试邮件，检查收件箱和垃圾邮件。

- 登录后以当前密码申请绑定，再输入邮件中的8位验证码；验证成功才保存邮箱，保留原用户 ID 和账本。一个邮箱只能绑定一个账号。暂不提供换绑，防止绕过旧邮箱验证。
- 验证码10分钟有效、至多5次错误尝试、成功后删除；数据库只存验证码摘要。发信频率和每日额度持久化，重启不清零。
- 未登录可申请密码重置。未知和已知邮箱返回相同通用文案，SMTP发送异步执行，不在接口中返回验证码。SMTP失败记录通用错误并删除未送达挑战，用户可稍后重试。
- 新密码设置成功即撤销该账号全部会话和待用验证码，并发送密码变更通知。必须重新登录；原账本不变。
- 已登录用户绑定邮箱不会替换账号，原用户不强制重新注册。未绑定邮箱且忘记密码的账号不能通过邮件找回。

## 独立加密数据库备份（不依赖平台 Pro 快照）

项目根目录的 `scripts/run-database-backup.ps1` 临时登记专用公钥，经 SSH 在现有后端内读取数据库的一致性快照，结束时撤销该公钥。服务器用 RSA 公钥封装临时 AES-256-GCM 密钥，加密后才传回本机；私钥始终留在本机。包含用户、验证邮箱和账本，不包含登录会话、验证码及发信限额表。当前固定绑定本文项目的后端 SSH 实例，迁移项目时需更新配置。

在 Windows PowerShell 中运行 `./scripts/run-database-backup.ps1` 完成密钥初始化、临时授权、导出、恢复校验及授权撤销，需要本机 Railway 已登录。若系统已启用 HTTP 代理，会仅为本次 SSH 使用它，不修改系统配置。`./scripts/run-database-backup.ps1 -VerifyOnly` 只在空测试库里验证最近快照，不连接线上。底层 `node scripts/database-backup.mjs --verify .private-backup/snapshots/具体文件.enc.json` 也可单独验证。

`.private-backup/` 已加入根目录 .gitignore，不能上传到源码仓库、Docker、网页包或 APK。快照和私钥需要分别存放到安全位置；丢失私钥就无法解密。当前是手动独立备份，并未创建自动定时任务。只生成脚本不算完成备份，必须确认快照文件和恢复验证均成功。

`restoreEmptyDatabase` 仅允许恢复到空数据库；现有账号或账本非空则拒绝写入。恢复时增加账号安全版本，且不恢复登录态。恢复目标需由操作者明确选择，不提供直接覆盖生产数据的快捷命令。
