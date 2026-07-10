<script setup lang="ts">
import { ref } from 'vue'
import type { ProcessInfo } from '../env'

const props = defineProps<{
  addLog: (msg: string) => void
  flushDebugLog: () => void
}>()

const filePath = ref('')
const mode = ref<'delete' | 'shred'>('shred')
const loading = ref('')
const error = ref('')
const result = ref('')
const isDragOver = ref(false)
let dragCounter = 0

function handleDragEnter(e: DragEvent) { e.preventDefault(); dragCounter++; isDragOver.value = true }
function handleDragLeave(e: DragEvent) { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { isDragOver.value = false; dragCounter = 0 } }
function handleDragOver(e: DragEvent) { e.preventDefault(); e.stopPropagation() }

function handleDrop(e: DragEvent) {
  e.preventDefault(); isDragOver.value = false; dragCounter = 0
  var dt = e.dataTransfer; if (!dt || !dt.files || !dt.files[0]) return
  var file = dt.files[0]; props.addLog('drop: ' + file.name)
  var fullPath = ''
  if (window.services.getPathForFile) { try { fullPath = window.services.getPathForFile(file) } catch (e) {} }
  if (!fullPath && (file as any).path) fullPath = (file as any).path
  if (fullPath) filePath.value = fullPath
}

function handleBrowse() {
  var files = window.ztools.showOpenDialog({ title: 'select file or directory', properties: ['openFile', 'openDirectory'] })
  if (files && files.length > 0) filePath.value = files[0]
}

async function handleStart() {
  if (!filePath.value.trim()) { error.value = 'enter a file path'; return }
  loading.value = (mode.value === 'shred' ? 'shredding' : 'deleting') + '...'
  error.value = ''
  result.value = ''
  props.addLog('shred: ' + filePath.value.trim() + ' mode=' + mode.value)
  try {
    var res = await window.services.shredPath(filePath.value.trim(), mode.value)
    props.flushDebugLog()
    if (res.locked) {
      props.addLog('file is locked, attempting auto-unlock...')
      loading.value = 'file is locked, unlocking...'
      var procs = await window.services.findLockingProcesses(filePath.value.trim())
      props.flushDebugLog()
      if (procs.length > 0) {
        for (var i = 0; i < procs.length; i++) {
          var killRes = await window.services.killProcess(procs[i].pid)
          props.flushDebugLog()
          props.addLog('killed ' + procs[i].name + ' (' + (killRes.success ? 'ok' : 'failed') + ')')
        }
        loading.value = (mode.value === 'shred' ? 'shredding' : 'deleting') + ' (retry)...'
        res = await window.services.shredPath(filePath.value.trim(), mode.value)
        props.flushDebugLog()
      }
    }
    if (res.success) {
      result.value = res.message
      props.addLog('done: ' + res.message)
    } else {
      error.value = res.message
      props.addLog('failed: ' + res.message)
    }
  } catch (err: any) {
    props.flushDebugLog()
    error.value = err.message || 'operation failed'
    props.addLog('error: ' + error.value)
  } finally { loading.value = '' }
}
</script>

<template>
  <div
    class="shredder"
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
        @keyup.enter="handleStart"
      />
      <button class="btn" @click="handleBrowse">browse</button>
    </div>

    <div v-if="isDragOver" class="drop-hint">drop to process</div>

    <div class="mode-select">
      <label :class="{ active: mode === 'delete' }">
        <input type="radio" v-model="mode" value="delete" /> delete
      </label>
      <label :class="{ active: mode === 'shred' }">
        <input type="radio" v-model="mode" value="shred" /> shred
      </label>
    </div>

    <button class="start-btn" :disabled="!!loading" @click="handleStart">
      {{ mode === 'shred' ? 'shred' : 'delete' }}
    </button>

    <div v-if="loading" class="loading">{{ loading }}</div>
    <div v-if="result && !loading" class="success">{{ result }}</div>
    <div v-if="error && !loading" class="error">{{ error }}</div>
  </div>
</template>

<style scoped>
.shredder { position: relative; border: 2px solid transparent; border-radius: 8px; min-height: 100px; transition: border-color 0.2s, background 0.2s; }
.shredder.drag-active { border-color: var(--primary-color, #42b883); background: rgba(66, 184, 131, 0.08); }
.drop-hint { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 16px; font-weight: 600; color: var(--primary-color, #42b883); pointer-events: none; }
.input-area { display: flex; gap: 8px; padding: 8px; border: 1px dashed var(--border-color, #555); border-radius: 6px; }
.input { flex: 1; border: none; outline: none; font-size: 14px; background: transparent; color: var(--text-color, #e0e0e0); }
.input::placeholder { color: var(--text-secondary, #888); }
.btn { padding: 4px 12px; border: 1px solid var(--border-color, #555); border-radius: 4px; background: transparent; cursor: pointer; font-size: 13px; color: var(--text-color, #e0e0e0); }
.btn:hover { background: var(--hover-color, #333); }
.mode-select { margin-top: 12px; display: flex; gap: 16px; }
.mode-select label { display: flex; align-items: center; gap: 4px; font-size: 14px; cursor: pointer; color: var(--text-secondary, #999); padding: 4px 10px; border-radius: 4px; border: 1px solid transparent; }
.mode-select label.active { color: var(--primary-color, #42b883); border-color: var(--primary-color, #42b883); }
.start-btn { margin-top: 12px; padding: 8px 20px; border: none; border-radius: 4px; font-size: 14px; cursor: pointer; background: var(--primary-color, #42b883); color: #fff; }
.start-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.loading { margin-top: 12px; text-align: center; color: var(--text-secondary, #aaa); }
.success { margin-top: 12px; padding: 10px; border-radius: 6px; background: #f6ffed; color: #389e0d; font-size: 13px; }
.error { margin-top: 12px; padding: 10px; border-radius: 6px; background: #fff2f0; color: #cf1322; font-size: 13px; }
</style>
