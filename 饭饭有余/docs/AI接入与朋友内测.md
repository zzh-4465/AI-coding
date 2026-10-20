# AI 接入与朋友内测

## 一、火山方舟设置

1. 学生和个人小范围内测可先使用个人实名认证。
2. 在「开通管理」中确认 `doubao-seed-2.1-lite` 可用。初次可保持安心体验模式，先使用免费额度。
3. 在「API Key 管理」创建名为 `fanfan-beta` 的 Key。
4. 将 Key 权限限制到当前项目和所用模型；有固定服务器后再增加 IP 白名单。
5. 在开通管理中设置模型用量上限。

不要把 Key 发到群里、聊天窗口或写入 React 代码。

## 二、本机运行

PowerShell 中执行：

```powershell
Copy-Item .env.example .env
notepad .env
```

只在 `.env` 中填写：

```text
ARK_API_KEY=你在控制台创建的Key
```

两个终端分别运行：

```powershell
npm run dev:ai
npm run dev
```

浏览器访问 Vite 地址。可用下列地址检查后端是否已读取 Key：

```text
http://127.0.0.1:8787/api/health
```

`configured` 应为 `true`。

## 三、功能验收

1. 文字多笔：输入「早上饭堂吃香蕉2块，中午西亚吃面15元，晚上KTV花了299」。
2. 期望结果：饮食池2元、饮食池15元、小余仓299元。
3. 无金额片段：不能自动入账，应放在「未自动入账」。
4. 愿望：「要是考试过了，就花50元去吃麦当劳」应创建愿望，不扣款。
5. 图片：先使用脱敏截图，确认金额、商家和日期。
6. 报告：在首页点「月余粮预报」，生成 AI 分析。

## 四、朋友手机内测前

本地 `127.0.0.1` 后端只能供开发电脑使用。发 APK 给朋友前，还需要：

1. 将 `server/ai-proxy.mjs` 部署到一个 HTTPS 后端。
   容器部署时设置 `AI_PROXY_HOST=0.0.0.0`。
2. 构建时将 `VITE_AI_API_BASE` 设为后端 HTTPS 地址。
3. 将 `AI_ALLOWED_ORIGINS` 限制为实际网页域名、`http://localhost` 和 `capacitor://localhost`。
4. 保留服务端限流，并在方舟控制台设置费用/用量上限。
5. 告知测试者：只有主动使用 AI 功能时，当次文字或图片才会上传。

小范围内测建议再设一个可随时更换的访问码：后端设置 `AI_ACCESS_TOKEN`，APK 构建时设置相同的 `VITE_AI_ACCESS_TOKEN`。这不能代替正式用户认证，但可防止公网接口被随手滥用；方舟 API Key 始终只放后端。

后端未部署前，可以先发无 AI 功能的 APK，或让朋友在开发环境中测试。

## 五、部署 HTTPS 代理（Railway 内测方案）

项目已经提供生产启动命令：

```text
npm start
```

部署时按以下顺序操作：

1. 将项目放入私有 GitHub 仓库，确认 `.env` 没有被提交。
2. 在 Railway 新建项目并选择该仓库。
3. 在服务的 Variables 中设置：

```text
ARK_API_KEY=火山方舟密钥
ARK_MODEL=所用模型 ID
AI_RATE_LIMIT=60
AI_ALLOWED_ORIGINS=http://localhost,capacitor://localhost,http://localhost:5173
AI_ACCESS_TOKEN=内测访问码
```

Railway 会自动提供 `PORT`；本项目检测到 `PORT` 后会监听 `0.0.0.0`，不需要把云平台端口写死。若其他平台不提供 `PORT`，再设置 `AI_PROXY_HOST=0.0.0.0` 和对应的 `AI_PROXY_PORT`。

4. 在 Settings > Networking 中生成 HTTPS 域名。
5. 在 Deploy 设置中将 Healthcheck Path 填为 `/api/health`。
6. 打开 `https://你的域名/api/health`，确认返回的 `configured` 为 `true`。
7. 本机构建 APK 前，在 `.env.production` 填写：

```text
VITE_AI_API_BASE=https://你的域名
VITE_AI_ACCESS_TOKEN=与服务端 AI_ACCESS_TOKEN 相同的内测访问码
```

8. 执行 `npm run android:apk`，安装新 APK 后分别验证文字、图片、愿望预算和月报。

注意：`VITE_` 开头的值会进入前端安装包。`VITE_AI_ACCESS_TOKEN` 只能降低内测接口被随手调用的概率，不能替代正式登录鉴权；`ARK_API_KEY` 永远只能配置在服务端。
