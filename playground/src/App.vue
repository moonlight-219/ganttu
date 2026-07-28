<script setup lang="ts">
import { computed, ref } from "vue"
import { GanttChart, type GanttConfig, type GanttLink, type GanttTask, type PatchTask, addDays, toDate } from "./ganttImports"
import { createBasicTasks, createLargeDataset } from "./demos/basic/data"
import { mzSampleTasks, toGanttLinks, toGanttMarkers, toGanttTasks } from "./demos/mzgantt-adapter/adapter"
import type { GanttMarker } from "@gantt/core"

type DemoMode = "basic" | "adapter" | "1000" | "3000"

const mode = ref<DemoMode>("basic")
const viewMode = ref<GanttConfig["viewMode"]>("day")
const planLocked = ref(false)
const baseTasks = ref<GanttTask[]>(createBasicTasks())
const adapterTasks = ref<GanttTask[]>(toGanttTasks(mzSampleTasks))
const large1000 = ref<GanttTask[]>(createLargeDataset(1000))
const large3000 = ref<GanttTask[]>(createLargeDataset(3000))
const baseLinks = ref<GanttLink[]>([])
const adapterLinks = ref<GanttLink[]>(toGanttLinks(mzSampleTasks))
const large1000Links = ref<GanttLink[]>([])
const large3000Links = ref<GanttLink[]>([])
const baseMarkers = ref<GanttMarker[]>([
  { id: "m1", name: "需求冻结", date: "2026-07-15", color: "#d97706" },
  { id: "m1b", name: "方案评审", date: "2026-07-15", color: "#2563eb" },
  { id: "m2", name: "一期验收", date: "2026-09-10", color: "#dc2626" }
])
const adapterMarkers = ref<GanttMarker[]>(toGanttMarkers(mzSampleTasks))
const large1000Markers = ref<GanttMarker[]>([{ id: "m1000", name: "1000 行验收", date: "2026-09-15", color: "#dc2626" }])
const large3000Markers = ref<GanttMarker[]>([{ id: "m3000", name: "3000 行压测", date: "2026-09-22", color: "#dc2626" }])

const tasks = computed(() => {
  if (mode.value === "adapter") return adapterTasks.value
  if (mode.value === "1000") return large1000.value
  if (mode.value === "3000") return large3000.value
  return baseTasks.value
})
const links = computed(() => {
  if (mode.value === "adapter") return adapterLinks.value
  if (mode.value === "1000") return large1000Links.value
  if (mode.value === "3000") return large3000Links.value
  return baseLinks.value
})
const config = computed<Partial<GanttConfig>>(() => ({
  viewMode: viewMode.value,
  rowHeight: 40,
  headerHeight: 52,
  columnWidth: viewMode.value === "day" ? 30 : viewMode.value === "week" ? 14 : 8,
  taskListWidth: 720,
  firstDayOfWeek: 0,
  editablePlan: !planLocked.value,
  visibleRange: { start: "2026-07-01", end: "2026-10-31" }
}))
const markers = computed(() => {
  if (mode.value === "adapter") return adapterMarkers.value
  if (mode.value === "1000") return large1000Markers.value
  if (mode.value === "3000") return large3000Markers.value
  return baseMarkers.value
})
const summary = computed(() => {
  const total = tasks.value.length
  const progress = Math.round(tasks.value.reduce((sum, task) => sum + task.actual.progress, 0) / Math.max(1, total))
  return { total, progress }
})

function handleTaskChange(id: string, patch: PatchTask) {
  updateCurrentTasks((items) => items.map((task) => {
    if (task.id !== id) {
      return task
    }

    const next = {
      ...task,
      plan: { ...task.plan },
      actual: { ...task.actual }
    }
    if (patch.actualStart) {
      const originalStart = toDate(next.actual.start)
      const delta = Math.round((toDate(patch.actualStart).getTime() - originalStart.getTime()) / 86400000)
      next.actual.start = patch.actualStart
      next.actual.end = patch.actualEnd ?? addDays(next.actual.end, delta)
    }
    if (patch.actualEnd) {
      next.actual.end = patch.actualEnd
    }
    if (patch.planStart) {
      const originalStart = toDate(next.plan.start)
      const delta = Math.round((toDate(patch.planStart).getTime() - originalStart.getTime()) / 86400000)
      next.plan.start = patch.planStart
      next.plan.end = patch.planEnd ?? addDays(next.plan.end, delta)
    }
    if (patch.planEnd) {
      next.plan.end = patch.planEnd
    }
    if (typeof patch.progress === "number") {
      next.actual.progress = patch.progress
    }
    if (patch.name) {
      next.name = patch.name
    }
    if (patch.type) {
      next.type = patch.type
    }
    if ("parentId" in patch) {
      next.parentId = patch.parentId
    }
    if (patch.color) {
      next.color = patch.color
    }
    if (next.type === "milestone") {
      next.actual.end = next.actual.start
      next.plan.end = next.plan.start
    }
    return next
  }))
}

function handleTaskCreate(task: GanttTask) {
  updateCurrentTasks((items) => [...items, task])
}

function handleMarkerCreate(marker: GanttMarker) {
  updateCurrentMarkers((items) => [...items, marker])
}

function handleMarkerChange(id: string, marker: GanttMarker) {
  updateCurrentMarkers((items) => items.map((item) => item.id === id ? marker : item))
}

function handleMarkerDelete(id: string) {
  updateCurrentMarkers((items) => items.filter((item) => item.id !== id))
}

function handleTaskDelete(id: string) {
  updateCurrentTasks((items) => items.filter((task) => task.id !== id && task.parentId !== id))
  updateCurrentLinks((items) => items.filter((link) => link.sourceId !== id && link.targetId !== id))
}

function handleLinkChange(nextLinks: GanttLink[]) {
  updateCurrentLinks(() => nextLinks)
}

function updateCurrentTasks(updater: (items: GanttTask[]) => GanttTask[]) {
  if (mode.value === "adapter") {
    adapterTasks.value = updater(adapterTasks.value)
  } else if (mode.value === "1000") {
    large1000.value = updater(large1000.value)
  } else if (mode.value === "3000") {
    large3000.value = updater(large3000.value)
  } else {
    baseTasks.value = updater(baseTasks.value)
  }
}

function updateCurrentMarkers(updater: (items: GanttMarker[]) => GanttMarker[]) {
  if (mode.value === "adapter") {
    adapterMarkers.value = updater(adapterMarkers.value)
  } else if (mode.value === "1000") {
    large1000Markers.value = updater(large1000Markers.value)
  } else if (mode.value === "3000") {
    large3000Markers.value = updater(large3000Markers.value)
  } else {
    baseMarkers.value = updater(baseMarkers.value)
  }
}

function updateCurrentLinks(updater: (items: GanttLink[]) => GanttLink[]) {
  if (mode.value === "adapter") {
    adapterLinks.value = updater(adapterLinks.value)
  } else if (mode.value === "1000") {
    large1000Links.value = updater(large1000Links.value)
  } else if (mode.value === "3000") {
    large3000Links.value = updater(large3000Links.value)
  } else {
    baseLinks.value = updater(baseLinks.value)
  }
}
</script>

<template>
  <main class="playground">
    <header class="playground-header">
      <div>
        <p>Phase 1 MVP</p>
        <h1>正式开发一期甘特图</h1>
      </div>
      <div class="summary">
        <span>{{ summary.total }} tasks</span>
        <strong>{{ summary.progress }}%</strong>
      </div>
    </header>

    <section class="controls">
      <label>
        Demo
        <select v-model="mode">
          <option value="basic">基础 20 条任务</option>
          <option value="adapter">MZGantt adapter</option>
          <option value="1000">1000 条任务</option>
          <option value="3000">3000 benchmark</option>
        </select>
      </label>
      <label class="inline-control">
        <input v-model="planLocked" type="checkbox">
        锁定计划
      </label>
    </section>

    <GanttChart
      :tasks="tasks"
      :links="links"
      :markers="markers"
      :config="config"
      height="680px"
      @task-change="handleTaskChange"
      @task-create="handleTaskCreate"
      @task-delete="handleTaskDelete"
      @marker-create="handleMarkerCreate"
      @marker-change="handleMarkerChange"
      @marker-delete="handleMarkerDelete"
      @link-change="handleLinkChange"
      @view-mode-change="viewMode = $event"
    />
  </main>
</template>
