# 解除文件占用

> 解除文件占用，以方便修改删除文件

一个 ZTools 插件，用于查找并解除文件被进程占用的问题。

## 功能特性

- **识别占用进程** — 找出哪个进程锁定了指定文件
- **关闭占用** — 通过 RestartManager API 精准关闭占用文件的进程（仅 Windows）
- **结束进程** — 强制杀掉占用文件的进程（全平台）
- **输入方式** — 支持手动输入路径、拖拽文件、浏览选择

## 平台支持

| 功能 | Windows | macOS | Linux |
|------|---------|-------|-------|
| 查找进程 | RestartManager API | lsof | lsof |
| 关闭占用 | RmShutdown | 不支持 | 不支持 |
| 结束进程 | taskkill /F | kill -9 | kill -9 |

## 项目结构

```
public/
├── logo.png
├── plugin.json
└── preload/
    ├── package.json
    ├── services.js       # 核心 API 实现
    ├── utils.js          # 纯辅助函数
    ├── utils.test.js     # 单元测试
    ├── handle.exe        # Sysinternals Handle (下载，gitignored) — 作为文件占用检测的备用工具
    └── handle-EULA.txt   # Sysinternals License Terms (下载，gitignored)
src/
├── App.vue
├── main.ts
├── main.css
├── env.d.ts
└── Unlock/
    └── index.vue         # 主界面组件
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 运行单元测试
node --test public/preload/utils.test.js
```

## 技术方案

- Windows: PowerShell P/Invoke 调用 RestartManager API (RmStartSession / RmRegisterResources / RmGetList / RmShutdown / RmEndSession)
- macOS / Linux: `lsof` 查找进程，`kill -9` 结束进程

## 开源协议

MIT
