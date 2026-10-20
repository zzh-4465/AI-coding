# 账号与云备份上线记录

日期：2026-10-19（北京时间）

- Railway 项目：loving-courage；环境：production。
- 后端地址：https://gregarious-clarity-production-5fb8.up.railway.app
- 发布提交：`b9c6efc08c76186d201055dd744941f4ac26c738`（GitHub `zzh-4465/-`）。
- 后端部署：`a2835874-f0cb-424f-bf5f-c72dfaf36189`，状态 SUCCESS。
- 新增 PostgreSQL 服务：`60e39d89-67cc-4848-9552-9cd35c9be622`。使用持久化卷，后端 DATABASE_URL 引用该服务私网连接串；连接串未写入源码。
- 仅使用现有试用额度，没有升级套餐、添加支付方式或购买额度。

## 已完成验证

线上健康接口 `accounts: true`，原 AI 文本/图片解析版本仍为 2。两个临时账号验证了注册、登录、昵称头像、账号数据隔离、另一会话读取云端账本、旧版本覆盖冲突、退出令牌失效以及注销。结束已删除测试账号及备份。记录见 `verification/cloud-account-check.json`。

验收环境通过本机已配置的系统代理访问 Railway；直接 Node 网络连接该域名曾超时。没有据此宣称完成手机真实网络验收，手机仍需安装后使用自身网络检查。

Android 构建 V2.8.0 / versionCode 29，应用 ID 保持 `com.fanfanyouyu.app`。交付测试 APK 和网页静态部署包；网页包已生成，未新增网页托管服务。

## 使用流程

设置 → 账号与云备份 → 注册或登录 → 需要保留原游客账本时点击“复制此设备的游客账本” → 检查内容 → “备份当前账本”。另一设备登录后从账号入口选择“恢复云端备份”。

登录不会自动上传或复制游客数据。每次手动上传替换上一份云端账本快照，不进行多设备自动合并。密码找回仍未实现，内测需保存用户名和密码。

## 数据库灾难恢复限制

尝试开启每日数据库卷备份时，Railway API 明确返回：`Manual backups and backup schedules are only available for Pro workspaces`。因此没有开通数据库平台级快照或定时备份，也没有进行数据库卷恢复演练；没有为此升级 Pro。

这与应用内按账号保存的“云备份”是两层不同功能。当前应用云备份可用，但数据库自身的灾难恢复保护尚不完整。内测仍应保留本地导出文件，正式开放前应另行落实可用的数据库备份及恢复方案。

官方说明：https://docs.railway.com/pricing/free-trial

试用额度或期限到达后应及时检查服务状态并导出数据。
