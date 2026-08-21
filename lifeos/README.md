# LifeOS

LifeOS 是一个个人桌面工作台原型。它希望把每天的计划、常用工具、临时资料、课程表、项目进度和复盘放在同一个空间里，让电脑从“杂乱入口”变成“每天的个人控制中心”。

## 它解决什么问题

- Windows 桌面文件、截图、快捷方式太乱。
- 每日任务分散在不同软件里，打开电脑后很难马上进入状态。
- 学习和项目推进缺少复盘，也不容易看见长期成长。

## 当前功能

- Daily Brief：打开后先看到今日简报。
- Today's Mission：添加今日任务，记录预计时间、实际专注时间和进度。
- 本周计划台：四象限、课程表贴图、本周打卡、月历任务视图。
- 常用工具：集中启动 VSCode、Cursor、ChatGPT 桌面版、文件夹或网页。
- 贴图卡片：拖入或粘贴课程表、截图、灵感图，并支持放大查看。
- Temporary Box：临时收纳文件。
- 每日复盘：记录心情、寄语、未完成原因和个人经验。
- 设为今日锁屏：生成今日简报图，并尝试设置为 Windows 锁屏背景。

## 文件结构

```text
lifeos/
├─ source/        # Tauri 桌面版源码
├─ release/       # Windows 便携版压缩包
├─ docs/          # 产品说明书
└─ README.md      # 当前说明
```

## 如何体验

如果只是想试用：

1. 打开 `release/`。
2. 下载并解压 `LifeOS-Windows-Portable.zip`。
3. 双击 `LifeOS.exe`。

如果 Windows 弹出安全提醒，可以选择“更多信息” -> “仍要运行”。当前版本还没有做代码签名。

## 如何运行源码

需要先安装：

- Node.js
- Rust
- Microsoft Edge WebView2 Runtime

进入源码目录：

```powershell
cd source
npm install
npm.cmd run dev
```

打包：

```powershell
npm.cmd run build
```

## 当前阶段

这是 LifeOS 的 Tauri 桌面 MVP。它已经从网页原型变成可以本地运行的 Windows 桌面应用，但还不是正式商业产品。

后续计划：

- 正式安装包
- 更好的桌面 App 选择器
- 全局网页收藏快捷键
- 文件自动整理
- 跨设备同步
- 更完整的月度/年度复盘后台

## 一句话

LifeOS 帮你把电脑从“打开之后不知道先干什么”，变成“打开之后马上进入今天”。
