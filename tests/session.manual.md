# Task 4 手动验证清单

## 前置
- `node --input-type=module -e "import('./src/main/browser/session.ts').then(...)"` 或临时脚本调用 `launchSession`。
- 准备一个临时 profile 目录。

## 步骤

### 1. 启动 → 停在首页 → 手动登录 → 检测到登录态
- [ ] 调用 `launchSession(tmpProfile)`，弹出可见浏览器窗口。
- [ ] 导航到小红书首页 `https://www.xiaohongshu.com`。
- [ ] 手动登录（手机号+短信 或 扫码）。
- [ ] 调用 `waitForLogin(page, '.user .avatar, .avatar-wrapper', 180000)`。
- 预期：登录后返回 `true`，进程不退出。

### 2. 不登录等满超时 → 返回 false 且不挂
- [ ] 再次启动（或清空登录态），导航到首页后不登录。
- [ ] 调用 `waitForLogin(page, 一个不存在的选择器 '.definitely-not-there-xyz', 10000)`。
- 预期：约 10 秒后返回 `false`，无异常，进程不挂。

### 结果
- [ ] 两项均通过
