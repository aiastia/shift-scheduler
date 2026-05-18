<template>
  <div id="app">
    <header class="header">
      <h1>📅 智能排班系统</h1>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-white btn-sm" @click="store.exportData()">📥 导出数据</button>
        <button class="btn btn-white btn-sm" @click="triggerImport">📤 导入数据</button>
        <input ref="fileInput" type="file" accept=".json" style="display:none" @change="handleImport">
      </div>
    </header>
    <div class="container">
      <div class="tabs">
        <button class="tab" :class="{ active: tab === 'config' }" @click="tab = 'config'">⚙️ 排班配置</button>
        <button class="tab" :class="{ active: tab === 'schedule' }" @click="tab = 'schedule'">📅 排班日历</button>
        <button class="tab" :class="{ active: tab === 'table' }" @click="tab = 'table'">📊 表格视图</button>
        <button class="tab" :class="{ active: tab === 'swap' }" @click="tab = 'swap'">🔄 调休换班</button>
      </div>
      <ConfigView v-show="tab === 'config'" @generated="tab = 'schedule'" />
      <CalendarView v-show="tab === 'schedule'" />
      <TableView v-show="tab === 'table'" />
      <SwapView v-show="tab === 'swap'" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useSchedulerStore } from './stores/scheduler'
import ConfigView from './views/ConfigView.vue'
import CalendarView from './views/CalendarView.vue'
import TableView from './views/TableView.vue'
import SwapView from './views/SwapView.vue'

const store = useSchedulerStore()
const tab = ref('config')
const fileInput = ref(null)

function triggerImport() { fileInput.value?.click() }
function handleImport(e) {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      store.importData(ev.target.result)
      alert('导入成功')
    } catch { alert('导入失败') }
  }
  reader.readAsText(file)
  e.target.value = ''
}
</script>