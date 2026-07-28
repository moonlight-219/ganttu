<script setup lang="ts">
import {
  addDays,
  computeImpact,
  computeLayout,
  computeTimeScale,
  defaultConfig,
  flattenTasks,
  formatDate,
  normalizeLinks,
  toDate,
  type GanttConfig,
  type GanttLink,
  type GanttMarker,
  type GanttTask,
  type PatchTask,
  type TaskLayout,
  type TimeScale,
  type ViewMode
} from "@gantt/core"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { drawGrid } from "../rendering/canvas/grid"
import { buildOrthogonalLinkPath, taskAnchorPoint, type LinkAnchor } from "../rendering/canvas/links"
import { setupCanvas } from "../rendering/canvas/viewport"

const props = withDefaults(defineProps<{
  tasks: GanttTask[]
  links?: GanttLink[]
  markers?: GanttMarker[]
  config?: Partial<GanttConfig>
  height?: string | number
  onTaskChange?: (id: string, patch: PatchTask) => void
  onTaskCreate?: (task: GanttTask) => void
  onTaskDelete?: (id: string) => void
  onMarkerCreate?: (marker: GanttMarker) => void
  onMarkerChange?: (id: string, marker: GanttMarker) => void
  onMarkerDelete?: (id: string) => void
  onLinkChange?: (links: GanttLink[]) => void
  onViewModeChange?: (mode: ViewMode) => void
}>(), {
  links: () => [],
  markers: () => [],
  height: 620
})

const emit = defineEmits<{
  taskChange: [id: string, patch: PatchTask]
  taskCreate: [task: GanttTask]
  taskDelete: [id: string]
  markerCreate: [marker: GanttMarker]
  markerChange: [id: string, marker: GanttMarker]
  markerDelete: [id: string]
  linkChange: [links: GanttLink[]]
  viewModeChange: [mode: ViewMode]
}>()

const viewOptions: Array<{ mode: ViewMode; label: string }> = [
  { mode: "day", label: "周/日" },
  { mode: "week", label: "年/周" },
  { mode: "month", label: "年/月" },
  { mode: "quarter", label: "年/季度" }
]
const PLAN_BAR_TOP = 7
const PLAN_BAR_HEIGHT = 12
const ACTUAL_BAR_TOP = 26
const ACTUAL_BAR_HEIGHT = 14
const collapsedIds = ref(new Set<string>())
const selectedTaskId = ref<string | null>(null)
const scrollLeft = ref(0)
const scrollTop = ref(0)
const chartRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const timelineRef = ref<HTMLDivElement | null>(null)
const tableRef = ref<HTMLDivElement | null>(null)
const taskListWidth = ref(0)
const resizingTaskList = ref(false)
let stopSplitterResize: (() => void) | null = null
let linkDraftFrame = 0
let pendingLinkDraftPoint: { x: number; y: number } | null = null
const editorOpen = ref(false)
const editMode = ref<"create" | "edit">("edit")
const editDraft = ref({
  id: "",
  name: "",
  type: "task" as GanttTask["type"],
  parentId: "",
  start: "",
  end: "",
  progress: 0,
  color: "#2563eb"
})
const markerEditorOpen = ref(false)
const markerEditMode = ref<"create" | "edit">("create")
const markerDraft = ref({
  id: "",
  name: "",
  date: "",
  color: "#d97706"
})
const selectedLinkId = ref<string | null>(null)
const linkEditorOpen = ref(false)
const linkEditDraft = ref({
  id: "",
  type: "FS" as GanttLink["type"],
  lag: 0,
  lagUnit: "calendar" as NonNullable<GanttLink["lagUnit"]>
})
const draggingTask = ref(false)
const linkDraft = ref<{
  sourceId: string
  sourceAnchor: LinkAnchor
  startX: number
  startY: number
  x: number
  y: number
} | null>(null)
const hoveredTask = ref<{
  task: GanttTask
  source: "table" | "timeline" | "plan"
  x: number
  y: number
} | null>(null)
let taskDetailsTimer = 0

const mergedConfig = computed<GanttConfig>(() => ({ ...defaultConfig, ...props.config }))
watch(mergedConfig, (config) => {
  if (!resizingTaskList.value) {
    taskListWidth.value = config.taskListWidth
  }
}, { immediate: true })
const chartHeight = computed(() => typeof props.height === "number" ? `${props.height}px` : props.height)
const displayedTasks = computed(() => rollupSummaryTasks(props.tasks))
const dependencyTasks = computed(() => {
  const milestoneIds = new Set(displayedTasks.value.filter((task) => task.type === "milestone").map((task) => task.id))
  return displayedTasks.value.map((task) => ({
    ...task,
    parentId: task.type === "milestone" ? null : task.parentId,
    dependencies: task.type === "milestone"
      ? []
      : (task.dependencies ?? []).filter((dependency) => !milestoneIds.has(dependency.predecessorId))
  }))
})
const taskById = computed(() => new Map(displayedTasks.value.map((task) => [task.id, task])))
const selectedTask = computed(() => selectedTaskId.value ? taskById.value.get(selectedTaskId.value) ?? null : null)
const normalizedLinks = computed(() => {
  const milestoneIds = new Set(displayedTasks.value.filter((task) => task.type === "milestone").map((task) => task.id))
  return normalizeLinks(dependencyTasks.value, props.links)
    .filter((link) => !milestoneIds.has(link.sourceId) && !milestoneIds.has(link.targetId))
})
const flatTasks = computed(() => flattenTasks(displayedTasks.value, collapsedIds.value))
const summaryOptions = computed(() => displayedTasks.value.filter((task) => task.type === "summary"))
const dateRange = computed(() => {
  if (mergedConfig.value.visibleRange) {
    return {
      start: toDate(mergedConfig.value.visibleRange.start),
      end: toDate(mergedConfig.value.visibleRange.end)
    }
  }

  const dates = [
    ...displayedTasks.value.flatMap((task) => [
      toDate(task.plan.start),
      toDate(task.plan.end),
      toDate(task.actual.start),
      toDate(task.actual.end)
    ]),
    ...props.markers.map((marker) => toDate(marker.date))
  ]
  if (!dates.length) {
    const today = toDate(new Date())
    return { start: today, end: addDays(today, 30) }
  }

  return {
    start: new Date(Math.min(...dates.map((date) => date.getTime()))),
    end: new Date(Math.max(...dates.map((date) => date.getTime())))
  }
})
const scale = computed<TimeScale[]>(() => computeTimeScale(
  dateRange.value.start,
  dateRange.value.end,
  mergedConfig.value.viewMode,
  mergedConfig.value.columnWidth,
  mergedConfig.value.firstDayOfWeek
))
const totalWidth = computed(() => scale.value.reduce((sum, tick) => sum + tick.width, 0))
const totalHeight = computed(() => mergedConfig.value.headerHeight + flatTasks.value.length * mergedConfig.value.rowHeight)
const viewportHeight = computed(() => {
  const measuredHeight = timelineRef.value?.clientHeight
    ?? tableRef.value?.clientHeight
    ?? (Number.isFinite(Number.parseFloat(chartHeight.value)) ? Number.parseFloat(chartHeight.value) : 0)
    ?? 0
  return Math.max(mergedConfig.value.rowHeight, measuredHeight - mergedConfig.value.headerHeight)
})
const visibleWindow = computed(() => {
  if (mergedConfig.value.virtualScroll === false) {
    return { start: 0, end: flatTasks.value.length - 1, before: 0, after: 0 }
  }
  const overscan = 8
  const start = Math.max(0, Math.floor(scrollTop.value / mergedConfig.value.rowHeight) - overscan)
  const end = Math.min(
    flatTasks.value.length - 1,
    Math.ceil((scrollTop.value + viewportHeight.value) / mergedConfig.value.rowHeight) + overscan
  )
  return {
    start,
    end,
    before: start * mergedConfig.value.rowHeight,
    after: Math.max(0, (flatTasks.value.length - end - 1) * mergedConfig.value.rowHeight)
  }
})
const timelineStart = computed(() => scale.value[0]?.start ?? dateRange.value.start)
const weekendColumns = computed(() => {
  const columns: Array<{ date: string; left: number }> = []
  if (mergedConfig.value.viewMode !== "day") {
    return columns
  }
  const last = scale.value[scale.value.length - 1]?.end
  if (!last) {
    return columns
  }

  for (let date = timelineStart.value, dayIndex = 0; date.getTime() <= last.getTime(); date = addDays(date, 1), dayIndex += 1) {
    if (date.getDay() === 0 || date.getDay() === 6) {
      columns.push({
        date: formatDate(date),
        left: dayIndex * mergedConfig.value.columnWidth
      })
    }
  }
  return columns
})
const timelineInnerStyle = computed(() => ({
  width: `${totalWidth.value}px`,
  height: `${totalHeight.value}px`,
  "--gantt-column-width": `${mergedConfig.value.columnWidth}px`,
  "--gantt-row-height": `${mergedConfig.value.rowHeight}px`,
  "--gantt-header-height": `${mergedConfig.value.headerHeight}px`
}))
const canvasStyle = computed(() => ({
  top: `${mergedConfig.value.headerHeight}px`,
  transform: `translate(${scrollLeft.value}px, ${scrollTop.value}px)`
}))
const layoutConfig = computed<GanttConfig>(() => ({
  ...mergedConfig.value,
  visibleRange: {
    start: timelineStart.value,
    end: dateRange.value.end
  }
}))
const layoutResult = computed(() => computeLayout(
  dependencyTasks.value,
  normalizedLinks.value,
  layoutConfig.value,
  collapsedIds.value,
  mergedConfig.value.virtualScroll === false
    ? undefined
    : {
        scrollTop: scrollTop.value,
        scrollLeft: scrollLeft.value,
        clientWidth: timelineRef.value?.clientWidth ?? 0,
        clientHeight: viewportHeight.value,
        dpr: window.devicePixelRatio || 1
      }
))
const layouts = computed<TaskLayout[]>(() => layoutResult.value.ok ? layoutResult.value.data : [])
const layoutById = computed(() => new Map(layouts.value.map((layout) => [layout.taskId, layout])))
const visibleRows = computed(() => flatTasks.value.slice(visibleWindow.value.start, visibleWindow.value.end + 1))
const selectedLink = computed(() => selectedLinkId.value ? normalizedLinks.value.find((link) => link.id === selectedLinkId.value) ?? null : null)
const linkOverlayItems = computed(() => {
  return normalizedLinks.value.flatMap((link) => {
    const source = layoutById.value.get(link.sourceId)
    const target = layoutById.value.get(link.targetId)
    if (!source || !target) {
      return []
    }
    const sourceAnchor = link.type === "SS" || link.type === "SF" ? "start" : "finish"
    const targetAnchor = link.type === "SS" || link.type === "FS" ? "start" : "finish"
    const start = taskAnchorPoint(source, sourceAnchor, mergedConfig.value.headerHeight, ACTUAL_BAR_TOP, ACTUAL_BAR_HEIGHT)
    const end = taskAnchorPoint(target, targetAnchor, mergedConfig.value.headerHeight, ACTUAL_BAR_TOP, ACTUAL_BAR_HEIGHT)
    return [{
      link,
      points: buildOrthogonalLinkPath(start, end, sourceAnchor, targetAnchor).map((point) => `${point.x},${point.y}`).join(" ")
    }]
  })
})
const hoveredTaskStyle = computed(() => {
  const chart = chartRef.value
  const width = chart?.clientWidth ?? 0
  const height = chart?.clientHeight ?? 0
  const cardWidth = 286
  const cardHeight = 220
  const x = hoveredTask.value?.x ?? 0
  const y = hoveredTask.value?.y ?? 0

  return {
    left: `${Math.max(10, Math.min(x + 14, Math.max(10, width - cardWidth - 10)))}px`,
    top: `${Math.max(10, Math.min(y + 14, Math.max(10, height - cardHeight - 10)))}px`
  }
})
const topHeaders = computed(() => {
  const groups: Array<{ key: string; label: string; left: number; width: number }> = []
  for (const tick of scale.value) {
    const header = topHeaderForTick(tick)
    const last = groups[groups.length - 1]
    if (mergedConfig.value.viewMode === "day" && last?.key === header.key) {
      last.width += tick.width
    } else {
      groups.push({ ...header, left: tick.left, width: tick.width })
    }
  }
  return groups
})
const groupedMarkers = computed(() => {
  const buckets = new Map<string, GanttMarker[]>()
  for (const marker of props.markers) {
    const key = formatDate(marker.date)
    buckets.set(key, [...(buckets.get(key) ?? []), marker])
  }

  return [...buckets.entries()].map(([date, markers]) => ({
    date,
    markers,
    color: markers[0]?.color || "#d97706"
  }))
})
const linkDraftStyle = computed(() => linkDraft.value
  ? {
      top: `${mergedConfig.value.headerHeight}px`,
      width: `${totalWidth.value}px`,
      height: `${Math.max(1, totalHeight.value - mergedConfig.value.headerHeight)}px`
    }
  : {}
)
const linkDraftPoints = computed(() => {
  if (!linkDraft.value) {
    return ""
  }
  return buildOrthogonalLinkPath(
    { x: linkDraft.value.startX, y: linkDraft.value.startY },
    { x: linkDraft.value.x, y: linkDraft.value.y },
    linkDraft.value.sourceAnchor,
    "start"
  ).map((point) => `${point.x},${point.y}`).join(" ")
})

function showTaskDetails(event: PointerEvent | MouseEvent, task: GanttTask, source: "table" | "timeline" | "plan") {
  if (draggingTask.value || linkDraft.value) {
    return
  }
  const rect = chartRef.value?.getBoundingClientRect()
  if (!rect) {
    return
  }

  const nextHover = {
    task,
    source,
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  }
  clearTaskDetailsTimer()
  taskDetailsTimer = window.setTimeout(() => {
    if (!draggingTask.value && !linkDraft.value) {
      hoveredTask.value = nextHover
    }
    taskDetailsTimer = 0
  }, 220)
}

function moveTaskDetails(event: PointerEvent | MouseEvent) {
  if (!hoveredTask.value || draggingTask.value || linkDraft.value) {
    return
  }
  const rect = chartRef.value?.getBoundingClientRect()
  if (!rect) {
    return
  }

  hoveredTask.value = {
    ...hoveredTask.value,
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  }
}

function handleTimelinePointerMove(event: PointerEvent) {
  updateLinkDraft(event)
  const target = event.target as Element | null
  if (!target?.closest(".gantt-bar, .gantt-plan-bar")) {
    hideTaskDetails()
  }
}

function hideTaskDetails() {
  clearTaskDetailsTimer()
  hoveredTask.value = null
}

function clearTaskDetailsTimer() {
  if (taskDetailsTimer) {
    window.clearTimeout(taskDetailsTimer)
    taskDetailsTimer = 0
  }
}

function taskTypeLabel(task: GanttTask): string {
  if (task.type === "summary") return "阶段"
  if (task.type === "milestone") return "里程碑"
  return "任务"
}

function taskDurationText(task: GanttTask): string {
  if (task.type === "milestone") {
    return "1天"
  }
  const start = toDate(task.actual.start)
  const end = toDate(task.actual.end)
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1)
  return `${days}天`
}

watch([scale, layouts, scrollLeft, scrollTop, taskListWidth], () => {
  nextTick(drawCanvas)
})

onMounted(() => {
  drawCanvas()
})

onBeforeUnmount(() => {
  stopSplitterResize?.()
  clearTaskDetailsTimer()
  if (linkDraftFrame) {
    window.cancelAnimationFrame(linkDraftFrame)
  }
})

function toggleCollapsed(taskId: string) {
  const next = new Set(collapsedIds.value)
  if (next.has(taskId)) {
    next.delete(taskId)
  } else {
    next.add(taskId)
  }
  collapsedIds.value = next
}

function taskName(taskId: string): string {
  return taskById.value.get(taskId)?.name ?? taskId
}

function linkLockLabel(type: GanttLink["type"]): string {
  if (type === "FS") return "后置任务开始时间不能早于前置任务结束 + 间隔"
  if (type === "SS") return "后置任务开始时间不能早于前置任务开始 + 间隔"
  if (type === "FF") return "后置任务结束时间不能早于前置任务结束 + 间隔"
  return "后置任务结束时间不能早于前置任务开始 + 间隔"
}

function taskStatus(task: GanttTask): { label: string; className: string } {
  if (task.actual.progress >= 100) {
    return { label: "已完成", className: "is-complete" }
  }
  if (isOverdue(task)) {
    return { label: "已逾期", className: "is-overdue" }
  }
  if (task.actual.progress <= 0) {
    return { label: "未开始", className: "is-pending" }
  }
  return { label: "进行中", className: "is-active" }
}

function isOverdue(task: GanttTask): boolean {
  return task.actual.progress < 100 && toDate(task.actual.end).getTime() > toDate(task.plan.end).getTime()
}

function taskOwner(task: GanttTask): string {
  return task.resources?.[0]?.trim() || ""
}

function ownerInitial(task: GanttTask): string {
  return taskOwner(task).slice(0, 1)
}

function ownerStyle(task: GanttTask) {
  const palette = ["#d85f87", "#9b63d9", "#47b987", "#d58a5f", "#4f83d8"]
  const source = taskOwner(task) || task.id
  const hash = [...source].reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0)
  return { background: palette[hash % palette.length] }
}

function shortDate(value: string | Date): string {
  return formatDate(value).slice(5)
}

function setViewMode(viewMode: ViewMode) {
  emit("viewModeChange", viewMode)
}

function openEditor(task: GanttTask) {
  selectedTaskId.value = task.id
  editMode.value = "edit"
  editDraft.value = {
    id: task.id,
    name: task.name,
    type: task.type,
    parentId: task.parentId ?? "",
    start: formatDate(task.actual.start),
    end: formatDate(task.actual.end),
    progress: task.actual.progress,
    color: task.color || defaultTaskColor(task.type)
  }
  editorOpen.value = true
}

function openCreateEditor(type: GanttTask["type"]) {
  const selected = selectedTask.value
  const start = selected ? formatDate(selected.actual.end) : formatDate(dateRange.value.start)
  editMode.value = "create"
  editDraft.value = {
    id: `task-${Date.now()}`,
    name: type === "milestone" ? "新建里程碑" : type === "summary" ? "新建阶段" : "新建任务",
    type,
    parentId: type === "milestone" ? "" : selected?.type === "summary" ? selected.id : selected?.parentId ?? "",
    start,
    end: type === "milestone" ? start : formatDate(addDays(start, 4)),
    progress: 0,
    color: defaultTaskColor(type)
  }
  editorOpen.value = true
}

function openCreateMarker() {
  const selected = selectedTask.value
  markerEditMode.value = "create"
  markerDraft.value = {
    id: `marker-${Date.now()}`,
    name: "新建里程碑",
    date: selected ? formatDate(selected.actual.end) : formatDate(dateRange.value.start),
    color: "#d97706"
  }
  markerEditorOpen.value = true
}

function openMarkerEditor(marker: GanttMarker) {
  markerEditMode.value = "edit"
  markerDraft.value = {
    id: marker.id,
    name: marker.name,
    date: formatDate(marker.date),
    color: marker.color || "#d97706"
  }
  markerEditorOpen.value = true
}

function closeMarkerEditor() {
  markerEditorOpen.value = false
}

function openLinkEditor(link: GanttLink) {
  selectedLinkId.value = link.id
  linkEditDraft.value = {
    id: link.id,
    type: link.type,
    lag: link.lag ?? 0,
    lagUnit: link.lagUnit ?? "calendar"
  }
  linkEditorOpen.value = true
}

function closeLinkEditor() {
  linkEditorOpen.value = false
}

function saveLinkEditor() {
  const current = selectedLink.value
  if (!current) {
    linkEditorOpen.value = false
    return
  }
  const nextLinks = normalizedLinks.value.map((link) => link.id === current.id
    ? {
        ...link,
        type: linkEditDraft.value.type,
        lag: Number.isFinite(linkEditDraft.value.lag) ? Math.trunc(linkEditDraft.value.lag) : 0,
        lagUnit: linkEditDraft.value.lagUnit
      }
    : link)
  emit("linkChange", normalizeLinks(dependencyTasks.value, nextLinks))
  linkEditorOpen.value = false
}

function deleteLink() {
  const current = selectedLink.value
  if (!current) {
    linkEditorOpen.value = false
    return
  }
  emit("linkChange", normalizedLinks.value.filter((link) => link.id !== current.id))
  selectedLinkId.value = null
  linkEditorOpen.value = false
}

function saveMarker() {
  const marker: GanttMarker = {
    id: markerDraft.value.id,
    name: markerDraft.value.name.trim() || "未命名里程碑",
    date: markerDraft.value.date,
    color: markerDraft.value.color
  }

  if (markerEditMode.value === "create") {
    emit("markerCreate", marker)
  } else {
    emit("markerChange", marker.id, marker)
  }
  markerEditorOpen.value = false
}

function deleteMarker() {
  if (markerEditMode.value !== "edit") {
    return
  }
  emit("markerDelete", markerDraft.value.id)
  markerEditorOpen.value = false
}

function closeEditor() {
  editorOpen.value = false
}

function saveEditor() {
  const start = editDraft.value.start
  const end = editDraft.value.type === "milestone" ? start : editDraft.value.end
  const parentId = editDraft.value.type === "milestone" ? null : editDraft.value.parentId || null

  if (editMode.value === "create") {
    const task: GanttTask = {
      id: editDraft.value.id,
      name: editDraft.value.name.trim() || "未命名任务",
      type: editDraft.value.type,
      parentId,
      plan: { start, end, progress: editDraft.value.progress },
      actual: { start, end, progress: clampProgress(editDraft.value.progress) },
      color: editDraft.value.color
    }
    emit("taskCreate", task)
    selectedTaskId.value = task.id
  } else {
    const patch: PatchTask = {
      name: editDraft.value.name.trim() || "未命名任务",
      type: editDraft.value.type,
      parentId,
      actualStart: start,
      actualEnd: end,
      progress: clampProgress(editDraft.value.progress),
      color: editDraft.value.color
    }
    emit("taskChange", editDraft.value.id, patch)
  }

  editorOpen.value = false
}

function deleteSelectedTask() {
  if (!editDraft.value.id || editMode.value !== "edit") {
    return
  }
  emit("taskDelete", editDraft.value.id)
  selectedTaskId.value = null
  editorOpen.value = false
}

function rollupSummaryTasks(tasks: GanttTask[]): GanttTask[] {
  const byId = new Map(tasks.map((task) => [task.id, {
    ...task,
    plan: { ...task.plan },
    actual: { ...task.actual },
    dependencies: task.dependencies?.map((dependency) => ({ ...dependency }))
  }]))
  const children = new Map<string, GanttTask[]>()

  for (const task of byId.values()) {
    if (!task.parentId) {
      continue
    }
    children.set(task.parentId, [...(children.get(task.parentId) ?? []), task])
  }

  const visit = (task: GanttTask): GanttTask => {
    const childTasks = children.get(task.id)?.map(visit) ?? []
    if (task.type !== "summary" || childTasks.length === 0) {
      return task
    }

    const planStarts = childTasks.map((child) => toDate(child.plan.start))
    const planEnds = childTasks.map((child) => toDate(child.plan.end))
    const actualStarts = childTasks.map((child) => toDate(child.actual.start))
    const actualEnds = childTasks.map((child) => toDate(child.actual.end))
    const weighted = childTasks.reduce((acc, child) => {
      const weight = taskDurationDays(child.actual.start, child.actual.end)
      return {
        total: acc.total + weight,
        done: acc.done + weight * clampProgress(child.actual.progress)
      }
    }, { total: 0, done: 0 })

    task.plan = {
      ...task.plan,
      start: formatDate(minTaskDate(planStarts)),
      end: formatDate(maxTaskDate(planEnds))
    }
    task.actual = {
      ...task.actual,
      start: formatDate(minTaskDate(actualStarts)),
      end: formatDate(maxTaskDate(actualEnds)),
      progress: weighted.total > 0 ? Math.round(weighted.done / weighted.total) : 0
    }
    return task
  }

  for (const task of byId.values()) {
    if (!task.parentId) {
      visit(task)
    }
  }

  return tasks.map((task) => byId.get(task.id) ?? task)
}

function minTaskDate(dates: Date[]): Date {
  return new Date(Math.min(...dates.map((date) => date.getTime())))
}

function maxTaskDate(dates: Date[]): Date {
  return new Date(Math.max(...dates.map((date) => date.getTime())))
}

function taskDurationDays(start: string | Date, end: string | Date): number {
  const startDate = toDate(start)
  const endDate = toDate(end)
  return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1)
}

function syncScroll(event: Event) {
  const target = event.target as HTMLDivElement
  scrollLeft.value = target.scrollLeft
  scrollTop.value = target.scrollTop
  if (tableRef.value && tableRef.value.scrollTop !== target.scrollTop) {
    tableRef.value.scrollTop = target.scrollTop
  }
}

function syncTableScroll(event: Event) {
  const target = event.target as HTMLDivElement
  scrollTop.value = target.scrollTop
  if (timelineRef.value && timelineRef.value.scrollTop !== target.scrollTop) {
    timelineRef.value.scrollTop = target.scrollTop
  }
}

function updateLinkDraft(event: PointerEvent) {
  if (!linkDraft.value) {
    return
  }
  const timeline = timelineRef.value?.getBoundingClientRect()
  if (!timeline) {
    return
  }
  pendingLinkDraftPoint = {
    x: event.clientX - timeline.left + scrollLeft.value,
    y: event.clientY - timeline.top - mergedConfig.value.headerHeight + scrollTop.value
  }
  if (!linkDraftFrame) {
    linkDraftFrame = window.requestAnimationFrame(() => {
      linkDraftFrame = 0
      if (!linkDraft.value || !pendingLinkDraftPoint) {
        return
      }
      linkDraft.value = {
        ...linkDraft.value,
        ...pendingLinkDraftPoint
      }
    })
  }
}

function clearLinkDraft() {
  if (linkDraftFrame) {
    window.cancelAnimationFrame(linkDraftFrame)
    linkDraftFrame = 0
  }
  pendingLinkDraftPoint = null
  linkDraft.value = null
}

function clampTaskListWidth(width: number): number {
  const chartWidth = chartRef.value?.clientWidth || width + 320
  return Math.round(Math.min(Math.max(280, width), Math.max(280, chartWidth - 320)))
}

function beginSplitterResize(event: PointerEvent) {
  const startX = event.clientX
  const startWidth = taskListWidth.value
  resizingTaskList.value = true
  document.body.classList.add("gantt-resizing")

  const onMove = (moveEvent: PointerEvent) => {
    taskListWidth.value = clampTaskListWidth(startWidth + moveEvent.clientX - startX)
  }
  const onUp = () => {
    stopSplitterResize?.()
  }

  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerup", onUp, { once: true })
  stopSplitterResize = () => {
    window.removeEventListener("pointermove", onMove)
    window.removeEventListener("pointerup", onUp)
    document.body.classList.remove("gantt-resizing")
    resizingTaskList.value = false
    stopSplitterResize = null
  }
}

function resizeTaskListByKeyboard(event: KeyboardEvent) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return
  }
  event.preventDefault()
  taskListWidth.value = clampTaskListWidth(taskListWidth.value + (event.key === "ArrowRight" ? 20 : -20))
}

function resetTaskListWidth() {
  taskListWidth.value = clampTaskListWidth(mergedConfig.value.taskListWidth)
}

function drawCanvas() {
  const canvas = canvasRef.value
  const timeline = timelineRef.value
  if (!canvas || !timeline) {
    return
  }

  const width = timeline.clientWidth
  const height = Math.max(1, timeline.clientHeight - mergedConfig.value.headerHeight)
  setupCanvas(canvas, width, height)
  const context = canvas.getContext("2d")
  if (!context) {
    return
  }

  drawGrid(context, scale.value, mergedConfig.value.rowHeight, width, height, scrollLeft.value, scrollTop.value)
}

function taskStyle(layout: TaskLayout, task: GanttTask) {
  const rowTop = layout.top - mergedConfig.value.headerHeight
  const top = task.type === "milestone"
    ? 0
    : rowTop + (task.type === "summary" ? ACTUAL_BAR_TOP + 1 : ACTUAL_BAR_TOP)
  const height = task.type === "milestone"
    ? Math.max(1, totalHeight.value - mergedConfig.value.headerHeight)
    : task.type === "summary" ? 8 : ACTUAL_BAR_HEIGHT
  return {
    transform: `translate(${layout.left}px, ${top}px)`,
    width: task.type === "milestone" ? "0px" : `${layout.width}px`,
    height: `${height}px`,
    "--bar-color": actualTaskColor(task),
    "--overdue-color": "#dc2626"
  }
}

function planBarStyle(layout: TaskLayout, task: GanttTask) {
  const start = toDate(task.plan.start)
  const end = toDate(task.plan.end)
  const dayWidth = mergedConfig.value.columnWidth
  const left = Math.round((start.getTime() - timelineStart.value.getTime()) / 86400000) * dayWidth
  const width = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1) * dayWidth
  const rowTop = layout.top - mergedConfig.value.headerHeight

  return {
    transform: `translate(${left}px, ${rowTop + PLAN_BAR_TOP}px)`,
    width: `${width}px`,
    height: `${PLAN_BAR_HEIGHT}px`,
    "--bar-color": planTaskColor(),
    "--progress-color": progressColor()
  }
}

function overdueSegmentStyle(task: GanttTask) {
  if (!isOverdue(task)) {
    return { display: "none" }
  }

  const actualStart = toDate(task.actual.start)
  const actualEnd = toDate(task.actual.end)
  const overdueStart = new Date(Math.max(actualStart.getTime(), addDays(task.plan.end, 1).getTime()))
  const totalDays = taskDurationDays(actualStart, actualEnd)
  const offsetDays = Math.max(0, Math.round((overdueStart.getTime() - actualStart.getTime()) / 86400000))
  const left = Math.min(100, offsetDays / totalDays * 100)

  return {
    left: `${left}%`,
    width: `${Math.max(0, 100 - left)}%`
  }
}

type DragPreviewMode = "move" | "start" | "end" | "plan-move" | "plan-start" | "plan-end"

function previewBarMetrics(layout: Pick<TaskLayout, "left" | "width">, mode: DragPreviewMode, pixelDelta: number) {
  const dayWidth = mergedConfig.value.columnWidth
  const normalizedMode = mode.startsWith("plan-")
    ? mode.replace("plan-", "")
    : mode

  if (normalizedMode === "move") {
    return { left: layout.left + pixelDelta, width: layout.width }
  }

  if (normalizedMode === "start") {
    const width = Math.max(dayWidth, layout.width - pixelDelta)
    return {
      left: layout.left + layout.width - width,
      width
    }
  }

  return {
    left: layout.left,
    width: Math.max(dayWidth, layout.width + pixelDelta)
  }
}

function actualPreviewPixelDelta(
  mode: "move" | "start" | "end",
  originalStart: Date,
  originalEnd: Date,
  patch: PatchTask,
  columnWidth: number
): number {
  if (mode === "end") {
    return Math.round((toDate(patch.actualEnd ?? originalEnd).getTime() - originalEnd.getTime()) / 86400000) * columnWidth
  }

  return Math.round((toDate(patch.actualStart ?? originalStart).getTime() - originalStart.getTime()) / 86400000) * columnWidth
}

function applyBarPreviewStyle(element: HTMLElement, layout: Pick<TaskLayout, "left" | "width">, mode: DragPreviewMode, pixelDelta: number) {
  const metrics = previewBarMetrics(layout, mode, pixelDelta)
  const [, top = "0"] = element.style.transform.match(/translate\([^,]+,\s*([^)]+)\)/) ?? []
  element.style.transform = `translate(${metrics.left}px, ${top})`
  element.style.width = `${metrics.width}px`
}

function planPreviewLayout(task: GanttTask): Pick<TaskLayout, "left" | "width"> {
  const dayWidth = mergedConfig.value.columnWidth
  const start = toDate(task.plan.start)
  const end = toDate(task.plan.end)
  return {
    left: Math.round((start.getTime() - timelineStart.value.getTime()) / 86400000) * dayWidth,
    width: Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1) * dayWidth
  }
}

function linkPointsFor(link: GanttLink, activeTaskId?: string, activeMetrics?: Pick<TaskLayout, "left" | "width">): string {
  const sourceLayout = layoutById.value.get(link.sourceId)
  const targetLayout = layoutById.value.get(link.targetId)
  if (!sourceLayout || !targetLayout) {
    return ""
  }

  const source = activeTaskId === link.sourceId && activeMetrics
    ? { ...sourceLayout, ...activeMetrics }
    : sourceLayout
  const target = activeTaskId === link.targetId && activeMetrics
    ? { ...targetLayout, ...activeMetrics }
    : targetLayout
  const sourceAnchor = link.type === "SS" || link.type === "SF" ? "start" : "finish"
  const targetAnchor = link.type === "SS" || link.type === "FS" ? "start" : "finish"
  const start = taskAnchorPoint(source, sourceAnchor, mergedConfig.value.headerHeight, ACTUAL_BAR_TOP, ACTUAL_BAR_HEIGHT)
  const end = taskAnchorPoint(target, targetAnchor, mergedConfig.value.headerHeight, ACTUAL_BAR_TOP, ACTUAL_BAR_HEIGHT)
  return buildOrthogonalLinkPath(start, end, sourceAnchor, targetAnchor).map((point) => `${point.x},${point.y}`).join(" ")
}

function collectLinkElementsById(): Map<string, SVGPolylineElement[]> {
  const elementsByLinkId = new Map<string, SVGPolylineElement[]>()
  timelineRef.value?.querySelector(".gantt-link-layer")?.querySelectorAll<SVGPolylineElement>("[data-link-id]").forEach((element) => {
    const linkId = element.dataset.linkId
    if (!linkId) {
      return
    }
    elementsByLinkId.set(linkId, [...(elementsByLinkId.get(linkId) ?? []), element])
  })
  return elementsByLinkId
}

function updateConnectedLinkElements(
  taskId: string,
  metrics: Pick<TaskLayout, "left" | "width">,
  connectedLinks = normalizedLinks.value.filter((link) => link.sourceId === taskId || link.targetId === taskId),
  elementsByLinkId = collectLinkElementsById()
) {
  for (const link of connectedLinks) {
    const points = linkPointsFor(link, taskId, metrics)
    if (!points) {
      continue
    }
    for (const element of elementsByLinkId.get(link.id) ?? []) {
      element.setAttribute("points", points)
    }
  }
}

function markerGroupStyle(date: string, color?: string) {
  const left = (toDate(date).getTime() - timelineStart.value.getTime()) / (24 * 60 * 60 * 1000) * mergedConfig.value.columnWidth
  return { transform: `translateX(${left}px)`, "--marker-color": color || "#d97706" }
}

function markerItemStyle(index: number, color?: string) {
  return {
    transform: `translateY(${8 + index * 22}px)`,
    "--marker-color": color || "#d97706"
  }
}

function markerTooltipOnLeft(date: string | Date): boolean {
  const timeline = timelineRef.value
  if (!timeline) {
    return false
  }
  const left = (toDate(date).getTime() - timelineStart.value.getTime()) / (24 * 60 * 60 * 1000) * mergedConfig.value.columnWidth
  return left - scrollLeft.value > timeline.clientWidth - 180
}

function topHeaderForTick(tick: TimeScale): { key: string; label: string } {
  if (mergedConfig.value.viewMode === "day") {
    const delta = (tick.start.getDay() - mergedConfig.value.firstDayOfWeek + 7) % 7
    const weekStart = addDays(tick.start, -delta)
    return { key: formatDate(weekStart), label: formatDate(weekStart) }
  }

  const year = tick.start.getFullYear()
  return { key: formatDate(tick.start), label: String(year) }
}

function tickLabel(tick: TimeScale): string {
  if (mergedConfig.value.viewMode === "day") {
    return String(tick.start.getDate())
  }
  if (mergedConfig.value.viewMode === "week") {
    return `${tick.start.getMonth() + 1}-${tick.start.getDate()}`
  }
  if (mergedConfig.value.viewMode === "month") {
    return `${tick.start.getMonth() + 1}月`
  }
  if (mergedConfig.value.viewMode === "quarter") {
    return `${Math.floor(tick.start.getMonth() / 3) + 1}季度`
  }
  if (mergedConfig.value.viewMode === "year") {
    return String(tick.start.getFullYear())
  }
  return String(tick.start.getDate())
}

function beginDrag(event: PointerEvent, task: GanttTask, mode: "move" | "start" | "end") {
  if (mergedConfig.value.editable === false) {
    return
  }
  if (task.type === "summary") {
    return
  }
  if (linkDraft.value) {
    return
  }
  if (task.type === "milestone" && mode !== "move") {
    return
  }

  const startX = event.clientX
  const columnWidth = mergedConfig.value.columnWidth
  const originalStart = toDate(task.actual.start)
  const originalEnd = toDate(task.actual.end)
  const target = event.currentTarget as HTMLElement
  const previewElement = target.closest(".gantt-bar") as HTMLElement | null
  const baseLayout = layoutById.value.get(task.id)
  if (!previewElement || !baseLayout) {
    return
  }
  target.setPointerCapture?.(event.pointerId)
  selectedTaskId.value = task.id
  draggingTask.value = true
  previewElement.classList.add("dragging")
  hideTaskDetails()
  let lastDeltaDays = 0
  let previewFrame = 0
  let pendingDeltaDays = 0
  const incomingLinks = normalizedLinks.value.filter((link) => link.targetId === task.id)
  const connectedLinks = normalizedLinks.value.filter((link) => link.sourceId === task.id || link.targetId === task.id)
  const linkElementsById = collectLinkElementsById()
  const dependencyTaskById = taskById.value

  const flushPreview = () => {
    previewFrame = 0
    const patch = clampPatchByDependencies(
      task,
      buildDragPatch(task, mode, originalStart, originalEnd, pendingDeltaDays),
      incomingLinks,
      dependencyTaskById
    )
    const previewPixelDelta = actualPreviewPixelDelta(mode, originalStart, originalEnd, patch, columnWidth)
    const metrics = previewBarMetrics(baseLayout, mode, previewPixelDelta)
    applyBarPreviewStyle(previewElement, baseLayout, mode, previewPixelDelta)
    updateConnectedLinkElements(task.id, metrics, connectedLinks, linkElementsById)
  }

  const onMove = (moveEvent: PointerEvent) => {
    const deltaDays = Math.round((moveEvent.clientX - startX) / columnWidth)
    if (deltaDays === lastDeltaDays) {
      return
    }
    lastDeltaDays = deltaDays
    pendingDeltaDays = deltaDays
    if (!previewFrame) {
      previewFrame = window.requestAnimationFrame(flushPreview)
    }
  }

  const onUp = (upEvent: PointerEvent) => {
    const deltaDays = Math.round((upEvent.clientX - startX) / columnWidth)
    if (previewFrame) {
      window.cancelAnimationFrame(previewFrame)
      previewFrame = 0
    }
    target.releasePointerCapture?.(event.pointerId)
    target.removeEventListener("pointermove", onMove)
    target.removeEventListener("pointerup", onUp)
    previewElement.classList.remove("dragging")
    draggingTask.value = false

    if (deltaDays === 0) {
      return
    }

    const patch = clampPatchByDependencies(
      task,
      buildDragPatch(task, mode, originalStart, originalEnd, deltaDays),
      incomingLinks,
      dependencyTaskById
    )

    const impact = computeImpact(task.id, patch, dependencyTasks.value, normalizedLinks.value, mergedConfig.value)
    if (!impact.ok) {
      emit("taskChange", task.id, patch)
      return
    }

    emit("taskChange", task.id, patch)
    for (const changed of impact.data.changed) {
      if (changed.taskId === task.id) {
        continue
      }
      emit("taskChange", changed.taskId, {
        actualStart: changed.actualStart,
        actualEnd: changed.actualEnd
      })
    }
  }

  target.addEventListener("pointermove", onMove)
  target.addEventListener("pointerup", onUp)
}

function beginPlanDrag(event: PointerEvent, task: GanttTask, mode: "move" | "start" | "end") {
  if (mergedConfig.value.editable === false || mergedConfig.value.editablePlan !== true) {
    return
  }
  if (task.type === "summary") {
    return
  }
  if (linkDraft.value) {
    return
  }
  if (task.type === "milestone" && mode !== "move") {
    return
  }

  const startX = event.clientX
  const columnWidth = mergedConfig.value.columnWidth
  const originalStart = toDate(task.plan.start)
  const originalEnd = toDate(task.plan.end)
  const target = event.currentTarget as HTMLElement
  const previewElement = target.closest(".gantt-plan-bar") as HTMLElement | null
  const rowLayout = layoutById.value.get(task.id)
  const baseLayout = planPreviewLayout(task)
  if (!previewElement || !rowLayout) {
    return
  }
  target.setPointerCapture?.(event.pointerId)
  selectedTaskId.value = task.id
  draggingTask.value = true
  previewElement.classList.add("dragging")
  hideTaskDetails()
  let lastDeltaDays = 0
  let previewFrame = 0
  let pendingDeltaDays = 0

  const flushPreview = () => {
    previewFrame = 0
    const previewMode: DragPreviewMode = mode === "move" ? "plan-move" : mode === "start" ? "plan-start" : "plan-end"
    applyBarPreviewStyle(previewElement, baseLayout, previewMode, pendingDeltaDays * columnWidth)
  }

  const onMove = (moveEvent: PointerEvent) => {
    const deltaDays = Math.round((moveEvent.clientX - startX) / columnWidth)
    if (deltaDays === lastDeltaDays) {
      return
    }
    lastDeltaDays = deltaDays
    pendingDeltaDays = deltaDays
    if (!previewFrame) {
      previewFrame = window.requestAnimationFrame(flushPreview)
    }
  }

  const onUp = (upEvent: PointerEvent) => {
    const deltaDays = Math.round((upEvent.clientX - startX) / columnWidth)
    if (previewFrame) {
      window.cancelAnimationFrame(previewFrame)
      previewFrame = 0
    }
    target.releasePointerCapture?.(event.pointerId)
    target.removeEventListener("pointermove", onMove)
    target.removeEventListener("pointerup", onUp)
    previewElement.classList.remove("dragging")
    draggingTask.value = false

    if (deltaDays === 0) {
      return
    }

    emit("taskChange", task.id, buildPlanDragPatch(task, mode, originalStart, originalEnd, deltaDays))
  }

  target.addEventListener("pointermove", onMove)
  target.addEventListener("pointerup", onUp)
}

function beginLink(event: PointerEvent, task: GanttTask, sourceAnchor: LinkAnchor) {
  if (mergedConfig.value.editable === false || mergedConfig.value.enableLinkCreation === false || task.type === "milestone" || task.type === "summary") {
    return
  }
  const timeline = timelineRef.value?.getBoundingClientRect()
  if (!timeline) {
    return
  }
  event.preventDefault()
  selectedTaskId.value = task.id
  hideTaskDetails()
  const layout = layoutById.value.get(task.id)
  const start = layout
    ? taskAnchorPoint(layout, sourceAnchor, mergedConfig.value.headerHeight, ACTUAL_BAR_TOP, ACTUAL_BAR_HEIGHT)
    : {
        x: event.clientX - timeline.left + scrollLeft.value,
        y: event.clientY - timeline.top - mergedConfig.value.headerHeight + scrollTop.value
      }

  linkDraft.value = {
    sourceId: task.id,
    sourceAnchor,
    startX: start.x,
    startY: start.y,
    x: event.clientX - timeline.left + scrollLeft.value,
    y: event.clientY - timeline.top - mergedConfig.value.headerHeight + scrollTop.value
  }
}

function finishLink(task: GanttTask, targetAnchor: LinkAnchor = "start") {
  const draft = linkDraft.value
  if (!draft || draft.sourceId === task.id || task.type === "milestone" || task.type === "summary") {
    clearLinkDraft()
    return
  }

  const nextLink: GanttLink = {
    id: `link-${draft.sourceId}-${task.id}-${Date.now()}`,
    sourceId: draft.sourceId,
    targetId: task.id,
    type: linkTypeFromAnchors(draft.sourceAnchor, targetAnchor),
    lag: 0,
    lagUnit: "calendar"
  }
  emit("linkChange", normalizeLinks(dependencyTasks.value, [...normalizedLinks.value, nextLink]))
  clearLinkDraft()
}

function linkTypeFromAnchors(sourceAnchor: LinkAnchor, targetAnchor: LinkAnchor): GanttLink["type"] {
  if (sourceAnchor === "start" && targetAnchor === "start") return "SS"
  if (sourceAnchor === "start" && targetAnchor === "finish") return "SF"
  if (sourceAnchor === "finish" && targetAnchor === "finish") return "FF"
  return "FS"
}

function dependencyLockedDate(source: GanttTask, link: GanttLink): Date {
  const lag = link.lag ?? 0
  if (link.type === "FS") {
    return addDays(source.actual.end, lag + 1)
  }
  if (link.type === "SS") {
    return addDays(source.actual.start, lag)
  }
  if (link.type === "FF") {
    return addDays(source.actual.end, lag)
  }
  return addDays(source.actual.start, lag)
}

function clampPatchByDependencies(
  task: GanttTask,
  patch: PatchTask,
  incoming = normalizedLinks.value.filter((link) => link.targetId === task.id),
  byId = taskById.value
): PatchTask {
  if (!incoming.length) {
    return patch
  }

  let start = toDate(patch.actualStart ?? task.actual.start)
  let end = toDate(patch.actualEnd ?? task.actual.end)
  const span = Math.max(0, Math.round((toDate(task.actual.end).getTime() - toDate(task.actual.start).getTime()) / 86400000))
  let startLocked = false
  let endLocked = false

  for (const link of incoming) {
    const source = byId.get(link.sourceId)
    if (!source) {
      continue
    }
    const locked = dependencyLockedDate(source, link)
    if (link.type === "FS" || link.type === "SS") {
      if (start.getTime() < locked.getTime()) {
        start = locked
        startLocked = true
      }
    } else if (end.getTime() < locked.getTime()) {
      end = locked
      endLocked = true
    }
  }

  if (startLocked && patch.actualEnd) {
    end = addDays(start, task.type === "milestone" ? 0 : span)
  }
  if (endLocked && patch.actualStart) {
    start = task.type === "milestone" ? end : addDays(end, -span)
  }
  if (task.type !== "milestone" && end.getTime() < start.getTime()) {
    end = start
  }

  return {
    ...patch,
    ...("actualStart" in patch || startLocked ? { actualStart: start } : {}),
    ...("actualEnd" in patch || endLocked ? { actualEnd: end } : {})
  }
}

function buildDragPatch(
  task: GanttTask,
  mode: "move" | "start" | "end",
  originalStart: Date,
  originalEnd: Date,
  deltaDays: number
): PatchTask {
  if (mode === "move") {
    const nextStart = addDays(originalStart, deltaDays)
    const nextEnd = task.type === "milestone" ? nextStart : addDays(originalEnd, deltaDays)
    return { actualStart: nextStart, actualEnd: nextEnd }
  }

  if (mode === "start") {
    const nextStart = addDays(originalStart, deltaDays)
    return { actualStart: nextStart, actualEnd: task.type === "milestone" ? nextStart : originalEnd }
  }

  return { actualEnd: addDays(originalEnd, deltaDays) }
}

function buildPlanDragPatch(
  task: GanttTask,
  mode: "move" | "start" | "end",
  originalStart: Date,
  originalEnd: Date,
  deltaDays: number
): PatchTask {
  if (mode === "move") {
    const nextStart = addDays(originalStart, deltaDays)
    const nextEnd = task.type === "milestone" ? nextStart : addDays(originalEnd, deltaDays)
    return { planStart: nextStart, planEnd: nextEnd }
  }

  if (mode === "start") {
    const nextStart = addDays(originalStart, deltaDays)
    return { planStart: nextStart, planEnd: task.type === "milestone" ? nextStart : originalEnd }
  }

  return { planEnd: addDays(originalEnd, deltaDays) }
}

function defaultTaskColor(type: GanttTask["type"]) {
  if (type === "summary") return mergedConfig.value.taskColors?.summary ?? "#475467"
  if (type === "milestone") return mergedConfig.value.taskColors?.milestone ?? "#d97706"
  return mergedConfig.value.taskColors?.task ?? "#2563eb"
}

function actualTaskColor(task: GanttTask) {
  return task.color || defaultTaskColor(task.type)
}

function planTaskColor() {
  return mergedConfig.value.taskColors?.plan ?? "#cbd5e1"
}

function progressColor() {
  return mergedConfig.value.taskColors?.progress ?? "#0f766e"
}

function clampProgress(value: number) {
  return Math.min(100, Math.max(0, Number(value) || 0))
}
</script>

<template>
  <section ref="chartRef" class="gantt-chart" :style="{ height: chartHeight }">
    <div class="gantt-toolbar">
      <div class="gantt-title">
        <strong>项目甘特图</strong>
        <span>{{ flatTasks.length }} 个任务</span>
      </div>
      <div class="gantt-legend" aria-label="时间条图例">
        <span><i class="plan"></i>计划</span>
        <span><i class="actual"></i>实际</span>
      </div>
      <div class="gantt-actions">
        <button class="quiet" type="button" :disabled="!selectedTask" @click="selectedTask && openEditor(selectedTask)">编辑</button>
        <button class="primary" type="button" @click="openCreateEditor('task')">新建任务</button>
        <button class="secondary" type="button" @click="openCreateMarker">新建里程碑</button>
      </div>
      <fieldset class="gantt-scale-options" aria-label="时间刻度">
        <label v-for="option in viewOptions" :key="option.mode">
          <input
            type="radio"
            name="gantt-view-mode"
            :value="option.mode"
            :checked="mergedConfig.viewMode === option.mode"
            @change="setViewMode(option.mode)"
          >
          <span>{{ option.label }}</span>
        </label>
      </fieldset>
    </div>

    <div v-if="!tasks.length" class="gantt-empty">暂无任务</div>
    <div v-else class="gantt-main">
      <div class="gantt-table" :style="{ width: `${taskListWidth}px` }">
        <div ref="tableRef" class="gantt-table-scroll" @scroll="syncTableScroll">
          <div class="gantt-table-head" :style="{ height: `${mergedConfig.headerHeight}px` }">
            <span>任务名称</span>
            <span>状态</span>
            <span>负责人</span>
            <span>计划开始</span>
            <span>计划完成</span>
            <span>实际开始</span>
            <span>实际完成</span>
            <span>进度</span>
          </div>
          <div class="gantt-table-body">
            <div
              v-if="visibleWindow.before > 0"
              class="gantt-row-spacer"
              :style="{ height: `${visibleWindow.before}px` }"
              aria-hidden="true"
            ></div>
            <div
              v-for="flat in visibleRows"
              :key="flat.task.id"
              class="gantt-row"
              :class="{
                selected: flat.task.id === selectedTaskId,
                'summary-row': flat.task.type === 'summary'
              }"
              :style="{ height: `${mergedConfig.rowHeight}px` }"
              @mouseenter="showTaskDetails($event, flat.task, 'table')"
              @mousemove="moveTaskDetails"
              @mouseleave="hideTaskDetails"
              @click="selectedTaskId = flat.task.id"
              @dblclick="openEditor(flat.task)"
            >
              <span
                class="gantt-name"
                :class="{
                  child: flat.depth > 0
                }"
                :style="{
                  paddingLeft: `${12 + flat.depth * 18}px`
                }"
              >
                <button
                  v-if="flat.hasChildren"
                  type="button"
                  class="gantt-collapse"
                  :aria-label="flat.collapsed ? '展开' : '折叠'"
                  @click.stop="toggleCollapsed(flat.task.id)"
                >
                  <span class="gantt-chevron" :class="{ collapsed: flat.collapsed }"></span>
                </button>
                <span v-else class="gantt-collapse-placeholder"></span>
                <i class="gantt-type-dot" :class="flat.task.type"></i>
                <span class="gantt-name-text">{{ flat.task.name }}</span>
              </span>
              <span class="gantt-status-cell">
                <span class="gantt-status" :class="taskStatus(flat.task).className">
                  {{ taskStatus(flat.task).label }}
                </span>
              </span>
              <span class="gantt-owner-cell" :title="taskOwner(flat.task) || '未分配'">
                <i v-if="taskOwner(flat.task)" class="gantt-owner" :style="ownerStyle(flat.task)">
                  {{ ownerInitial(flat.task) }}
                </i>
                <small v-else>—</small>
              </span>
              <span class="gantt-date-cell" :title="formatDate(flat.task.plan.start)">{{ shortDate(flat.task.plan.start) }}</span>
              <span class="gantt-date-cell" :title="formatDate(flat.task.plan.end)">{{ shortDate(flat.task.plan.end) }}</span>
              <span class="gantt-date-cell" :title="formatDate(flat.task.actual.start)">{{ shortDate(flat.task.actual.start) }}</span>
              <span class="gantt-date-cell" :title="formatDate(flat.task.actual.end)">{{ shortDate(flat.task.actual.end) }}</span>
              <span class="gantt-progress-cell" :class="taskStatus(flat.task).className">
                <i><em :style="{ width: `${flat.task.actual.progress}%` }"></em></i>
                <b>{{ flat.task.actual.progress }}%</b>
              </span>
            </div>
            <div
              v-if="visibleWindow.after > 0"
              class="gantt-row-spacer"
              :style="{ height: `${visibleWindow.after}px` }"
              aria-hidden="true"
            ></div>
          </div>
        </div>
      </div>

      <div
        class="gantt-splitter"
        :class="{ active: resizingTaskList }"
        role="separator"
        aria-label="Resize task table"
        aria-orientation="vertical"
        :aria-valuenow="taskListWidth"
        aria-valuemin="280"
        tabindex="0"
        @pointerdown.prevent="beginSplitterResize"
        @keydown="resizeTaskListByKeyboard"
        @dblclick="resetTaskListWidth"
      >
        <span></span>
      </div>

      <div
        ref="timelineRef"
        class="gantt-timeline"
        @scroll="syncScroll"
        @pointermove="handleTimelinePointerMove"
        @pointerup="clearLinkDraft"
      >
        <div class="gantt-timeline-inner" :style="timelineInnerStyle">
          <div class="gantt-scale" :style="{ height: `${mergedConfig.headerHeight}px` }">
            <div
              v-for="header in topHeaders"
              :key="`${header.key}-${header.left}`"
              class="gantt-month"
              :style="{ transform: `translateX(${header.left}px)`, width: `${header.width}px` }"
            >
              {{ header.label }}
            </div>
            <div
              v-for="tick in scale"
              :key="tick.start.toISOString()"
              class="gantt-tick"
              :class="{
                weekend: mergedConfig.viewMode === 'day' && (tick.start.getDay() === 0 || tick.start.getDay() === 6)
              }"
              :style="{ transform: `translateX(${tick.left}px)`, width: `${tick.width}px` }"
            >
              {{ tickLabel(tick) }}
            </div>
          </div>

          <canvas
            ref="canvasRef"
            class="gantt-canvas"
            :style="canvasStyle"
            aria-hidden="true"
          />

          <div class="gantt-cell-grid" aria-hidden="true"></div>
          <div class="gantt-weekend-layer" aria-hidden="true">
            <span
              v-for="weekend in weekendColumns"
              :key="weekend.date"
              :style="{ transform: `translateX(${weekend.left}px)`, width: `${mergedConfig.columnWidth}px` }"
            ></span>
          </div>

          <div class="gantt-marker-layer" :style="{ top: `${mergedConfig.headerHeight}px` }">
            <div
              v-for="group in groupedMarkers"
              :key="group.date"
              class="gantt-marker-group"
              :style="markerGroupStyle(group.date, group.color)"
            >
              <div class="gantt-marker-line"></div>
              <button
                v-for="(marker, markerIndex) in group.markers"
                :key="marker.id"
                type="button"
                class="gantt-marker"
                :class="{ 'tooltip-left': markerTooltipOnLeft(marker.date) }"
                :style="markerItemStyle(markerIndex, marker.color)"
                :title="`${marker.name} / ${formatDate(marker.date)}`"
                :aria-label="`${marker.name}，${formatDate(marker.date)}`"
                @dblclick.stop="openMarkerEditor(marker)"
              >
                <i></i>
                <span role="tooltip">
                  <b>{{ marker.name }}</b>
                  <small>{{ formatDate(marker.date) }}</small>
                </span>
              </button>
            </div>
          </div>

          <svg class="gantt-link-layer" :style="{ top: `${mergedConfig.headerHeight}px`, width: `${totalWidth}px`, height: `${Math.max(1, totalHeight - mergedConfig.headerHeight)}px` }" aria-label="任务依赖关系">
            <defs>
              <marker id="gantt-link-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z"></path>
              </marker>
            </defs>
            <polyline
              v-for="item in linkOverlayItems"
              :key="`path-${item.link.id}`"
              class="gantt-link-path"
              :class="{ selected: item.link.id === selectedLinkId }"
              :points="item.points"
              :data-link-id="item.link.id"
            ></polyline>
            <polyline
              v-for="item in linkOverlayItems"
              :key="`hit-${item.link.id}`"
              class="gantt-link-hit"
              :class="{ selected: item.link.id === selectedLinkId }"
              :points="item.points"
              :data-link-id="item.link.id"
              tabindex="0"
              role="button"
              :aria-label="`编辑依赖 ${item.link.type}`"
              @click.stop="openLinkEditor(item.link)"
              @keydown.enter.stop.prevent="openLinkEditor(item.link)"
              @keydown.space.stop.prevent="openLinkEditor(item.link)"
            ></polyline>
          </svg>

          <div class="gantt-bars" :style="{ top: `${mergedConfig.headerHeight}px` }" @mouseleave="hideTaskDetails">
            <div
              v-if="mergedConfig.showPlanBar !== false"
              v-for="layout in layouts"
              :key="`plan-${layout.taskId}`"
              class="gantt-plan-bar"
              :class="[
                taskById.get(layout.taskId)?.type,
                {
                  editable: mergedConfig.editablePlan === true && taskById.get(layout.taskId)?.type !== 'summary',
                  locked: mergedConfig.editablePlan !== true || taskById.get(layout.taskId)?.type === 'summary'
                }
              ]"
              :style="planBarStyle(layout, taskById.get(layout.taskId)!)"
              @mouseenter="showTaskDetails($event, taskById.get(layout.taskId)!, 'plan')"
              @mousemove="moveTaskDetails"
              @pointerdown="beginPlanDrag($event, taskById.get(layout.taskId)!, 'move')"
              @click.stop="selectedTaskId = layout.taskId"
            >
              <span class="gantt-plan-progress" :style="{ width: `${taskById.get(layout.taskId)?.actual.progress ?? 0}%` }"></span>
              <button v-if="taskById.get(layout.taskId)?.type !== 'summary'" class="gantt-plan-resize start" type="button" aria-label="调整计划开始时间" @pointerdown.stop="beginPlanDrag($event, taskById.get(layout.taskId)!, 'start')" />
              <button v-if="taskById.get(layout.taskId)?.type !== 'summary'" class="gantt-plan-resize end" type="button" aria-label="调整计划结束时间" @pointerdown.stop="beginPlanDrag($event, taskById.get(layout.taskId)!, 'end')" />
            </div>
            <div
              v-for="layout in layouts"
              :key="layout.taskId"
              class="gantt-bar"
              :class="[
                taskById.get(layout.taskId)?.type,
                {
                  selected: layout.taskId === selectedTaskId,
                  overdue: isOverdue(taskById.get(layout.taskId)!)
                }
              ]"
              :style="taskStyle(layout, taskById.get(layout.taskId)!)"
              @mouseenter="showTaskDetails($event, taskById.get(layout.taskId)!, 'timeline')"
              @mousemove="moveTaskDetails"
              @pointerdown="beginDrag($event, taskById.get(layout.taskId)!, 'move')"
              @pointerup.stop="finishLink(taskById.get(layout.taskId)!, 'start')"
              @click.stop="selectedTaskId = layout.taskId"
              @dblclick.stop="openEditor(taskById.get(layout.taskId)!)"
            >
              <template v-if="taskById.get(layout.taskId)?.type === 'milestone'">
                <span class="gantt-milestone-pole"></span>
                <span class="gantt-milestone-flag">里程碑</span>
                <span class="gantt-milestone-shape"></span>
                <span class="gantt-milestone-anchor"></span>
                <span class="gantt-milestone-label">
                  <b>{{ taskById.get(layout.taskId)?.name }}</b>
                  <small>{{ formatDate(taskById.get(layout.taskId)!.actual.start) }}</small>
                </span>
              </template>
              <template v-else>
                <button v-if="taskById.get(layout.taskId)?.type !== 'summary'" class="gantt-resize start" type="button" aria-label="调整开始时间" @pointerdown.stop="beginDrag($event, taskById.get(layout.taskId)!, 'start')" />
                <span class="gantt-overdue-segment" :style="overdueSegmentStyle(taskById.get(layout.taskId)!)"></span>
                <button
                  v-if="mergedConfig.enableLinkCreation !== false && taskById.get(layout.taskId)?.type !== 'summary'"
                  class="gantt-link-handle out"
                  type="button"
                  aria-label="创建任务依赖"
                  @pointerdown.stop="beginLink($event, taskById.get(layout.taskId)!, 'finish')"
                  @pointerup.stop="finishLink(taskById.get(layout.taskId)!, 'finish')"
                ></button>
                <button
                  v-if="mergedConfig.enableLinkCreation !== false && taskById.get(layout.taskId)?.type !== 'summary'"
                  class="gantt-link-handle in"
                  type="button"
                  aria-label="连接到此任务"
                  @pointerdown.stop="beginLink($event, taskById.get(layout.taskId)!, 'start')"
                  @pointerup.stop="finishLink(taskById.get(layout.taskId)!, 'start')"
                ></button>
                <button v-if="taskById.get(layout.taskId)?.type !== 'summary'" class="gantt-resize end" type="button" aria-label="调整结束时间" @pointerdown.stop="beginDrag($event, taskById.get(layout.taskId)!, 'end')" />
              </template>
            </div>
          </div>
          <svg v-if="linkDraft" class="gantt-link-draft" :style="linkDraftStyle" aria-hidden="true">
            <defs>
              <marker id="gantt-link-draft-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z"></path>
              </marker>
            </defs>
            <polyline :points="linkDraftPoints"></polyline>
          </svg>
        </div>
      </div>
    </div>

    <div
      v-if="hoveredTask"
      class="gantt-task-popover"
      :style="hoveredTaskStyle"
      role="tooltip"
    >
      <header>
        <span class="gantt-task-popover-type" :style="{ '--task-color': hoveredTask.task.color || defaultTaskColor(hoveredTask.task.type) }">
          <i></i>{{ taskTypeLabel(hoveredTask.task) }}
        </span>
        <strong>{{ hoveredTask.task.name }}</strong>
      </header>
      <div class="gantt-task-popover-meta">
        <span class="gantt-status" :class="taskStatus(hoveredTask.task).className">
          {{ taskStatus(hoveredTask.task).label }}
        </span>
        <span>{{ taskOwner(hoveredTask.task) || "未分配" }}</span>
        <span>{{ taskDurationText(hoveredTask.task) }}</span>
      </div>
      <dl>
        <div>
          <dt>计划</dt>
          <dd>{{ formatDate(hoveredTask.task.plan.start) }} - {{ formatDate(hoveredTask.task.plan.end) }}</dd>
        </div>
        <div>
          <dt>实际</dt>
          <dd>{{ formatDate(hoveredTask.task.actual.start) }} - {{ formatDate(hoveredTask.task.actual.end) }}</dd>
        </div>
      </dl>
      <div class="gantt-task-popover-progress">
        <span>进度</span>
        <b>{{ hoveredTask.task.actual.progress }}%</b>
        <i><em :style="{ width: `${hoveredTask.task.actual.progress}%` }"></em></i>
      </div>
    </div>

    <div v-if="editorOpen" class="gantt-editor-backdrop" @click="closeEditor"></div>
    <aside v-if="editorOpen" class="gantt-editor" aria-label="任务编辑">
      <header>
        <div>
          <span>{{ editMode === "create" ? "创建" : "编辑" }}</span>
          <strong>{{ editDraft.type === "milestone" ? "里程碑" : editDraft.type === "summary" ? "阶段" : "任务" }}</strong>
        </div>
        <button type="button" aria-label="关闭" @click="closeEditor">×</button>
      </header>

      <label>
        名称
        <input v-model.trim="editDraft.name" type="text" maxlength="80">
      </label>

      <label>
        类型
        <select v-model="editDraft.type">
          <option value="task">任务</option>
          <option value="summary">阶段</option>
        </select>
      </label>

      <label>
        父级阶段
        <select v-model="editDraft.parentId">
          <option value="">无</option>
          <option
            v-for="summary in summaryOptions"
            :key="summary.id"
            :value="summary.id"
            :disabled="summary.id === editDraft.id"
          >
            {{ summary.name }}
          </option>
        </select>
      </label>

      <div class="gantt-editor-grid">
        <label>
          开始
          <input v-model="editDraft.start" type="date">
        </label>
        <label>
          结束
          <input v-model="editDraft.end" type="date" :disabled="editDraft.type === 'milestone'">
        </label>
      </div>

      <label>
        进度
        <input v-model.number="editDraft.progress" type="number" min="0" max="100">
      </label>

      <label>
        颜色
        <input v-model="editDraft.color" type="color">
      </label>

      <footer>
        <button v-if="editMode === 'edit'" type="button" class="danger" @click="deleteSelectedTask">删除</button>
        <span></span>
        <button type="button" @click="closeEditor">取消</button>
        <button type="button" class="primary" @click="saveEditor">保存</button>
      </footer>
    </aside>

    <div v-if="markerEditorOpen" class="gantt-editor-backdrop" @click="closeMarkerEditor"></div>
    <aside v-if="markerEditorOpen" class="gantt-editor" aria-label="里程碑编辑">
      <header>
        <div>
          <span>{{ markerEditMode === "create" ? "创建" : "编辑" }}</span>
          <strong>里程碑</strong>
        </div>
        <button type="button" aria-label="关闭" @click="closeMarkerEditor">×</button>
      </header>

      <label>
        名称
        <input v-model.trim="markerDraft.name" type="text" maxlength="80">
      </label>

      <label>
        日期
        <input v-model="markerDraft.date" type="date">
      </label>

      <label>
        颜色
        <input v-model="markerDraft.color" type="color">
      </label>

      <footer>
        <button v-if="markerEditMode === 'edit'" type="button" class="danger" @click="deleteMarker">删除</button>
        <span></span>
        <button type="button" @click="closeMarkerEditor">取消</button>
        <button type="button" class="primary" @click="saveMarker">保存</button>
      </footer>
    </aside>

    <div v-if="linkEditorOpen" class="gantt-editor-backdrop" @click="closeLinkEditor"></div>
    <aside v-if="linkEditorOpen" class="gantt-editor gantt-link-editor" aria-label="依赖关系编辑">
      <header>
        <div>
          <span>编辑</span>
          <strong>任务依赖</strong>
        </div>
        <button type="button" aria-label="关闭" @click="closeLinkEditor">×</button>
      </header>

      <div class="gantt-link-editor-tasks">
        <b>{{ taskName(selectedLink?.sourceId ?? '') }}</b>
        <span class="gantt-link-editor-arrow">→</span>
        <b>{{ taskName(selectedLink?.targetId ?? '') }}</b>
      </div>

      <label class="gantt-link-editor-type">
        依赖类型
        <select v-model="linkEditDraft.type">
          <option value="FS">FS · 完成-开始</option>
          <option value="SS">SS · 开始-开始</option>
          <option value="FF">FF · 完成-完成</option>
          <option value="SF">SF · 开始-完成</option>
        </select>
      </label>

      <p class="gantt-link-editor-lock-hint">
        {{ linkLockLabel(linkEditDraft.type) }}
      </p>

      <div class="gantt-editor-grid gantt-link-editor-lag">
        <label>
          间隔天数
          <input v-model.number="linkEditDraft.lag" type="number" step="1">
        </label>
        <label>
          间隔单位
          <select v-model="linkEditDraft.lagUnit">
            <option value="calendar">日历天</option>
            <option value="working">工作日</option>
          </select>
        </label>
      </div>

      <footer>
        <button type="button" class="danger" @click="deleteLink">删除依赖</button>
        <span></span>
        <button type="button" @click="closeLinkEditor">取消</button>
        <button type="button" class="primary" @click="saveLinkEditor">保存</button>
      </footer>
    </aside>
  </section>
</template>
