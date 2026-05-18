import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'

const STORAGE_KEY = 'shift_scheduler_data'
const COLORS_DEFAULT = ['#4A90D9', '#52C41A', '#FAAD14', '#FF4D4F', '#722ED1', '#13C2C2']

export const useSchedulerStore = defineStore('scheduler', () => {
  // State
  const staff = ref([])
  const config = reactive({
    mode: '24h',
    shiftCount: 2,
    shifts: [
      { name: '白班', start: '08:00', end: '16:00' },
      { name: '夜班', start: '16:00', end: '08:00' },
      { name: '夜班', start: '00:00', end: '08:00' },
    ],
    dailyNeed: 1,
    rotationDays: 15,
    startDate: '',
    daysToGenerate: 30,
  })
  const schedule = ref({})
  const leaveRecords = ref({})
  const swapRecords = ref([])
  const currentMonth = ref(
    new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')
  )
  const colors = ref([...COLORS_DEFAULT])

  // Persistence
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        staff: staff.value,
        config: { ...config },
        schedule: schedule.value,
        leaveRecords: leaveRecords.value,
        swapRecords: swapRecords.value,
        currentMonth: currentMonth.value,
        colors: colors.value,
      }))
    } catch (e) { console.error('Save failed:', e) }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const d = JSON.parse(raw)
        if (d.staff) staff.value = d.staff
        if (d.config) Object.assign(config, d.config)
        if (d.schedule) schedule.value = d.schedule
        if (d.leaveRecords) leaveRecords.value = d.leaveRecords
        if (d.swapRecords) swapRecords.value = d.swapRecords
        if (d.currentMonth) currentMonth.value = d.currentMonth
        if (d.colors) colors.value = d.colors
      }
    } catch (e) { console.error('Load failed:', e) }
  }

  // Staff
  function addStaff(name, group) {
    if (staff.value.some(s => s.name === name)) return false
    staff.value.push({ id: Date.now().toString(), name, group })
    save()
    return true
  }

  function removeStaff(id) {
    staff.value = staff.value.filter(s => s.id !== id)
    save()
  }

  function getGroups() {
    const groups = {}
    staff.value.forEach(s => {
      const g = s.group || 'A'
      if (!groups[g]) groups[g] = []
      groups[g].push(s)
    })
    return groups
  }

  // Schedule Generation
  function formatDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }

  function generateSchedule() {
    if (staff.value.length === 0) return false
    if (!config.startDate) return false

    const dailyNeed = config.dailyNeed
    const rotationDays = config.rotationDays
    const mode = config.mode
    const totalShifts = mode === 'split' ? config.shiftCount : 1
    const groups = getGroups()
    const groupKeys = Object.keys(groups).sort()

    const start = new Date(config.startDate + 'T00:00:00')
    const totalDays = config.daysToGenerate || 30
    const newSchedule = {}

    for (let d = 0; d < totalDays; d++) {
      const date = new Date(start)
      date.setDate(date.getDate() + d)
      const dateStr = formatDate(date)
      newSchedule[dateStr] = {}

      const period = Math.floor(d / rotationDays)

      if (mode === '24h') {
        const allStaff = staff.value
        const n = allStaff.length
        const slotsPerDay = Math.min(dailyNeed, n)
        const startIdx = (d * slotsPerDay) % n
        for (let slot = 0; slot < slotsPerDay; slot++) {
          const idx = (startIdx + slot) % n
          newSchedule[dateStr][allStaff[idx].id] = 0
        }
      } else {
        for (let si = 0; si < totalShifts; si++) {
          const groupIdx = (si + period) % groupKeys.length
          const g = groupKeys[groupIdx]
          const members = groups[g] || []
          for (let slot = 0; slot < Math.min(dailyNeed, members.length); slot++) {
            const memberIdx = (d + slot) % members.length
            const person = members[memberIdx]
            if (!newSchedule[dateStr][person.id]) {
              newSchedule[dateStr][person.id] = []
            }
            newSchedule[dateStr][person.id].push(si)
          }
        }
      }
    }

    schedule.value = newSchedule
    leaveRecords.value = {}
    save()
    return true
  }

  // Swap
  function doSwap(staffA, staffB, dateA, dateB, reason) {
    if (!schedule.value[dateA]) schedule.value[dateA] = {}
    if (!schedule.value[dateB]) schedule.value[dateB] = {}

    const tempA = schedule.value[dateA][staffA]
    const tempB = schedule.value[dateB][staffB]

    if (tempA !== undefined) schedule.value[dateB][staffA] = tempA
    else delete schedule.value[dateB][staffA]

    if (tempB !== undefined) schedule.value[dateA][staffB] = tempB
    else delete schedule.value[dateA][staffB]

    delete schedule.value[dateA][staffA]
    delete schedule.value[dateB][staffB]

    const pA = staff.value.find(s => s.id === staffA)
    const pB = staff.value.find(s => s.id === staffB)
    swapRecords.value.unshift({
      id: Date.now().toString(),
      staffA, staffB, dateA, dateB,
      reason: reason || '未填写',
      staffAName: pA?.name || '未知',
      staffBName: pB?.name || '未知',
      time: new Date().toLocaleString('zh-CN'),
    })
    save()
  }

  // Leave
  function markLeave(staffId, date, reason) {
    if (!schedule.value[date]) schedule.value[date] = {}
    delete schedule.value[date][staffId]

    if (!leaveRecords.value[date]) leaveRecords.value[date] = {}
    leaveRecords.value[date][staffId] = reason

    const person = staff.value.find(s => s.id === staffId)
    swapRecords.value.unshift({
      id: Date.now().toString(),
      type: 'leave',
      staffA: staffId,
      staffAName: person?.name || '未知',
      dateA: date,
      reason,
      time: new Date().toLocaleString('zh-CN'),
    })
    save()
  }

  // Delete record (undo)
  function deleteRecord(id) {
    const record = swapRecords.value.find(r => r.id === id)
    if (!record) return

    if (record.type === 'leave') {
      if (leaveRecords.value[record.dateA]) {
        delete leaveRecords.value[record.dateA][record.staffA]
        if (Object.keys(leaveRecords.value[record.dateA]).length === 0) {
          delete leaveRecords.value[record.dateA]
        }
      }
    } else {
      const { staffA, staffB, dateA, dateB } = record
      if (staffA && staffB && dateA && dateB) {
        if (!schedule.value[dateA]) schedule.value[dateA] = {}
        if (!schedule.value[dateB]) schedule.value[dateB] = {}

        const tempA = schedule.value[dateA][staffB]
        const tempB = schedule.value[dateB][staffA]

        if (tempB !== undefined) schedule.value[dateA][staffA] = tempB
        else delete schedule.value[dateA][staffA]

        if (tempA !== undefined) schedule.value[dateB][staffB] = tempA
        else delete schedule.value[dateB][staffB]

        delete schedule.value[dateA][staffB]
        delete schedule.value[dateB][staffA]
      }
    }

    swapRecords.value = swapRecords.value.filter(r => r.id !== id)
    save()
  }

  // Day edit
  function saveDayEdit(dateStr, assignments) {
    if (!schedule.value[dateStr]) schedule.value[dateStr] = {}
    // Clear old
    staff.value.forEach(s => delete schedule.value[dateStr][s.id])
    // Set new
    Object.entries(assignments).forEach(([sid, val]) => {
      if (val !== null) schedule.value[dateStr][sid] = val
    })
    save()
  }

  // Excel export
  function exportExcel() {
    const XLSX = window.XLSX
    if (!XLSX) return false

    const [year, month] = currentMonth.value.split('-').map(Number)
    const daysInMonth = new Date(year, month, 0).getDate()
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']

    const header = ['姓名', '组别']
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      header.push(`${d}日(${weekdays[new Date(dateStr).getDay()]})`)
    }
    header.push('合计天数')

    const rows = [header]
    staff.value.forEach(person => {
      const row = [person.name, person.group + '组']
      let total = 0
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const dayData = schedule.value[dateStr]
        if (dayData && dayData[person.id] !== undefined) {
          total++
          const sv = dayData[person.id]
          if (config.mode === '24h') row.push('值班')
          else if (Array.isArray(sv)) row.push(sv.map(si => config.shifts[si]?.name || `班${si}`).join('/'))
        } else {
          // Check leave
          if (leaveRecords.value[dateStr]?.[person.id]) {
            row.push(leaveRecords.value[dateStr][person.id])
          } else {
            row.push('')
          }
        }
      }
      row.push(total)
      rows.push(row)
    })

    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 8 }, { wch: 6 }]
    for (let d = 0; d < daysInMonth; d++) ws['!cols'].push({ wch: 10 })
    ws['!cols'].push({ wch: 8 })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `${year}年${month}月排班`)
    XLSX.writeFile(wb, `排班表_${year}年${month}月.xlsx`)
    return true
  }

  // Data export/import
  function exportData() {
    const blob = new Blob([JSON.stringify({ staff, config, schedule, leaveRecords, swapRecords, currentMonth, colors }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `排班数据_${currentMonth.value}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function importData(jsonStr) {
    const d = JSON.parse(jsonStr)
    if (d.staff) staff.value = d.staff
    if (d.config) Object.assign(config, d.config)
    if (d.schedule) schedule.value = d.schedule
    if (d.leaveRecords) leaveRecords.value = d.leaveRecords
    if (d.swapRecords) swapRecords.value = d.swapRecords
    if (d.colors) colors.value = d.colors
    save()
  }

  // Color
  function updateColor(idx, color) {
    colors.value[idx] = color
    save()
  }

  function resetColors() {
    colors.value = [...COLORS_DEFAULT]
    save()
  }

  // Init
  load()

  return {
    staff, config, schedule, leaveRecords, swapRecords, currentMonth, colors,
    save, load,
    addStaff, removeStaff, getGroups,
    generateSchedule, formatDate,
    doSwap, markLeave, deleteRecord, saveDayEdit,
    exportExcel, exportData, importData,
    updateColor, resetColors,
  }
})