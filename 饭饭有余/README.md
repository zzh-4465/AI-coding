# 饭饭有余 · V2.9.1 普通版

面向固定月生活费用户的预算与陪伴式记账应用。此目录是队友协作开发的完整 Web / Android 共用前端及本地后端源码，整理于 2026-10-20。

## 直接开始开发

需要 Node.js 22.12+（推荐 Node.js 22 LTS）和 npm。

```bash
git clone https://github.com/zzh-4465/AI-coding.git
cd AI-coding/饭饭有余
npm ci
npm ci --prefix server
npm run dev
```

打开 http://localhost:5173 。首次进入自行设置预算，默认游客模式，账本保存在当前浏览器本地。

AI、注册登录、云备份和邮箱找回需要后端配置；不配置时可开发本地记账功能。不要把真实用户备份导入开发环境。

## 启动后端（可选）

将根目录 `.env.example` 复制为 `.env`，按需填写服务端 API 密钥、数据库和邮件配置，再另开终端：

```bash
npm run dev:ai
```

前端开发服务器会将 `/api` 转发到本机 8787 端口。仅使用 AI 时可不配置数据库；账号功能需要独立开发用 PostgreSQL，邮件验证和找回还需邮件服务。配置细节见 [server/README.md](server/README.md)。密钥只放服务端环境变量，不能以 `VITE_` 开头。

网页或 Android 连接远程后端时，在自己的 `.env.production.local` 设置 `VITE_AI_API_BASE`；账号服务独立部署时再设置 `VITE_ACCOUNT_API_BASE`。向项目负责人单独索取内测配置，仓库不提供生产密钥。

## 当前功能与版本

- 饮食池、小余仓、应急必备池、愿望池、储蓄池及预算分配。
- 今日预算快照、记账与补记、流水修改删除、资金转移、月度回顾。
- 愿望存取、归档、兑换及滑动操作；V2.9.1 修复愿望卡片滑动体验。
- 一句话 AI 记账、本地备份恢复、饭团养成与积分。
- 配置后端后支持注册登录、手动云备份恢复、邮箱验证及找回。

默认普通版：`VITE_WEB_DEMO=false`、`VITE_ENABLE_BIRTHDAY_TEST=false`、`VITE_ENABLE_TEST_MEMBERSHIP=false`、`VITE_CUSTOM_EDITION` 为空。共享源码保留已有角色组件和日期逻辑；生日测试入口、定制打包脚本、限定版成品及个人配置均不包含在交付中。

`src/main.jsx` 是界面与主要交互入口，`src/styles.css` 是主要样式；预算、资金规则、存储和 AI 解析分别位于 `src/budget.js`、`finance.js`、`storage.js`、`quick-entry-parser.js`。`src/components/` 放组件，`server/` 放 AI 代理与账号服务，`scripts/` 放回归检查，`android/` 是 Capacitor 工程。历史 HarmonyOS 工程未纳入此版交付。

## 检查和打包

```bash
npm test
npm run test:accounts
npm run build
```

UI 检查需要先启动开发服务器，再安装浏览器：`npx playwright install chromium`。可运行 `npm run test:ui`、`npm run test:wish-swipe`。部分历史脚本默认使用 Windows Chrome 路径，可通过 `CHROME_PATH` 指定浏览器路径。

Android 需要 JDK 17 和 Android SDK；按工程配置安装 SDK，并在本机 `android/local.properties` 设置 SDK 路径（不要提交）：

```bash
npm run android:sync
```

然后用 Android Studio 打开 `android/` 构建，或 Windows 下执行 `npm run android:apk`。当前 Android 版本为 `2.9.1`（versionCode 31）。安装包和构建缓存不入库。

## 队友提交方式

```bash
git switch -c feat/你的功能名
# 修改后运行相关检查
git add src scripts
git commit -m "说明本次改动"
git push -u origin feat/你的功能名
```

按实际修改选择提交文件，再在 GitHub 发起 Pull Request 到 `main`。没有推送权限的队友可先 Fork。不要提交 `.env`、密钥、数据库、个人账本、浏览器数据、安装包或 `node_modules`。后端线上部署使用独立仓库，本目录提交不会自动更新该服务。
