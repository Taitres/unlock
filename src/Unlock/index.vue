<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import UnlockTab from './UnlockTab.vue'
import ShredderTab from './ShredderTab.vue'
import PortTab from './PortTab.vue'
import type { TabType } from '../env'

const props = defineProps({
  enterAction: {
    type: Object as () => { type: string; payload?: any } | null,
    default: null
  }
})

const activeTab = ref<TabType>('unlock')
const logs = ref<string[]>([])
const showDebug = ref(true)

function addLog(msg: string) {
  var time = new Date().toLocaleTimeString()
  logs.value.push('[' + time + '] ' + msg)
  if (logs.value.length > 200) logs.value.shift()
}

function flushDebugLog() {
  try {
    var debugLogs = window.services.getDebugLog()
    debugLogs.forEach(function (l) { addLog(l) })
  } catch (e) {}
}

function toggleDebug() { showDebug.value = !showDebug.value }

onMounted(function () {
  addLog('plugin loaded')
  if (props.enterAction && props.enterAction.type === 'files') {
    addLog('received files via enterAction')
  }
})

watch(
  function () { return props.enterAction },
  function (action) {
    if (action && action.type === 'files') {
      activeTab.value = 'unlock'
    }
  }
)
</script>

<template>
  <div class="app">
    <div class="tab-bar">
      <button
        :class="['tab-btn', { active: activeTab === 'unlock' }]"
        @click="activeTab = 'unlock'"
      >解除占用</button>
      <button
        :class="['tab-btn', { active: activeTab === 'shredder' }]"
        @click="activeTab = 'shredder'"
      >文件粉碎</button>
      <button
        :class="['tab-btn', { active: activeTab === 'port' }]"
        @click="activeTab = 'port'"
      >端口检测</button>
    </div>

    <div class="tab-content">
      <UnlockTab
        v-if="activeTab === 'unlock'"
        :add-log="addLog"
        :flush-debug-log="flushDebugLog"
      />
      <ShredderTab
        v-if="activeTab === 'shredder'"
        :add-log="addLog"
        :flush-debug-log="flushDebugLog"
      />
      <PortTab
        v-if="activeTab === 'port'"
        :add-log="addLog"
        :flush-debug-log="flushDebugLog"
      />
    </div>

    <div v-if="logs.length > 0" class="debug-panel">
      <div class="debug-header" @click="toggleDebug">
        <span>debug log ({{ logs.length }})</span>
        <span class="debug-toggle">{{ showDebug ? '▼' : '▶' }}</span>
      </div>
      <div v-if="showDebug" class="debug-logs">
        <div v-for="(log, idx) in logs" :key="idx" class="debug-line">{{ log }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app { padding: 20px; box-sizing: border-box; color: var(--text-color, #e0e0e0); }
.tab-bar { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--border-color, #444); padding-bottom: 8px; }
.tab-btn { padding: 6px 16px; border: 1px solid transparent; border-radius: 4px 4px 0 0; background: transparent; color: var(--text-secondary, #999); cursor: pointer; font-size: 14px; }
.tab-btn.active { color: var(--primary-color, #42b883); border-color: var(--border-color, #444); border-bottom-color: var(--bg-color, #1e1e1e); background: var(--card-bg, #2a2a2a); }
.tab-btn:hover:not(.active) { color: var(--text-color, #e0e0e0); }
.tab-content { min-height: 200px; }
.debug-panel { margin-top: 16px; border: 1px solid var(--border-color, #444); border-radius: 6px; overflow: hidden; }
.debug-header { padding: 8px 12px; background: var(--card-bg, #2a2a2a); cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-secondary, #999); }
.debug-toggle { font-size: 10px; }
.debug-logs { max-height: 400px; overflow-y: auto; padding: 8px 12px; background: #1a1a1a; font-family: monospace; font-size: 11px; line-height: 1.6; }
.debug-line { color: #a0a0a0; word-break: break-all; }
</style>
