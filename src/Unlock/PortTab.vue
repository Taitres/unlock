<script setup lang="ts">
import { ref } from 'vue'
import type { PortInfo } from '../env'

const props = defineProps<{
  addLog: (msg: string) => void
  flushDebugLog: () => void
}>()

const port = ref<number | string>('')
const entries = ref<PortInfo[]>([])
const loading = ref('')
const error = ref('')

async function handleScan() {
  var portNum = parseInt(String(port.value), 10)
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) { error.value = 'enter a valid port (1-65535)'; return }
  loading.value = 'scanning port ' + portNum + '...'
  error.value = ''
  entries.value = []
  props.addLog('port scan: ' + portNum)
  try {
    var result = await window.services.findPortProcess(portNum)
    props.flushDebugLog()
    entries.value = result
    props.addLog('found ' + result.length + ' entries')
    if (result.length === 0) error.value = 'no process listening on port ' + portNum
  } catch (err: any) {
    props.flushDebugLog()
    error.value = err.message || 'scan failed'
    props.addLog('error: ' + error.value)
  } finally { loading.value = '' }
}

async function handleKill(entry: PortInfo) {
  loading.value = 'killing PID:' + entry.pid + '...'
  props.addLog('port kill: ' + entry.processName + ' PID:' + entry.pid)
  try {
    var result = await window.services.killProcess(entry.pid)
    props.flushDebugLog()
    props.addLog('kill result: ' + result.message)
    window.ztools.showNotification(result.message)
    if (result.success) { await handleScan() }
    else { error.value = result.message }
  } catch (err: any) {
    props.flushDebugLog()
    error.value = err.message || 'kill failed'
    props.addLog('kill error: ' + error.value)
  } finally { loading.value = '' }
}
</script>

<template>
  <div class="port">
    <div class="input-area">
      <input
        v-model.number="port"
        class="input"
        type="number"
        min="1"
        max="65535"
        placeholder="port number (e.g. 8080)"
        @keyup.enter="handleScan"
      />
      <button class="btn" @click="handleScan">scan</button>
    </div>

    <div v-if="loading" class="loading">{{ loading }}</div>
    <div v-if="error && !loading" class="error">{{ error }}</div>

    <div v-if="entries.length > 0" class="table-wrap">
      <table class="port-table">
        <thead>
          <tr>
            <th>process</th>
            <th>PID</th>
            <th>proto</th>
            <th>state</th>
            <th>address</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(entry, idx) in entries" :key="idx">
            <td>
              <div class="proc-name">{{ entry.processName }}</div>
              <div v-if="entry.exePath" class="proc-path">{{ entry.exePath }}</div>
            </td>
            <td>{{ entry.pid }}</td>
            <td><span :class="['proto', entry.protocol === 'TCP' ? 'tcp' : 'udp']">{{ entry.protocol }}</span></td>
            <td>{{ entry.state }}</td>
            <td>{{ entry.localAddress }}:{{ entry.localPort }}</td>
            <td>
              <button
                :disabled="!!loading"
                class="kill-btn"
                @click="handleKill(entry)"
              >kill</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.input-area { display: flex; gap: 8px; padding: 8px; border: 1px dashed var(--border-color, #555); border-radius: 6px; }
.input { flex: 1; border: none; outline: none; font-size: 14px; background: transparent; color: var(--text-color, #e0e0e0); }
.input::placeholder { color: var(--text-secondary, #888); }
.input[type=number] { -moz-appearance: textfield; }
.input[type=number]::-webkit-inner-spin-button { display: none; }
.btn { padding: 4px 12px; border: 1px solid var(--border-color, #555); border-radius: 4px; background: transparent; cursor: pointer; font-size: 13px; color: var(--text-color, #e0e0e0); }
.btn:hover { background: var(--hover-color, #333); }
.loading { margin-top: 12px; text-align: center; color: var(--text-secondary, #aaa); }
.error { margin-top: 12px; padding: 10px; border-radius: 6px; background: #fff2f0; color: #cf1322; font-size: 13px; }
.table-wrap { margin-top: 12px; overflow-x: auto; }
.port-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.port-table th { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border-color, #444); color: var(--text-secondary, #999); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
.port-table td { padding: 8px 10px; border-bottom: 1px solid var(--border-color, #333); }
.proc-name { font-weight: 600; }
.proc-path { font-size: 11px; color: var(--text-secondary, #999); word-break: break-all; max-width: 200px; }
.proto { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; }
.proto.tcp { background: #096dd9; color: #fff; }
.proto.udp { background: #722ed1; color: #fff; }
.kill-btn { padding: 4px 10px; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; background: #fff1f0; color: #cf1322; }
.kill-btn:hover:not(:disabled) { background: #ffccc7; }
.kill-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
