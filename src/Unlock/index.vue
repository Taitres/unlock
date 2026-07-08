<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

const props = defineProps({
  enterAction: {
    type: Object,
    default: null
  }
})

const filePath = ref('')
const processes = ref<any[]>([])
const loading = ref('')
const error = ref('')
const isWindows = ref(false)
const logs = ref<string[]>([])
const showDebug = ref(false)

function addLog(msg: string) {
  const time = new Date().toLocaleTimeString()
  logs.value.push(`[${time}] ${msg}`)
  if (logs.value.length > 50) logs.value.shift()
}

function toggleDebug() {
  showDebug.value = !showDebug.value
}

onMounted(() => {
  isWindows.value = window.ztools.isWindows()
  addLog('插件已加载，平台: ' + (isWindows.value ? 'Windows' : '其他'))
  if (props.enterAction) {
    handleAction(props.enterAction)
  }
})

watch(
  () => props.enterAction,
  (action: any) => {
    if (action) handleAction(action)
  }
)

function handleAction(action: any) {
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
  if (file) {
    const fullPath = window.ztools.getPathForFile(file)
    filePath.value = fullPath
    handleFind()
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
}

async function handleBrowse() {
  const files = window.ztools.showOpenDialog({
    title: '选择要解除占用的文件',
    properties: ['openFile']
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
    addLog('查找完成，发现 ' + result.length + ' 个进程')
    if (result.length === 0) {
      error.value = '该文件没有被任何进程占用（或需要管理员权限才能检测）'
      addLog('未检测到占用进程')
    }
  } catch (err: any) {
    error.value = err.message || '查找失败'
    addLog('查找错误: ' + error.value)
  } finally {
    loading.value = ''
  }
}

async function handleCloseHandle(proc: any) {
  if (!isWindows.value) return
  loading.value = `正在关闭 ${proc.name} 的占用...`
  error.value = ''
  addLog('尝试关闭占用: ' + proc.name + ' (PID: ' + proc.pid + ')')
  try {
    const result = await window.services.closeFileHandle(
      filePath.value.trim(),
      proc.pid
    )
    addLog('关闭结果: ' + result.message)
    window.ztools.showNotification(result.message)
    if (result.success) {
      await handleFind()
    } else {
      error.value = result.message
    }
  } catch (err: any) {
    error.value = err.message || '关闭占用失败'
    addLog('关闭错误: ' + error.value)
  } finally {
    loading.value = ''
  }
}

async function handleKill(proc: any) {
  loading.value = `正在结束 ${proc.name} (PID: ${proc.pid})...`
  error.value = ''
  addLog('尝试结束进程: ' + proc.name + ' (PID: ' + proc.pid + ')')
  try {
    const result = await window.services.killProcess(proc.pid)
    addLog('结束结果: ' + result.message)
    window.ztools.showNotification(result.message)
    if (result.success) {
      await handleFind()
    }
  } catch (err: any) {
    error.value = err.message || '结束进程失败'
    addLog('结束错误: ' + error.value)
  } finally {
    loading.value = ''
  }
}
</script>

<template>
  <div class="unlock">
    <div class="unlock-header">
      <h1>解除文件占用</h1>
    </div>

    <div
      class="unlock-input-area"
      @drop="handleDrop"
      @dragover="handleDragOver"
    >
      <input
        v-model="filePath"
        class="unlock-input"
        placeholder="输入文件路径或拖拽文件到此处"
        @keyup.enter="handleFind"
      />
      <button class="unlock-browse-btn" @click="handleBrowse">浏览</button>
    </div>

    <div v-if="loading" class="unlock-loading">{{ loading }}</div>

    <div v-if="error && !loading" class="unlock-error">{{ error }}</div>

    <div v-if="processes.length > 0" class="unlock-results">
      <div v-for="proc in processes" :key="proc.pid" class="process-card">
        <div class="process-info">
          <span class="process-name">{{ proc.name }}</span>
          <span class="process-pid">PID: {{ proc.pid }}</span>
        </div>
        <div v-if="proc.path" class="process-path">{{ proc.path }}</div>
        <div class="process-actions">
          <button
            :disabled="!isWindows || !!loading"
            class="action-btn close-btn"
            :title="!isWindows ? '该功能仅支持 Windows' : '关闭占用（优雅退出进程）'"
            @click="handleCloseHandle(proc)"
          >
            关闭占用
          </button>
          <button
            :disabled="!!loading"
            class="action-btn kill-btn"
            title="强制结束进程"
            @click="handleKill(proc)"
          >
            结束进程
          </button>
        </div>
      </div>
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
</style>
