<script setup lang="ts">
import { ref, onMounted } from 'vue'

const filePath = ref('')
const processes = ref([])
const loading = ref('')
const error = ref('')
const isWindows = ref(false)

onMounted(() => {
  isWindows.value = window.ztools.isWindows()
})

function handleDrop(e: DragEvent) {
  e.preventDefault()
  const file = e.dataTransfer?.files[0]
  if (file) {
    const fullPath = window.ztools.getPathForFile(file)
    filePath.value = fullPath
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
  try {
    processes.value = await window.services.findLockingProcesses(filePath.value.trim())
    if (processes.value.length === 0) {
      error.value = '该文件没有被任何进程占用'
    }
  } catch (err: any) {
    error.value = err.message || '查找失败'
  } finally {
    loading.value = ''
  }
}

async function handleCloseHandle(proc: any) {
  if (!isWindows.value) return
  loading.value = `正在关闭 ${proc.name} 的占用...`
  error.value = ''
  try {
    const result = await window.services.closeFileHandle(
      filePath.value.trim(),
      proc.pid
    )
    window.ztools.showNotification(result.message)
    if (result.success) {
      await handleFind()
    }
  } catch (err: any) {
    error.value = err.message || '关闭占用失败'
  } finally {
    loading.value = ''
  }
}

async function handleKill(proc: any) {
  loading.value = `正在结束 ${proc.name} (PID: ${proc.pid})...`
  error.value = ''
  try {
    const result = await window.services.killProcess(proc.pid)
    window.ztools.showNotification(result.message)
    if (result.success) {
      await handleFind()
    }
  } catch (err: any) {
    error.value = err.message || '结束进程失败'
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

    <button class="unlock-find-btn" @click="handleFind">查找占用进程</button>

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
  </div>
</template>

<style scoped>
.unlock {
  padding: 20px;
  box-sizing: border-box;
}

.unlock-header h1 {
  font-size: 18px;
  margin: 0 0 16px 0;
}

.unlock-input-area {
  display: flex;
  gap: 8px;
  padding: 8px;
  border: 1px dashed var(--border-color, #ccc);
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
  color: var(--text-color, #333);
}

.unlock-browse-btn {
  padding: 4px 12px;
  border: 1px solid var(--border-color, #ccc);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-color, #333);
}

.unlock-browse-btn:hover {
  background: var(--hover-color, #f5f5f5);
}

.unlock-find-btn {
  margin-top: 12px;
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 6px;
  background: var(--primary-color, #42b883);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.unlock-find-btn:hover {
  opacity: 0.9;
}

.unlock-find-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.unlock-loading {
  margin-top: 16px;
  text-align: center;
  color: var(--text-color, #666);
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
  border: 1px solid var(--border-color, #e8e8e8);
  border-radius: 8px;
  background: var(--card-bg, #fafafa);
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
</style>
