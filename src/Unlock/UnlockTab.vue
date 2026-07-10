<script setup lang="ts">
import { ref } from 'vue'
import type { ProcessInfo } from '../env'

const props = defineProps<{
  addLog: (msg: string) => void
  flushDebugLog: () => void
}>()

const filePath = ref('')
const processes = ref<ProcessInfo[]>([])
const loading = ref('')
const error = ref('')
const isDragOver = ref(false)
let dragCounter = 0

function handleDragEnter(e: DragEvent) { e.preventDefault(); dragCounter++; isDragOver.value = true }
function handleDragLeave(e: DragEvent) { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { isDragOver.value = false; dragCounter = 0 } }
function handleDragOver(e: DragEvent) { e.preventDefault(); e.stopPropagation() }

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  dragCounter = 0
  var dt = e.dataTransfer
  if (!dt || !dt.files || !dt.files[0]) {
    props.addLog('drop: no files')
    return
  }
  var file = dt.files[0]
  props.addLog('drop: ' + file.name)
  var fullPath = ''
  if (window.services.getPathForFile) {
    try { fullPath = window.services.getPathForFile(file) } catch (e) {}
  }
  if (!fullPath && (file as any).path) fullPath = (file as any).path
  if (fullPath) { filePath.value = fullPath; handleFind() }
}

function handleBrowse() {
  var files = window.ztools.showOpenDialog({ title: 'select file or directory', properties: ['openFile', 'openDirectory'] })
  if (files && files.length > 0) { filePath.value = files[0]; handleFind() }
}

async function handleFind() {
  if (!filePath.value.trim()) { error.value = 'enter a file path'; return }
  loading.value = 'scanning...'
  error.value = ''
  processes.value = []
  props.addLog('find: ' + filePath.value.trim())
  try {
    var result = await window.services.findLockingProcesses(filePath.value.trim())
    props.flushDebugLog()
    processes.value = result
    props.addLog('found ' + result.length + ' processes')
    if (result.length === 0) error.value = 'no locking processes detected.'
  } catch (err: any) {
    props.flushDebugLog()
    error.value = err.message || 'scan failed'
    props.addLog('error: ' + error.value)
  } finally { loading.value = '' }
}

async function handleKill(proc: ProcessInfo) {
  loading.value = 'killing ' + proc.name + ' (PID:' + proc.pid + ')...'
  props.addLog('kill: ' + proc.name + ' PID:' + proc.pid)
  try {
    var result = await window.services.killProcess(proc.pid)
    props.flushDebugLog()
    props.addLog('kill result: ' + result.message)
    window.ztools.showNotification(result.message)
    if (result.success) { await handleFind() }
    else { error.value = result.message }
  } catch (err: any) {
    props.flushDebugLog()
    error.value = err.message || 'kill failed'
    props.addLog('kill error: ' + error.value)
  } finally { loading.value = '' }
}
</script>

<template>
  <div
    class="unlock"
    :class="{ 'drag-active': isDragOver }"
    @drop="handleDrop"
    @dragover="handleDragOver"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
  >
    <div class="input-area">
      <input
        v-model="filePath"
        class="input"
        placeholder="path or drag file here"
        @keyup.enter="handleFind"
      />
      <button class="btn" @click="handleBrowse">browse</button>
    </div>

    <div v-if="isDragOver" class="drop-hint">drop to scan</div>
    <div v-if="loading" class="loading">{{ loading }}</div>
    <div v-if="error && !loading" class="error">{{ error }}</div>

    <div v-if="processes.length > 0" class="results">
      <div v-for="(proc, idx) in processes" :key="idx" class="card">
        <div class="info">
          <span class="name">{{ proc.name }}</span>
          <span class="pid">PID: {{ proc.pid }}</span>
        </div>
        <div v-if="proc.exePath" class="exe-path">{{ proc.exePath }}</div>
        <button
          :disabled="!!loading"
          class="kill-btn"
          @click="handleKill(proc)"
        >kill</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.unlock { position: relative; border: 2px solid transparent; border-radius: 8px; min-height: 100px; transition: border-color 0.2s, background 0.2s; }
.unlock.drag-active { border-color: var(--primary-color, #42b883); background: rgba(66, 184, 131, 0.08); }
.drop-hint { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 16px; font-weight: 600; color: var(--primary-color, #42b883); pointer-events: none; }
.input-area { display: flex; gap: 8px; padding: 8px; border: 1px dashed var(--border-color, #555); border-radius: 6px; }
.input { flex: 1; border: none; outline: none; font-size: 14px; background: transparent; color: var(--text-color, #e0e0e0); }
.input::placeholder { color: var(--text-secondary, #888); }
.btn { padding: 4px 12px; border: 1px solid var(--border-color, #555); border-radius: 4px; background: transparent; cursor: pointer; font-size: 13px; color: var(--text-color, #e0e0e0); }
.btn:hover { background: var(--hover-color, #333); }
.loading { margin-top: 12px; text-align: center; color: var(--text-secondary, #aaa); }
.error { margin-top: 12px; padding: 10px; border-radius: 6px; background: #fff2f0; color: #cf1322; font-size: 13px; }
.results { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.card { padding: 12px; border: 1px solid var(--border-color, #444); border-radius: 8px; background: var(--card-bg, #2a2a2a); }
.info { display: flex; justify-content: space-between; align-items: center; }
.name { font-weight: 600; font-size: 14px; }
.pid { font-size: 12px; color: var(--text-secondary, #999); }
.exe-path { margin-top: 4px; font-size: 12px; color: var(--text-secondary, #999); word-break: break-all; }
.kill-btn { margin-top: 8px; padding: 6px 14px; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; background: #fff1f0; color: #cf1322; }
.kill-btn:hover:not(:disabled) { background: #ffccc7; }
.kill-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
