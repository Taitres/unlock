# 解除文件占用 (unlock-file)

ZTools 插件 — 检测占用文件/目录的进程并一键结束。仅支持 Windows。

## 功能

- 输入路径或拖拽文件/目录,使用 **Windows Restart Manager** (`RmGetList`) 查找所有占用该资源的进程
- Restart Manager 漏检时,自动回退到 Sysinternals **Handle.exe**,覆盖更广(包括记事本、图片查看器等)
- 展示每个进程的:类型标签 (Service / MainWindow / Explorer / Console / RDP 等)、进程名、PID、应用名、可执行文件完整路径
- 一键 `taskkill /f` 结束进程

## 平台

- Windows 10 / 11 (依赖 Restart Manager API,Win Vista+ 均有)

## 不支持 / 限制

- 不会做「精细关闭单个句柄而不杀进程」这种操作 — 那条路在 Windows 上极其依赖内核权限和进程状态,反复试过不靠谱。本插件提供的是「结束整个进程」,用户可以自己选择要不要结束。
- macOS / Linux 不在支持范围

## 使用方式

1. 在 ZTools 搜索框输入「解除文件占用」,或拖一个文件/目录到搜索框
2. 看到进程列表后,点对应卡片的「结束进程」即可

## 权限说明

- 不以管理员身份运行时:
  - Restart Manager: 完全可用,无需管理员
  - Handle.exe: 只能看到当前用户进程(也就是你想结束的那些)
- 以管理员身份运行 ZTools 时:
  - Handle.exe 能看到所有进程(包括系统服务、其他用户的进程)

## 开发

```bash
npm install
npm run dev      # 启动 vite dev server
npm run build    # 生产构建
npx vue-tsc --noEmit  # 类型检查
node --test public/preload/  # 跑所有 preload 单元测试
```

## 技术栈

- Vue 3 + TypeScript + Vite (前端)
- Electron preload (CommonJS) 调用 PowerShell 5.1
- PowerShell 调用 `rstrtmgr.dll` (Restart Manager) + `handle.exe` (Sysinternals Handle)
- Node `child_process.spawn` 调 `taskkill`

## 项目结构

```
public/
  plugin.json                   # 插件配置 (Windows-only)
  preload/
    services.js                 # Node 桥接层,主入口
    detect-lock.ps1             # Restart Manager 检测 (RmGetList)
    detect-parse.js             # 纯函数:解析 PS1 输出
    detect-parse.test.js
    handle.exe                  # Sysinternals Handle (下载,gitignored)
    handle-EULA.txt             # Sysinternals License (下载,gitignored)
    handle-parse.js             # 纯函数:解析 handle.exe 输出
    handle-parse.test.js
    utils.js                    # taskkill 命令构造
    utils.test.js
    download-handle.ps1         # 一键下载 handle.exe (位于 scripts/)
src/
  Unlock/index.vue              # 唯一 UI 组件
  env.d.ts                      # 类型定义
scripts/
  download-handle.ps1           # 下载/更新 handle.exe 的脚本
docs/
  superpowers/
    specs/2026-07-08-unlock-file-design.md
    plans/2026-07-08-unlock-file-windows.md
```

## 检测逻辑流程

```
用户输入路径
   ↓
[1] Restart Manager RmGetList
   ↓ 找到进程? → 返回 (富信息: appType/appName/exePath)
   ↓ 未找到
[2] handle.exe --accepteula -a <basename>
   ↓ 找到进程? → 返回 (仅 pid/name)
   ↓ 未找到
[3] 若 RM 报告 locked:true → 返回 __LOCKED__ 提示卡
   否则 → 返回空,UI 显示「未检测到占用」
```

## 开源协议

MIT
