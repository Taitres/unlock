<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import type { ProcessInfo, LockedHint } from '../env'

const props = defineProps({
  enterAction: {
    type: Object as () => { type: string; payload?: any } | null,
    default: null
  }
})

const filePath = ref('')
const processes = ref<(ProcessInfo | LockedHint)[]>([])
const loading = ref('')
const error = ref('')
const showDebug = ref(false)
const logs = ref<string[]>([])

function addLog(msg: string) {
  const time = new Date().toLocaleTimeString()
  logs.value.push(`[${time}] ${msg}`)
  if (logs.value.length > 50) logs.value.shift()
}

function toggleDebug() {
  showDebug.value = !showDebug.value
}

onMounted(() => {
  addLog('插件已加载')
  if (props.enterAction) handleAction(props.enterAction)
})

watch(
  () => props.enterAction,
  (action) => { if (action) handleAction(action) }
)

function handleAction(action: { type: string; payload?: any }) {
  if (action.type === 'files' && action.payload && action.payload.length > 0) {
    const first = action.payload[0]
    const p = first.path || (first.name ? first.name : '')
    if (p) {
      filePath.value = p
      handleFind()
    }
  }
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  const file = e.dataTransfer?.files[0]
  if (!file) return
  let fullPath = ''
  if (window.ztools.getPathForFile) {
    try { fullPath = window.ztools.getPathForFile(file) } catch {}
  }
  if (!fullPath && (file as any).path) fullPath = (file as any).path
  if (fullPath) {
    filePath.value = fullPath
    handleFind()
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
}

async function handleBrowse() {
  const files = window.ztools.showOpenDialog({
    title: '选择要解除占用的文件或目录',
    properties: ['openFile', 'openDirectory']
  })
  if (files && files.length > 0) {
    filePath.value = files[0]
    handleFind()
  }
}

async function handleFind() {
  if (!filePath.value.trim()) {
    error.value = '请输入文件路径'
    return
  }
  loading.value = '正在查找占用进程...'
  error.value = ''
  processes.value = []
  addLog('开始查找: ' + filePath.value.trim())
  try {
    const result = await window.services.findLockingProcesses(filePath.value.trim())
    processes.value = result
    addLog('查找完成,共 ' + result.length + ' 项')
    if (result.length === 0) {
      error.value = '该文件没有被任何进程占用'
      addLog('未检测到占用')
    }
  } catch (err: any) {
    error.value = err.message || '查找失败'
    addLog('查找错误: ' + error.value)
  } finally {
    loading.value = ''
  }
}

async function handleKill(proc: ProcessInfo) {
  if (proc.pid === -1) return
  loading.value = `正在结束 ${proc.name} (PID: ${proc.pid})...`
  error.value = ''
  addLog('尝试结束进程: ' + proc.name + ' (PID: ' + proc.pid + ')')
  try {
    const result = await window.services.killProcess(proc.pid)
    addLog('结束结果: ' + result.message)
    window.ztools.showNotification(result.message)
    if (result.success) {
      await handleFind()
    } else {
      error.value = result.message
    }
  } catch (err: any) {
    error.value = err.message || '结束进程失败'
    addLog('结束错误: ' + error.value)
  } finally {
    loading.value = ''
  }
}

function isProcessInfo(p: ProcessInfo | LockedHint): p is ProcessInfo {
  return p.pid !== -1
}
</script>

<template>
  <div class="unlock">
    <div class="unlock-header">
      <h1>解除文件占用</h1>
      <p class="unlock-subtitle">仅支持 Windows · 检测占用进程并一键结束</p>
    </div>

    <div
      class="unlock-input-area"
      @drop="handleDrop"
      @dragover="handleDragOver"
    >
      <input
        v-model="filePath"
        class="unlock-input"
        placeholder="输入文件或目录路径,或拖拽到此处"
        @keyup.enter="handleFind"
      />
      <button class="unlock-browse-btn" @click="handleBrowse">浏览</button>
    </div>

    <div v-if="loading" class="unlock-loading">{{ loading }}</div>

    <div v-if="error && !loading" class="unlock-error">{{ error }}</div>

    <div v-if="processes.length > 0" class="unlock-results">
      <template v-for="(proc, idx) in processes" :key="idx">
        <div v-if="!isProcessInfo(proc)" class="process-card hint-card">
          <div class="hint-icon">&#128274;</div>
          <div class="hint-text">
            <template v-if="proc.locked">
              <strong>文件仍被占用,但本插件无法识别具体进程。</strong><br />
              常见原因:文件正被另一个用户进程、系统服务、杀毒软件或 Windows Search Indexer 持有。
              <ul>
                <li>检查是否刚杀掉了进程,等几秒再试(索引器/杀毒可能在重建扫描)</li>
                <li>以<strong>管理员身份</strong>运行 ZTools 后重新检测,可见所有进程</li>
                <li>检查 Windows Defender / 第三方杀毒是否正在扫描该文件</li>
                <li>若反复出现,使用 <a href="https://learn.microsoft.com/sysinternals/downloads/handle" target="_blank">Sysinternals Handle</a> + 管理员权限手动查看</li>
              </ul>
            </template>
            <template v-else>
              <strong>无法查询占用信息。</strong><br />
              Restart Manager API 调用失败,可能是权限或路径异常:
              <ul>
                <li>确认文件路径存在且可访问</li>
                <li>以管理员身份运行 ZTools 后重试</li>
                <li>若反复失败,安装 <a href="https://learn.microsoft.com/sysinternals/downloads/handle" target="_blank">Handle</a> 作为兜底</li>
              </ul>
            </template>
          </div>
        </div>

        <div v-else class="process-card">
          <div class="process-info">
            <span class="process-app-type" :data-type="proc.appType">{{ proc.appType }}</span>
            <span class="process-name">{{ proc.name }}</span>
            <span class="process-pid">PID: {{ proc.pid }}</span>
          </div>
          <div v-if="proc.appName" class="process-app-name">{{ proc.appName }}</div>
          <div v-if="proc.exePath" class="process-path">{{ proc.exePath }}</div>
          <div class="process-actions">
            <button
              :disabled="!!loading"
              class="action-btn kill-btn"
              title="强制结束进程"
              @click="handleKill(proc)"
            >结束进程</button>
          </div>
        </div>
      </template>
    </div>

    <div v-if="logs.length > 0" class="debug-panel">
      <div class="debug-header" @click="toggleDebug">
        <span>调试日志 ({{ logs.length }})</span>
        <span class="debug-toggle">{{ showDebug ? '▼' : '▶' }}</span>
      </div>
      <div v-if="showDebug" class="debug-logs">
        <div v-for="(log, idx) in logs" :key="idx" class="debug-line">{{ log }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.unlock {
  padding: 20px;
  box-sizing: border-box;
  color: var(--text-color, #e0e0e0);
}

.unlock-header h1 {
  font-size: 18px;
  margin: 0 0 16px 0;
}

.unlock-input-area {
  display: flex;
  gap: 8px;
  padding: 8px;
  border: 1px dashed var(--border-color, #555);
  border-radius: 6px;
  transition: border-color 0.2s;
}

.unlock-input-area:hover {
  border-color: var(--primary-color, #42b883);
}

.unlock-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 14px;
  background: transparent;
  color: var(--text-color, #e0e0e0);
}

.unlock-input::placeholder {
  color: var(--text-secondary, #888);
}

.unlock-browse-btn {
  padding: 4px 12px;
  border: 1px solid var(--border-color, #555);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-color, #e0e0e0);
}

.unlock-browse-btn:hover {
  background: var(--hover-color, #333);
}

.unlock-loading {
  margin-top: 16px;
  text-align: center;
  color: var(--text-color, #aaa);
}

.unlock-error {
  margin-top: 16px;
  padding: 12px;
  border-radius: 6px;
  background: #fff2f0;
  color: #cf1322;
  font-size: 13px;
}

.unlock-results {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.process-card {
  padding: 14px;
  border: 1px solid var(--border-color, #444);
  border-radius: 8px;
  background: var(--card-bg, #2a2a2a);
}

.hint-card {
  border-color: #faad14;
  background: #2a1f00;
}

.hint-icon {
  font-size: 24px;
  margin-bottom: 8px;
}

.hint-text {
  font-size: 13px;
  line-height: 1.6;
  color: #e0a800;
}

.hint-text a {
  color: #ffc53d;
}

.process-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.process-name {
  font-weight: 600;
  font-size: 14px;
}

.process-pid {
  font-size: 12px;
  color: var(--text-secondary, #999);
}

.process-path {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary, #999);
  word-break: break-all;
}

.process-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.close-btn {
  background: #e6f7ff;
  color: #096dd9;
}

.close-btn:hover:not(:disabled) {
  background: #bae7ff;
}

.kill-btn {
  background: #fff1f0;
  color: #cf1322;
}

.kill-btn:hover:not(:disabled) {
  background: #ffccc7;
}

.debug-panel {
  margin-top: 16px;
  border: 1px solid var(--border-color, #444);
  border-radius: 6px;
  overflow: hidden;
}

.debug-header {
  padding: 8px 12px;
  background: var(--card-bg, #2a2a2a);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary, #999);
}

.debug-toggle {
  font-size: 10px;
}

.debug-logs {
  max-height: 200px;
  overflow-y: auto;
  padding: 8px 12px;
  background: #1a1a1a;
  font-family: monospace;
  font-size: 11px;
  line-height: 1.6;
}

.debug-line {
  color: #a0a0a0;
  word-break: break-all;
}

.admin-retry-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  background: #faad14;
  color: #000;
}

.admin-retry-btn:hover {
  background: #ffc53d;
}

.unlock-subtitle {
  font-size: 12px;
  color: var(--text-secondary, #888);
  margin: 4px 0 0 0;
  font-weight: normal;
}

.process-app-type {
  display: inline-block;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 600;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  background: #555;
  color: #fff;
  margin-right: 8px;
  vertical-align: middle;
}
.process-app-type[data-type="Service"] { background: #cf1322; }
.process-app-type[data-type="Console"] { background: #096dd9; }
.process-app-type[data-type="MainWindow"] { background: #389e0d; }
.process-app-type[data-type="Explorer"] { background: #d48806; }
.process-app-type[data-type="Critical"] { background: #722ed1; }

.process-app-name {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary, #aaa);
  word-break: break-all;
}

.hint-text ul {
  margin: 6px 0 0 0;
  padding-left: 20px;
}
.hint-text li {
  margin: 2px 0;
}
</style>
