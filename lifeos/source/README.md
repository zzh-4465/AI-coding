# LifeOS Tauri Desktop MVP

这是从 `lifeos-prototype` 迁出的桌面版 MVP 源码。

## 目标能力

- 全屏无边框启动
- 保留现有 Daily Brief 和 Dashboard UI
- 本地启动应用、文件、文件夹
- 本地 JSON 数据保存
- 生成 Daily Brief PNG，并尝试设置为 Windows 锁屏背景
- 一键锁定电脑

## 本机当前缺少的环境

当前机器已有 Node/npm，但还没有 Rust/Cargo。Tauri 需要 Rust 工具链。

安装 Rust 后，在本目录运行：

```powershell
npm install
npm run dev
```

打包安装包：

```powershell
npm run build
```

## 说明

Windows 真锁屏不能像普通页面一样交互。当前实现采用产品级可行方案：LifeOS 生成一张今日简报图片，调用 Windows LockScreen API 尝试设置为锁屏背景，然后可以锁定电脑。
