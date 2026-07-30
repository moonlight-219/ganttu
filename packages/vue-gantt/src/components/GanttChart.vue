<script setup lang="ts">
import {
  addDays,
  computeLayout,
  computeTimeScale,
  defaultConfig,
  flattenTasks,
  formatDate,
  normalizeLinks,
  toDate,
  type CustomColumn,
  type GanttConfig,
  type GanttEditorField,
  type GanttLink,
  type GanttMarker,
  type GanttTask,
  type PatchTask,
  type TaskLayout,
  type TimeScale,
  type ViewMode
} from "@gantt/core"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import GanttDatePicker from "./GanttDatePicker.vue"
import GanttSelect from "./GanttSelect.vue"
import { drawGrid } from "../rendering/canvas/grid"
import { buildOrthogonalLinkPath, taskAnchorPoint, type LinkAnchor } from "../rendering/canvas/links"
import { setupCanvas } from "../rendering/canvas/viewport"
import type {
  GanttLinkRejection,
  GanttMarkerEditRequest,
  GanttMarkerEditorDraft,
  GanttTaskEditRequest,
  GanttTaskEditorDraft
} from "../types"

const props = withDefaults(defineProps<{
  tasks: GanttTask[]
  links?: GanttLink[]
  markers?: GanttMarker[]
  config?: Partial<GanttConfig>
  height?: string | number
  width?: string | number
  onTaskChange?: (id: string, patch: PatchTask) => void
  onTaskCreate?: (task: GanttTask) => void
  onTaskDelete?: (id: string) => void
  onTaskEditRequest?: (request: GanttTaskEditRequest) => void
  onMarkerCreate?: (marker: GanttMarker) => void
  onMarkerChange?: (id: string, marker: GanttMarker) => void
  onMarkerDelete?: (id: string) => void
  onMarkerEditRequest?: (request: GanttMarkerEditRequest) => void
  onLinkChange?: (links: GanttLink[]) => void
  onLinkRejected?: (rejection: GanttLinkRejection) => void
  onViewModeChange?: (mode: ViewMode) => void
}>(), {
  links: () => [],
  markers: () => []
})

const emit = defineEmits<{
  taskChange: [id: string, patch: PatchTask]
  taskCreate: [task: GanttTask]
  taskDelete: [id: string]
  taskEditRequest: [request: GanttTaskEditRequest]
  markerCreate: [marker: GanttMarker]
  markerChange: [id: string, marker: GanttMarker]
  markerDelete: [id: string]
  markerEditRequest: [request: GanttMarkerEditRequest]
  linkChange: [links: GanttLink[]]
  linkRejected: [rejection: GanttLinkRejection]
  viewModeChange: [mode: ViewMode]
}>()

const viewOptions: Array<{ mode: ViewMode; label: string }> = [
  { mode: "day", label: "周/日" },
  { mode: "week", label: "年/周" },
  { mode: "month", label: "年/月" },
  { mode: "quarter", label: "年/季度" }
]
const PLAN_BAR_HEIGHT = 12
const ACTUAL_BAR_HEIGHT = 14
const BAR_VERTICAL_GAP = 4
const editorColorOptions = [
  "#2563eb",
  "#8b5cf6",
  "#ec4899",
  "#d97706",
  "#eab308",
  "#10b981",
  "#06b6d4",
  "#64748b"
]
type GanttSelectOption = {
  label: string
  value: string | number
  disabled?: boolean
}
const taskTypeOptions: GanttSelectOption[] = [
  { label: "任务", value: "task" },
  { label: "阶段", value: "summary" }
]
const schedulingModeOptions: GanttSelectOption[] = [
  { label: "自动", value: "auto" },
  { label: "手动", value: "manual" }
]
const linkTypeOptions: GanttSelectOption[] = [
  { label: "FS · 完成-开始", value: "FS" },
  { label: "SS · 开始-开始", value: "SS" },
  { label: "FF · 完成-完成", value: "FF" },
  { label: "SF · 开始-完成", value: "SF" }
]
const lagUnitOptions: GanttSelectOption[] = [
  { label: "日历天", value: "calendar" },
  { label: "工作日", value: "working" }
]
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
const editDraft = ref<GanttTaskEditorDraft>({
  id: "",
  name: "",
  type: "task" as GanttTask["type"],
  parentId: "",
  planStart: "",
  planEnd: "",
  actualStart: "",
  actualEnd: "",
  progress: 0,
  color: "#2563eb",
  planColor: "#cbd5e1",
  resources: "",
  calendarId: "",
  duration: 0,
  schedulingMode: "auto" as NonNullable<GanttTask["schedulingMode"]>,
  custom: {} as Record<string, unknown>
})
const markerEditorOpen = ref(false)
const markerEditMode = ref<"create" | "edit">("create")
const markerDraft = ref<GanttMarkerEditorDraft>({
  id: "",
  name: "",
  date: "",
  color: "#d97706"
})
const selectedLinkId = ref<string | null>(null)
const linkEditorOpen = ref(false)
const linkNotice = ref<GanttLinkRejection | null>(null)
let linkNoticeTimer = 0
const linkEditDraft = ref({
  id: "",
  type: "FS" as GanttLink["type"],
  lag: 0,
  lagUnit: "calendar" as NonNullable<GanttLink["lagUnit"]>
})
const draggingTask = ref(false)
const dragPreview = ref<{
  taskId: string
  patch: PatchTask
  affected?: Record<string, PatchTask>
} | null>(null)
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

const mergedConfig = computed<GanttConfig>(() => {
  const base = { ...defaultConfig, ...props.config }
  const configuredWidth = props.config?.columnWidths?.[base.viewMode]
  return {
    ...base,
    columnWidth: configuredWidth ?? props.config?.columnWidth ?? defaultConfig.columnWidth
  }
})
watch(mergedConfig, (config) => {
  if (!resizingTaskList.value) {
    taskListWidth.value = config.taskListWidth
  }
}, { immediate: true })
function cssSize(value: string | number | undefined, fallback: string): string {
  if (typeof value === "number") return `${value}px`
  return value || fallback
}
const chartHeight = computed(() => cssSize(props.height ?? mergedConfig.value.height, "620px"))
const chartWidth = computed(() => cssSize(props.width ?? mergedConfig.value.width, "100%"))
const defaultColumns: CustomColumn[] = [
  { key: "name", label: "任务名称", width: 220, align: "left", editable: true },
  { key: "status", label: "状态", width: 72 },
  { key: "owner", label: "负责人", width: 72, editable: true },
  { key: "planStart", label: "计划开始", width: 92, type: "date", editable: true },
  { key: "planEnd", label: "计划完成", width: 92, type: "date", editable: true },
  { key: "actualStart", label: "实际开始", width: 92, type: "date", editable: true },
  { key: "actualEnd", label: "实际完成", width: 92, type: "date", editable: true },
  { key: "progress", label: "进度", width: 112, type: "number", editable: true }
]
const tableColumns = computed(() => {
  const configured = mergedConfig.value.columns?.length
    ? mergedConfig.value.columns
    : [...defaultColumns, ...(mergedConfig.value.customColumns ?? [])]
  return configured.filter((column) => column.visible !== false)
})
const tableGridTemplate = computed(() => tableColumns.value
  .map((column) => `${Math.max(48, column.width ?? 100)}px`)
  .join(" "))
const tableContentWidth = computed(() => tableColumns.value
  .reduce((width, column) => width + Math.max(48, column.width ?? 100), 0))
const baseDisplayedTasks = computed(() => rollupSummaryTasks(props.tasks))
const displayedTasks = computed(() => rollupSummaryTasks(
  props.tasks.map((task) => applyPreviewPatchToTask(task))
))
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
const parentSelectOptions = computed<GanttSelectOption[]>(() => [
  { label: "无", value: "" },
  ...summaryOptions.value.map((summary) => ({
    label: summary.name,
    value: summary.id,
    disabled: summary.id === editDraft.value.id
  }))
])
const dateRange = computed(() => {
  if (mergedConfig.value.visibleRange) {
    return {
      start: toDate(mergedConfig.value.visibleRange.start),
      end: toDate(mergedConfig.value.visibleRange.end)
    }
  }

  const dates = [
    ...baseDisplayedTasks.value.flatMap((task) => [
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
  [],
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
const milestoneLayouts = computed<TaskLayout[]>(() => displayedTasks.value
  .filter((task) => task.type === "milestone")
  .map((task) => ({
    taskId: task.id,
    rowIndex: 0,
    left: Math.round((toDate(task.actual.start).getTime() - timelineStart.value.getTime()) / 86400000) * mergedConfig.value.columnWidth,
    width: mergedConfig.value.columnWidth / 2,
    top: mergedConfig.value.headerHeight,
    depth: 0,
    isCritical: false
  })))
const renderedLayouts = computed<TaskLayout[]>(() => [
  ...layouts.value.filter((layout) => taskById.value.get(layout.taskId)?.type !== "milestone"),
  ...milestoneLayouts.value
])
const layoutById = computed(() => new Map(renderedLayouts.value.map((layout) => [layout.taskId, layout])))
const visibleRows = computed(() => flatTasks.value.slice(visibleWindow.value.start, visibleWindow.value.end + 1))

function barVerticalMetrics() {
  const outerGap = Math.max(
    0,
    Math.floor((
      mergedConfig.value.rowHeight
      - PLAN_BAR_HEIGHT
      - ACTUAL_BAR_HEIGHT
      - BAR_VERTICAL_GAP
    ) / 2)
  )
  return {
    planTop: outerGap,
    actualTop: mergedConfig.value.rowHeight - outerGap - ACTUAL_BAR_HEIGHT
  }
}

const selectedLink = computed(() => selectedLinkId.value ? normalizedLinks.value.find((link) => link.id === selectedLinkId.value) ?? null : null)
const linkOverlayItems = computed(() => {
  return normalizedLinks.value.flatMap((link) => {
    const sourceLayout = layoutById.value.get(link.sourceId)
    const targetLayout = layoutById.value.get(link.targetId)
    const sourceTask = taskById.value.get(link.sourceId)
    const targetTask = taskById.value.get(link.targetId)
    if (!sourceLayout || !targetLayout || !sourceTask || !targetTask) {
      return []
    }
    const source = planLinkLayout(sourceLayout, sourceTask)
    const target = planLinkLayout(targetLayout, targetTask)
    const sourceAnchor = link.type === "SS" || link.type === "SF" ? "start" : "finish"
    const targetAnchor = link.type === "SS" || link.type === "FS" ? "start" : "finish"
    const { planTop } = barVerticalMetrics()
    const start = taskAnchorPoint(source, sourceAnchor, mergedConfig.value.headerHeight, planTop, PLAN_BAR_HEIGHT)
    const end = taskAnchorPoint(target, targetAnchor, mergedConfig.value.headerHeight, planTop, PLAN_BAR_HEIGHT)
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
  if (linkNoticeTimer) {
    window.clearTimeout(linkNoticeTimer)
  }
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

const builtinColumnKeys = new Set([
  "name",
  "status",
  "owner",
  "planStart",
  "planEnd",
  "actualStart",
  "actualEnd",
  "progress"
])

const builtinEditorKeys = new Set([
  "name",
  "type",
  "parentId",
  "planStart",
  "planEnd",
  "actualStart",
  "actualEnd",
  "progress",
  "resources",
  "duration",
  "calendarId",
  "schedulingMode",
  "color",
  "planColor"
])
const defaultTaskEditorFields: GanttEditorField[] = [
  { key: "name", label: "名称", type: "text", editable: true },
  {
    key: "type",
    label: "类型",
    type: "select",
    editable: true,
    options: [
      { label: "任务", value: "task" },
      { label: "阶段", value: "summary" }
    ]
  },
  { key: "parentId", label: "父级阶段", type: "select", editable: true },
  { key: "planStart", label: "计划开始", type: "date", editable: true },
  { key: "planEnd", label: "计划完成", type: "date", editable: true },
  { key: "actualStart", label: "实际开始", type: "date", editable: true },
  { key: "actualEnd", label: "实际完成", type: "date", editable: true },
  { key: "progress", label: "进度", type: "number", editable: true },
  { key: "resources", label: "负责人", type: "text", editable: true },
  { key: "duration", label: "工期", type: "number", editable: true },
  { key: "calendarId", label: "日历 ID", type: "text", editable: true },
  {
    key: "schedulingMode",
    label: "排程方式",
    type: "select",
    editable: true,
    options: [
      { label: "自动", value: "auto" },
      { label: "手动", value: "manual" }
    ]
  },
  { key: "color", label: "实际条颜色", editable: true },
  { key: "planColor", label: "计划条颜色", editable: true }
]
const resolvedEditorFields = computed<GanttEditorField[]>(() => {
  const configured = new Map((mergedConfig.value.editorFields ?? []).map((field) => [field.key, field]))
  const customTableFields = tableColumns.value
    .filter((column) => !builtinColumnKeys.has(column.key))
    .map((column) => ({
    key: column.key,
    label: column.label,
    visible: true,
    editable: column.editable,
    type: column.type,
    options: column.options,
    placeholder: column.placeholder,
    ...(column.editor ?? {}),
    ...(configured.get(column.key) ?? {})
  }))
  const defaultFields = defaultTaskEditorFields.map((field) => ({
    ...field,
    ...(configured.get(field.key) ?? {})
  }))
  const fieldKeys = new Set([
    ...defaultFields.map((field) => field.key),
    ...customTableFields.map((field) => field.key)
  ])
  const additionalFields = (mergedConfig.value.editorFields ?? [])
    .filter((field) => !fieldKeys.has(field.key))
  return [...defaultFields, ...customTableFields, ...additionalFields].filter((field) => field.visible !== false)
})
const customEditorColumns = computed<CustomColumn[]>(() => resolvedEditorFields.value.filter((field) =>
  !builtinEditorKeys.has(field.key)
))
const editableCustomColumns = computed(() => customEditorColumns.value.filter((column) =>
  column.editable === true
))

function editorFieldVisible(key: string): boolean {
  return mergedConfig.value.editorFields?.find((field) => field.key === key)?.visible !== false
}

function editorFieldEditable(key: string): boolean {
  return mergedConfig.value.editorFields?.find((field) => field.key === key)?.editable !== false
}

function columnValue(column: CustomColumn, task: GanttTask): unknown {
  const displayTask = previewTask(task)
  let value: unknown
  if (column.key === "name") value = displayTask.name
  else if (column.key === "status") value = taskStatus(displayTask).label
  else if (column.key === "owner") value = taskOwner(displayTask)
  else if (column.key === "planStart") value = formatDate(displayTask.plan.start)
  else if (column.key === "planEnd") value = formatDate(displayTask.plan.end)
  else if (column.key === "actualStart") value = formatDate(displayTask.actual.start)
  else if (column.key === "actualEnd") value = formatDate(displayTask.actual.end)
  else if (column.key === "progress") value = displayTask.actual.progress
  else value = displayTask.custom?.[column.key]

  if (column.formatter) return column.formatter(value, displayTask)
  if (column.render) return column.render(displayTask).text
  return value ?? ""
}

function columnCellClass(column: CustomColumn, task: GanttTask) {
  const configured = typeof column.cellClass === "function" ? column.cellClass(task) : column.cellClass
  return [
    "gantt-column-cell",
    `gantt-column-${column.key}`,
    column.render?.(task).className,
    configured
  ]
}

function columnCellStyle(column: CustomColumn, task: GanttTask) {
  const configured = typeof column.cellStyle === "function" ? column.cellStyle(task) : column.cellStyle
  return {
    justifyContent: column.align === "left" ? "flex-start" : column.align === "right" ? "flex-end" : "center",
    textAlign: column.align ?? "center",
    ...configured
  }
}

function customEditorInputType(column: CustomColumn): string {
  if (column.type === "number") return "number"
  if (column.type === "date") return "date"
  return "text"
}

function setTaskType(value: string | number) {
  editDraft.value.type = String(value) as GanttTask["type"]
}

function setParentId(value: string | number) {
  editDraft.value.parentId = String(value)
}

function setSchedulingMode(value: string | number) {
  editDraft.value.schedulingMode = String(value) as NonNullable<GanttTask["schedulingMode"]>
}

function setCustomEditorValue(key: string, value: string | number) {
  editDraft.value.custom[key] = value
}

function setLinkType(value: string | number) {
  linkEditDraft.value.type = String(value) as GanttLink["type"]
}

function setLagUnit(value: string | number) {
  linkEditDraft.value.lagUnit = String(value) as NonNullable<GanttLink["lagUnit"]>
}

function normalizedCustomDraft(): Record<string, unknown> {
  const custom = { ...editDraft.value.custom }
  for (const column of editableCustomColumns.value) {
    if (column.type === "number" && custom[column.key] !== "" && custom[column.key] != null) {
      custom[column.key] = Number(custom[column.key])
    }
  }
  return custom
}

function setViewMode(viewMode: ViewMode) {
  emit("viewModeChange", viewMode)
}

function taskEditRequest(task?: GanttTask): GanttTaskEditRequest {
  return {
    mode: editMode.value,
    task,
    taskType: editDraft.value.type,
    draft: {
      ...editDraft.value,
      custom: { ...editDraft.value.custom }
    },
    fields: resolvedEditorFields.value.map((field) => ({
      ...field,
      options: field.options?.map((option) => ({ ...option }))
    }))
  }
}

function openEditor(task: GanttTask) {
  selectedTaskId.value = task.id
  editMode.value = "edit"
  editDraft.value = {
    id: task.id,
    name: task.name,
    type: task.type,
    parentId: task.parentId ?? "",
    planStart: formatDate(task.plan.start),
    planEnd: formatDate(task.plan.end),
    actualStart: formatDate(task.actual.start),
    actualEnd: formatDate(task.actual.end),
    progress: task.actual.progress,
    color: task.color || defaultTaskColor(task.type),
    planColor: task.planColor || defaultPlanColor(),
    resources: task.resources?.join(", ") ?? "",
    calendarId: task.calendarId ?? "",
    duration: task.duration ?? taskDurationDays(task.actual.start, task.actual.end),
    schedulingMode: task.schedulingMode ?? "auto",
    custom: { ...(task.custom ?? {}) }
  }
  emit("taskEditRequest", taskEditRequest(task))
  editorOpen.value = mergedConfig.value.builtInTaskEditor !== false
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
    planStart: start,
    planEnd: type === "milestone" ? start : formatDate(addDays(start, 4)),
    actualStart: start,
    actualEnd: type === "milestone" ? start : formatDate(addDays(start, 4)),
    progress: 0,
    color: defaultTaskColor(type),
    planColor: defaultPlanColor(),
    resources: "",
    calendarId: "",
    duration: type === "milestone" ? 1 : 5,
    schedulingMode: "auto",
    custom: Object.fromEntries(customEditorColumns.value.map((column) => [column.key, ""]))
  }
  emit("taskEditRequest", taskEditRequest())
  editorOpen.value = mergedConfig.value.builtInTaskEditor !== false
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
  emit("markerEditRequest", {
    mode: markerEditMode.value,
    draft: { ...markerDraft.value }
  })
  markerEditorOpen.value = mergedConfig.value.builtInMarkerEditor !== false
}

function openMarkerEditor(marker: GanttMarker) {
  markerEditMode.value = "edit"
  markerDraft.value = {
    id: marker.id,
    name: marker.name,
    date: formatDate(marker.date),
    color: marker.color || "#d97706"
  }
  emit("markerEditRequest", {
    mode: markerEditMode.value,
    marker,
    draft: { ...markerDraft.value }
  })
  markerEditorOpen.value = mergedConfig.value.builtInMarkerEditor !== false
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
  const planStart = editDraft.value.planStart
  const planEnd = editDraft.value.type === "milestone" ? planStart : editDraft.value.planEnd
  const actualStart = editDraft.value.actualStart
  const actualEnd = editDraft.value.type === "milestone" ? actualStart : editDraft.value.actualEnd
  const parentId = editDraft.value.type === "milestone" ? null : editDraft.value.parentId || null
  const resources = editDraft.value.resources.split(",").map((item) => item.trim()).filter(Boolean)
  const custom = normalizedCustomDraft()

  if (editMode.value === "create") {
    const task: GanttTask = {
      id: editDraft.value.id,
      name: editDraft.value.name.trim() || "未命名任务",
      type: editDraft.value.type,
      parentId,
      plan: { start: planStart, end: planEnd, progress: editDraft.value.progress },
      actual: { start: actualStart, end: actualEnd, progress: clampProgress(editDraft.value.progress) },
      color: editDraft.value.color,
      planColor: editDraft.value.planColor,
      resources,
      calendarId: editDraft.value.calendarId || undefined,
      duration: Math.max(0, Number(editDraft.value.duration) || 0),
      schedulingMode: editDraft.value.schedulingMode,
      custom
    }
    emit("taskCreate", task)
    selectedTaskId.value = task.id
  } else {
    const patch: PatchTask = {
      name: editDraft.value.name.trim() || "未命名任务",
      type: editDraft.value.type,
      parentId,
      planStart,
      planEnd,
      actualStart,
      actualEnd,
      progress: clampProgress(editDraft.value.progress),
      color: editDraft.value.color,
      planColor: editDraft.value.planColor,
      resources,
      calendarId: editDraft.value.calendarId || undefined,
      duration: Math.max(0, Number(editDraft.value.duration) || 0),
      schedulingMode: editDraft.value.schedulingMode,
      custom
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

function rejectLink(reason: GanttLinkRejection["reason"], sourceId: string, targetId: string) {
  const message = reason === "duplicate"
    ? "这两个任务之间已存在依赖关系"
    : reason === "cycle"
      ? "无法创建会形成循环的依赖关系"
      : "任务不能与自身建立依赖关系"
  const rejection: GanttLinkRejection = { reason, sourceId, targetId, message }
  linkNotice.value = rejection
  emit("linkRejected", rejection)
  if (linkNoticeTimer) {
    window.clearTimeout(linkNoticeTimer)
  }
  linkNoticeTimer = window.setTimeout(() => {
    linkNotice.value = null
    linkNoticeTimer = 0
  }, 2600)
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
  const hasPreview = dragPreview.value?.taskId === task.id
  const displayTask = previewTask(task)
  const actualStart = toDate(displayTask.actual.start)
  const actualEnd = toDate(displayTask.actual.end)
  const left = hasPreview
    ? Math.round((actualStart.getTime() - timelineStart.value.getTime()) / 86400000) * mergedConfig.value.columnWidth
    : layout.left
  const width = hasPreview
    ? Math.max(
        displayTask.type === "milestone" ? mergedConfig.value.columnWidth / 2 : mergedConfig.value.columnWidth,
        taskDurationDays(actualStart, actualEnd) * mergedConfig.value.columnWidth
      )
    : layout.width
  const rowTop = layout.top - mergedConfig.value.headerHeight
  const { actualTop } = barVerticalMetrics()
  const top = displayTask.type === "milestone"
    ? scrollTop.value
    : rowTop + (displayTask.type === "summary" ? actualTop + 1 : actualTop)
  const height = displayTask.type === "milestone"
    ? viewportHeight.value
    : displayTask.type === "summary" ? 8 : ACTUAL_BAR_HEIGHT
  return {
    transform: `translate(${left}px, ${top}px)`,
    width: displayTask.type === "milestone" ? "0px" : `${width}px`,
    height: `${height}px`,
    "--bar-color": actualTaskColor(displayTask),
    "--overdue-color": "#dc2626"
  }
}

function planBarStyle(layout: TaskLayout, task: GanttTask) {
  const displayTask = previewTask(task)
  const start = toDate(displayTask.plan.start)
  const end = toDate(displayTask.plan.end)
  const dayWidth = mergedConfig.value.columnWidth
  const left = Math.round((start.getTime() - timelineStart.value.getTime()) / 86400000) * dayWidth
  const width = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1) * dayWidth
  const rowTop = layout.top - mergedConfig.value.headerHeight
  const { planTop } = barVerticalMetrics()
  const planColor = displayTask.planColor || defaultPlanColor()

  return {
    transform: `translate(${left}px, ${rowTop + planTop}px)`,
    width: `${width}px`,
    height: `${PLAN_BAR_HEIGHT}px`,
    "--bar-color": planColor,
    "--plan-color-fade": "10%",
    "--plan-border-fade": "0%",
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
    borderRadius: left <= 0 ? "999px" : "0 999px 999px 0"
  }
}

function planPreviewLayout(task: GanttTask): Pick<TaskLayout, "left" | "width"> {
  const displayTask = previewTask(task)
  const dayWidth = mergedConfig.value.columnWidth
  const start = toDate(displayTask.plan.start)
  const end = toDate(displayTask.plan.end)
  return {
    left: Math.round((start.getTime() - timelineStart.value.getTime()) / 86400000) * dayWidth,
    width: Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1) * dayWidth
  }
}

function planLinkLayout(layout: TaskLayout, task: GanttTask): TaskLayout {
  return { ...layout, ...planPreviewLayout(task) }
}

function previewTask(task: GanttTask): GanttTask {
  return applyPreviewPatchToTask(task)
}

function applyPreviewPatchToTask(task: GanttTask): GanttTask {
  const preview = dragPreview.value
  const patch = preview?.taskId === task.id
    ? preview.patch
    : preview?.affected?.[task.id]
  if (!patch) {
    return task
  }
  return {
    ...task,
    plan: {
      ...task.plan,
      start: patch.planStart ?? task.plan.start,
      end: patch.planEnd ?? task.plan.end
    },
    actual: {
      ...task.actual,
      start: patch.actualStart ?? task.actual.start,
      end: patch.actualEnd ?? task.actual.end,
      progress: patch.progress ?? task.actual.progress
    }
  }
}

function markerGroupStyle(date: string, color?: string) {
  const dayOffset = (toDate(date).getTime() - timelineStart.value.getTime()) / (24 * 60 * 60 * 1000)
  const left = (dayOffset + 0.5) * mergedConfig.value.columnWidth
  return { transform: `translateX(${left}px)`, "--marker-color": color || "#d97706" }
}

function markerItemStyle(index: number, color?: string) {
  return {
    top: `${8 + index * 30}px`,
    "--marker-color": color || "#d97706"
  }
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

function shouldIgnoreBarMove(event: PointerEvent, mode: "move" | "start" | "end"): boolean {
  const isSecondaryButton = Number.isFinite(event.button) && event.button > 0
  if (isSecondaryButton || mode !== "move") {
    return isSecondaryButton
  }
  const target = event.target as Element | null
  return Boolean(target?.closest(".gantt-resize, .gantt-plan-resize, .gantt-link-handle"))
}

function beginDrag(event: PointerEvent, task: GanttTask, mode: "move" | "start" | "end") {
  if (shouldIgnoreBarMove(event, mode)) {
    return
  }
  if (mergedConfig.value.editable === false || mergedConfig.value.editableActual === false) {
    return
  }
  if (draggingTask.value) {
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
  event.preventDefault()
  event.stopPropagation()

  const startX = event.clientX
  const columnWidth = mergedConfig.value.columnWidth
  const originalStart = toDate(task.actual.start)
  const originalEnd = toDate(task.actual.end)
  const target = event.currentTarget as HTMLElement
  const previewElement = target.closest(".gantt-bar") as HTMLElement | null
  if (!previewElement || !layoutById.value.has(task.id)) {
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
    const patch = buildDragPatch(task, mode, originalStart, originalEnd, pendingDeltaDays)
    dragPreview.value = { taskId: task.id, patch }
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
    target.removeEventListener("pointercancel", onCancel)
    previewElement.classList.remove("dragging")
    draggingTask.value = false

    if (deltaDays === 0) {
      dragPreview.value = null
      return
    }

    const patch = buildDragPatch(task, mode, originalStart, originalEnd, deltaDays)
    emit("taskChange", task.id, patch)
    dragPreview.value = null
  }

  const onCancel = () => {
    if (previewFrame) {
      window.cancelAnimationFrame(previewFrame)
      previewFrame = 0
    }
    target.removeEventListener("pointermove", onMove)
    target.removeEventListener("pointerup", onUp)
    target.removeEventListener("pointercancel", onCancel)
    previewElement.classList.remove("dragging")
    draggingTask.value = false
    dragPreview.value = null
  }

  target.addEventListener("pointermove", onMove)
  target.addEventListener("pointerup", onUp)
  target.addEventListener("pointercancel", onCancel)
}

function beginPlanDrag(event: PointerEvent, task: GanttTask, mode: "move" | "start" | "end") {
  if (shouldIgnoreBarMove(event, mode)) {
    return
  }
  if (mergedConfig.value.editable === false || mergedConfig.value.editablePlan !== true) {
    return
  }
  if (draggingTask.value) {
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
  event.preventDefault()
  event.stopPropagation()

  const startX = event.clientX
  const columnWidth = mergedConfig.value.columnWidth
  const originalStart = toDate(task.plan.start)
  const originalEnd = toDate(task.plan.end)
  const target = event.currentTarget as HTMLElement
  const previewElement = target.closest(".gantt-plan-bar") as HTMLElement | null
  const rowLayout = layoutById.value.get(task.id)
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
    const patch = clampPlanPatchByDependencies(
      task,
      buildPlanDragPatch(task, mode, originalStart, originalEnd, pendingDeltaDays),
      mode
    )
    const affected = computePlanDependencyPatches(task.id, patch)
    dragPreview.value = { taskId: task.id, patch, affected }
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
    target.removeEventListener("pointercancel", onCancel)
    previewElement.classList.remove("dragging")
    draggingTask.value = false

    if (deltaDays === 0) {
      dragPreview.value = null
      return
    }

    const patch = clampPlanPatchByDependencies(
      task,
      buildPlanDragPatch(task, mode, originalStart, originalEnd, deltaDays),
      mode
    )
    const affected = computePlanDependencyPatches(task.id, patch)
    emit("taskChange", task.id, patch)
    for (const [taskId, affectedPatch] of Object.entries(affected)) {
      emit("taskChange", taskId, affectedPatch)
    }
    dragPreview.value = null
  }

  const onCancel = () => {
    if (previewFrame) {
      window.cancelAnimationFrame(previewFrame)
      previewFrame = 0
    }
    target.removeEventListener("pointermove", onMove)
    target.removeEventListener("pointerup", onUp)
    target.removeEventListener("pointercancel", onCancel)
    previewElement.classList.remove("dragging")
    draggingTask.value = false
    dragPreview.value = null
  }

  target.addEventListener("pointermove", onMove)
  target.addEventListener("pointerup", onUp)
  target.addEventListener("pointercancel", onCancel)
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
  const { planTop } = barVerticalMetrics()
  const start = layout
    ? taskAnchorPoint(planLinkLayout(layout, task), sourceAnchor, mergedConfig.value.headerHeight, planTop, PLAN_BAR_HEIGHT)
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
  if (!draft) {
    return
  }
  if (draft.sourceId === task.id) {
    rejectLink("self", draft.sourceId, task.id)
    clearLinkDraft()
    return
  }
  if (task.type === "milestone" || task.type === "summary") {
    clearLinkDraft()
    return
  }
  if (normalizedLinks.value.some((link) =>
    link.sourceId === draft.sourceId && link.targetId === task.id
  )) {
    rejectLink("duplicate", draft.sourceId, task.id)
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
  const nextLinks = normalizeLinks(dependencyTasks.value, [...normalizedLinks.value, nextLink])
  if (nextLinks.some((link) => link.id === nextLink.id)) {
    emit("linkChange", nextLinks)
  } else {
    rejectLink("cycle", draft.sourceId, task.id)
  }
  clearLinkDraft()
}

function linkTypeFromAnchors(sourceAnchor: LinkAnchor, targetAnchor: LinkAnchor): GanttLink["type"] {
  if (sourceAnchor === "start" && targetAnchor === "start") return "SS"
  if (sourceAnchor === "start" && targetAnchor === "finish") return "SF"
  if (sourceAnchor === "finish" && targetAnchor === "finish") return "FF"
  return "FS"
}

function planDependencyLockedDate(source: GanttTask, link: GanttLink): Date {
  const lag = link.lag ?? 0
  if (link.type === "FS") {
    return addDays(source.plan.end, lag + 1)
  }
  if (link.type === "SS") {
    return addDays(source.plan.start, lag)
  }
  if (link.type === "FF") {
    return addDays(source.plan.end, lag)
  }
  return addDays(source.plan.start, lag)
}

function clampPlanPatchByDependencies(
  task: GanttTask,
  patch: PatchTask,
  mode: "move" | "start" | "end",
  incoming = normalizedLinks.value.filter((link) => link.targetId === task.id),
  byId = taskById.value
): PatchTask {
  if (!incoming.length) {
    return patch
  }

  let start = toDate(patch.planStart ?? task.plan.start)
  let end = toDate(patch.planEnd ?? task.plan.end)
  const span = Math.max(0, Math.round((toDate(task.plan.end).getTime() - toDate(task.plan.start).getTime()) / 86400000))
  let startLocked = false
  let endLocked = false

  for (const link of incoming) {
    const source = byId.get(link.sourceId)
    if (!source) {
      continue
    }
    const locked = planDependencyLockedDate(source, link)
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

  if (startLocked && mode === "move") {
    end = addDays(start, task.type === "milestone" ? 0 : span)
  }
  if (endLocked && mode === "move") {
    start = task.type === "milestone" ? end : addDays(end, -span)
  }
  if (task.type !== "milestone" && end.getTime() < start.getTime()) {
    if (mode === "end") {
      start = end
    } else {
      end = start
    }
  }

  return {
    ...patch,
    ...("planStart" in patch || startLocked ? { planStart: start } : {}),
    ...("planEnd" in patch || endLocked ? { planEnd: end } : {})
  }
}

function computePlanDependencyPatches(taskId: string, patch: PatchTask): Record<string, PatchTask> {
  if (mergedConfig.value.autoSchedule === false) {
    return {}
  }
  const originalById = new Map(baseDisplayedTasks.value.map((task) => [task.id, task]))
  const scheduledById = new Map(baseDisplayedTasks.value.map((task) => [task.id, {
    ...task,
    plan: { ...task.plan },
    actual: { ...task.actual }
  }]))
  const sourceTask = scheduledById.get(taskId)
  if (!sourceTask) {
    return {}
  }
  sourceTask.plan = {
    ...sourceTask.plan,
    start: patch.planStart ?? sourceTask.plan.start,
    end: patch.planEnd ?? sourceTask.plan.end
  }

  for (let pass = 0; pass < scheduledById.size; pass += 1) {
    let changed = false
    for (const link of normalizedLinks.value) {
      const source = scheduledById.get(link.sourceId)
      const target = scheduledById.get(link.targetId)
      if (!source || !target || target.schedulingMode === "manual") {
        continue
      }
      const span = Math.max(0, Math.round(
        (toDate(target.plan.end).getTime() - toDate(target.plan.start).getTime()) / 86400000
      ))
      const locked = planDependencyLockedDate(source, link)
      let nextStart = toDate(target.plan.start)
      let nextEnd = toDate(target.plan.end)

      if (link.type === "FS" || link.type === "SS") {
        if (nextStart.getTime() < locked.getTime()) {
          nextStart = locked
          nextEnd = addDays(locked, target.type === "milestone" ? 0 : span)
        }
      } else if (nextEnd.getTime() < locked.getTime()) {
        nextEnd = locked
        nextStart = target.type === "milestone" ? locked : addDays(locked, -span)
      }

      if (
        nextStart.getTime() !== toDate(target.plan.start).getTime()
        || nextEnd.getTime() !== toDate(target.plan.end).getTime()
      ) {
        target.plan = { ...target.plan, start: nextStart, end: nextEnd }
        changed = true
      }
    }
    if (!changed) {
      break
    }
  }

  const affected: Record<string, PatchTask> = {}
  for (const [id, task] of scheduledById) {
    if (id === taskId) {
      continue
    }
    const original = originalById.get(id)
    if (
      original
      && (
        toDate(original.plan.start).getTime() !== toDate(task.plan.start).getTime()
        || toDate(original.plan.end).getTime() !== toDate(task.plan.end).getTime()
      )
    ) {
      affected[id] = { planStart: task.plan.start, planEnd: task.plan.end }
    }
  }
  return affected
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
    const candidateStart = addDays(originalStart, deltaDays)
    const nextStart = candidateStart.getTime() > originalEnd.getTime() ? originalEnd : candidateStart
    return { actualStart: nextStart, actualEnd: task.type === "milestone" ? nextStart : originalEnd }
  }

  const candidateEnd = addDays(originalEnd, deltaDays)
  return { actualEnd: candidateEnd.getTime() < originalStart.getTime() ? originalStart : candidateEnd }
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
    const candidateStart = addDays(originalStart, deltaDays)
    const nextStart = candidateStart.getTime() > originalEnd.getTime() ? originalEnd : candidateStart
    return { planStart: nextStart, planEnd: task.type === "milestone" ? nextStart : originalEnd }
  }

  const candidateEnd = addDays(originalEnd, deltaDays)
  return { planEnd: candidateEnd.getTime() < originalStart.getTime() ? originalStart : candidateEnd }
}

function defaultTaskColor(type: GanttTask["type"]) {
  if (type === "summary") return mergedConfig.value.taskColors?.summary ?? "#475467"
  if (type === "milestone") return mergedConfig.value.taskColors?.milestone ?? "#d97706"
  return mergedConfig.value.taskColors?.task ?? "#2563eb"
}

function defaultPlanColor() {
  return mergedConfig.value.taskColors?.plan ?? "#cbd5e1"
}

function actualTaskColor(task: GanttTask) {
  return task.color || defaultTaskColor(task.type)
}

function progressColor() {
  return mergedConfig.value.taskColors?.progress ?? "#0f766e"
}

function clampProgress(value: number) {
  return Math.min(100, Math.max(0, Number(value) || 0))
}
</script>

<template>
  <section ref="chartRef" class="gantt-chart" :style="{ width: chartWidth, height: chartHeight }">
    <div
      v-if="linkNotice && mergedConfig.showLinkRejectionNotice !== false"
      class="gantt-link-notice"
      role="alert"
    >
      <span>!</span>
      {{ linkNotice.message }}
    </div>
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
          <div
            class="gantt-table-head"
            :style="{
              height: `${mergedConfig.headerHeight}px`,
              width: `${tableContentWidth}px`,
              gridTemplateColumns: tableGridTemplate
            }"
          >
            <span
              v-for="column in tableColumns"
              :key="column.key"
              :style="{ justifyContent: column.align === 'left' ? 'flex-start' : column.align === 'right' ? 'flex-end' : 'center' }"
            >
              <slot :name="`header-${column.key}`" :column="column">
                <slot name="header" :column="column">{{ column.label }}</slot>
              </slot>
            </span>
          </div>
          <div class="gantt-table-body" :style="{ width: `${tableContentWidth}px` }">
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
              :style="{
                height: `${mergedConfig.rowHeight}px`,
                gridTemplateColumns: tableGridTemplate
              }"
              @mouseenter="showTaskDetails($event, flat.task, 'table')"
              @mousemove="moveTaskDetails"
              @mouseleave="hideTaskDetails"
              @click="selectedTaskId = flat.task.id"
              @dblclick="openEditor(flat.task)"
            >
              <span
                v-for="column in tableColumns"
                :key="column.key"
                :class="[
                  columnCellClass(column, previewTask(flat.task)),
                  column.key === 'progress' ? taskStatus(previewTask(flat.task)).className : '',
                  {
                    'gantt-name': column.key === 'name',
                    child: column.key === 'name' && flat.depth > 0,
                    'gantt-status-cell': column.key === 'status',
                    'gantt-owner-cell': column.key === 'owner',
                    'gantt-date-cell': ['planStart', 'planEnd', 'actualStart', 'actualEnd'].includes(column.key),
                    'gantt-progress-cell': column.key === 'progress'
                  }
                ]"
                :style="[
                  columnCellStyle(column, previewTask(flat.task)),
                  column.key === 'name' ? { paddingLeft: `${12 + flat.depth * 18}px` } : {}
                ]"
                :title="column.key === 'owner' ? taskOwner(flat.task) || '未分配' : undefined"
              >
                <slot
                  :name="`cell-${column.key}`"
                  :task="previewTask(flat.task)"
                  :column="column"
                  :value="columnValue(column, flat.task)"
                  :row-index="flat.rowIndex"
                >
                  <slot
                    name="cell"
                    :task="previewTask(flat.task)"
                    :column="column"
                    :value="columnValue(column, flat.task)"
                    :row-index="flat.rowIndex"
                  >
                    <template v-if="column.key === 'name'">
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
                    </template>
                    <span v-else-if="column.key === 'status'" class="gantt-status" :class="taskStatus(previewTask(flat.task)).className">
                      {{ taskStatus(previewTask(flat.task)).label }}
                    </span>
                    <template v-else-if="column.key === 'owner'">
                      <i v-if="taskOwner(flat.task)" class="gantt-owner" :style="ownerStyle(flat.task)">
                        {{ ownerInitial(flat.task) }}
                      </i>
                      <small v-else>—</small>
                    </template>
                    <template v-else-if="column.key === 'progress'">
                      <i><em :style="{ width: `${previewTask(flat.task).actual.progress}%` }"></em></i>
                      <b>{{ previewTask(flat.task).actual.progress }}%</b>
                    </template>
                    <template v-else-if="column.key === 'planStart'">{{ shortDate(previewTask(flat.task).plan.start) }}</template>
                    <template v-else-if="column.key === 'planEnd'">{{ shortDate(previewTask(flat.task).plan.end) }}</template>
                    <template v-else-if="column.key === 'actualStart'">{{ shortDate(previewTask(flat.task).actual.start) }}</template>
                    <template v-else-if="column.key === 'actualEnd'">{{ shortDate(previewTask(flat.task).actual.end) }}</template>
                    <template v-else>{{ columnValue(column, flat.task) }}</template>
                  </slot>
                </slot>
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
            </div>
          </div>

          <div class="gantt-marker-badge-layer" aria-label="里程碑">
            <div
              v-for="group in groupedMarkers"
              :key="`badge-${group.date}`"
              class="gantt-marker-badge-group"
              :style="markerGroupStyle(group.date, group.color)"
            >
              <button
                v-for="(marker, markerIndex) in group.markers"
                :key="marker.id"
                type="button"
                class="gantt-marker"
                :style="markerItemStyle(markerIndex, marker.color)"
                :aria-label="`${marker.name}，${formatDate(marker.date)}`"
                @dblclick.stop="openMarkerEditor(marker)"
              >
                <span class="gantt-marker-name">{{ marker.name }}</span>
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
              v-for="(flat, rowOffset) in visibleRows"
              :key="`timeline-row-${flat.task.id}`"
              class="gantt-timeline-row"
              :class="{ selected: flat.task.id === selectedTaskId }"
              :data-task-id="flat.task.id"
              :style="{
                height: `${mergedConfig.rowHeight}px`,
                transform: `translateY(${(visibleWindow.start + rowOffset) * mergedConfig.rowHeight}px)`
              }"
              @click.stop="selectedTaskId = flat.task.id"
            ></div>
            <div
              v-if="mergedConfig.showPlanBar !== false"
              v-for="layout in renderedLayouts"
              :key="`plan-${layout.taskId}`"
              class="gantt-plan-bar"
              :class="[
                taskById.get(layout.taskId)?.type,
                {
                  editable: mergedConfig.editable !== false && mergedConfig.editablePlan === true && taskById.get(layout.taskId)?.type !== 'summary',
                  locked: mergedConfig.editable === false || mergedConfig.editablePlan !== true || taskById.get(layout.taskId)?.type === 'summary'
                }
              ]"
              :style="planBarStyle(layout, taskById.get(layout.taskId)!)"
              @mouseenter="showTaskDetails($event, taskById.get(layout.taskId)!, 'plan')"
              @mousemove="moveTaskDetails"
              @pointerdown="beginPlanDrag($event, taskById.get(layout.taskId)!, 'move')"
              @pointerup.stop="finishLink(taskById.get(layout.taskId)!, 'start')"
              @click.stop="selectedTaskId = layout.taskId"
              @dblclick.stop="openEditor(taskById.get(layout.taskId)!)"
            >
              <span class="gantt-plan-progress" :style="{ width: `${taskById.get(layout.taskId)?.actual.progress ?? 0}%` }"></span>
              <button
                v-if="mergedConfig.enableLinkCreation !== false && taskById.get(layout.taskId)?.type === 'task'"
                class="gantt-link-handle in"
                type="button"
                aria-label="从计划开始时间创建任务依赖"
                @pointerdown.stop="beginLink($event, taskById.get(layout.taskId)!, 'start')"
                @pointerup.stop="finishLink(taskById.get(layout.taskId)!, 'start')"
              ></button>
              <button
                v-if="mergedConfig.enableLinkCreation !== false && taskById.get(layout.taskId)?.type === 'task'"
                class="gantt-link-handle out"
                type="button"
                aria-label="从计划结束时间创建任务依赖"
                @pointerdown.stop="beginLink($event, taskById.get(layout.taskId)!, 'finish')"
                @pointerup.stop="finishLink(taskById.get(layout.taskId)!, 'finish')"
              ></button>
              <button v-if="taskById.get(layout.taskId)?.type !== 'summary'" class="gantt-plan-resize start" type="button" aria-label="调整计划开始时间" @pointerdown.stop="beginPlanDrag($event, taskById.get(layout.taskId)!, 'start')" />
              <button v-if="taskById.get(layout.taskId)?.type !== 'summary'" class="gantt-plan-resize end" type="button" aria-label="调整计划结束时间" @pointerdown.stop="beginPlanDrag($event, taskById.get(layout.taskId)!, 'end')" />
            </div>
            <div
              v-if="mergedConfig.showActualBar !== false"
              v-for="layout in renderedLayouts"
              :key="layout.taskId"
              class="gantt-bar"
              :class="[
                taskById.get(layout.taskId)?.type,
                {
                  overdue: isOverdue(previewTask(taskById.get(layout.taskId)!)),
                  editable: mergedConfig.editable !== false && mergedConfig.editableActual !== false && taskById.get(layout.taskId)?.type !== 'summary',
                  locked: mergedConfig.editable === false || mergedConfig.editableActual === false || taskById.get(layout.taskId)?.type === 'summary'
                }
              ]"
              :style="taskStyle(layout, taskById.get(layout.taskId)!)"
              @mouseenter="showTaskDetails($event, taskById.get(layout.taskId)!, 'timeline')"
              @mousemove="moveTaskDetails"
              @pointerdown="beginDrag($event, taskById.get(layout.taskId)!, 'move')"
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
                <span class="gantt-overdue-segment" :style="overdueSegmentStyle(previewTask(taskById.get(layout.taskId)!))"></span>
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

    <template v-if="editorOpen">
      <slot
        name="task-editor"
        :mode="editMode"
        :draft="editDraft"
        :fields="resolvedEditorFields"
        :save="saveEditor"
        :close="closeEditor"
        :remove="deleteSelectedTask"
      >
    <div class="gantt-editor-backdrop gantt-task-drawer-backdrop" @click="closeEditor"></div>
    <aside class="gantt-editor gantt-task-drawer" aria-label="任务编辑">
      <header>
        <div>
          <span>{{ editMode === "create" ? "创建" : "编辑" }}</span>
          <strong>{{ editDraft.type === "milestone" ? "里程碑" : editDraft.type === "summary" ? "阶段" : "任务" }}</strong>
        </div>
        <button type="button" aria-label="关闭" @click="closeEditor">×</button>
      </header>

      <label v-if="editorFieldVisible('name')">
        名称
        <input v-model.trim="editDraft.name" type="text" maxlength="80" :readonly="!editorFieldEditable('name')">
      </label>

      <label v-if="editorFieldVisible('type')">
        类型
        <GanttSelect
          :model-value="editDraft.type"
          :options="taskTypeOptions"
          :disabled="!editorFieldEditable('type')"
          aria-label="任务类型"
          @update:model-value="setTaskType"
        />
      </label>

      <label v-if="editorFieldVisible('parentId')">
        父级阶段
        <GanttSelect
          :model-value="editDraft.parentId"
          :options="parentSelectOptions"
          :disabled="!editorFieldEditable('parentId')"
          aria-label="父级阶段"
          @update:model-value="setParentId"
        />
      </label>

      <div class="gantt-editor-grid">
        <label v-if="editorFieldVisible('planStart')">
          计划开始
          <GanttDatePicker
            v-model="editDraft.planStart"
            :readonly="!editorFieldEditable('planStart')"
            aria-label="计划开始"
          />
        </label>
        <label v-if="editorFieldVisible('planEnd')">
          计划完成
          <GanttDatePicker
            v-model="editDraft.planEnd"
            :disabled="editDraft.type === 'milestone'"
            :readonly="!editorFieldEditable('planEnd')"
            aria-label="计划完成"
          />
        </label>
      </div>

      <div class="gantt-editor-grid">
        <label v-if="editorFieldVisible('actualStart')">
          实际开始
          <GanttDatePicker
            v-model="editDraft.actualStart"
            :readonly="!editorFieldEditable('actualStart')"
            aria-label="实际开始"
          />
        </label>
        <label v-if="editorFieldVisible('actualEnd')">
          实际完成
          <GanttDatePicker
            v-model="editDraft.actualEnd"
            :disabled="editDraft.type === 'milestone'"
            :readonly="!editorFieldEditable('actualEnd')"
            aria-label="实际完成"
          />
        </label>
      </div>

      <label v-if="editorFieldVisible('progress')">
        进度
        <input v-model.number="editDraft.progress" type="number" min="0" max="100" :readonly="!editorFieldEditable('progress')">
      </label>

      <label v-if="editorFieldVisible('resources')">
        负责人
        <input v-model="editDraft.resources" type="text" placeholder="多人请使用逗号分隔" :readonly="!editorFieldEditable('resources')">
      </label>

      <div class="gantt-editor-grid">
        <label v-if="editorFieldVisible('duration')">
          工期
          <input v-model.number="editDraft.duration" type="number" min="0" :readonly="!editorFieldEditable('duration')">
        </label>
        <label v-if="editorFieldVisible('calendarId')">
          日历 ID
          <input v-model="editDraft.calendarId" type="text" :readonly="!editorFieldEditable('calendarId')">
        </label>
      </div>

      <label v-if="editorFieldVisible('schedulingMode')">
        排程方式
        <GanttSelect
          :model-value="editDraft.schedulingMode"
          :options="schedulingModeOptions"
          :disabled="!editorFieldEditable('schedulingMode')"
          aria-label="排程方式"
          @update:model-value="setSchedulingMode"
        />
      </label>

      <label
        v-for="column in customEditorColumns"
        :key="column.key"
        :class="{ 'gantt-editor-readonly': column.editable !== true }"
      >
        {{ column.label }}
        <slot
          :name="`editor-field-${column.key}`"
          :field="column"
          :draft="editDraft"
          :value="editDraft.custom[column.key]"
        >
        <GanttSelect
          v-if="column.type === 'select'"
          :model-value="(editDraft.custom[column.key] as string | number) ?? ''"
          :options="column.options ?? []"
          :disabled="column.editable !== true"
          :aria-label="column.label"
          @update:model-value="setCustomEditorValue(column.key, $event)"
        />
        <input
          v-else
          v-model="editDraft.custom[column.key]"
          :type="customEditorInputType(column)"
          :placeholder="column.placeholder"
          :readonly="column.editable !== true"
        >
        </slot>
      </label>

      <div v-if="editorFieldVisible('color')" class="gantt-editor-field">
        <span>实际条颜色</span>
        <div class="gantt-color-palette" :class="{ disabled: !editorFieldEditable('color') }">
          <button
            v-for="color in editorColorOptions"
            :key="color"
            type="button"
            class="gantt-color-swatch"
            :class="{ selected: editDraft.color.toLowerCase() === color }"
            :style="{ '--swatch-color': color }"
            :aria-label="`选择颜色 ${color}`"
            :aria-pressed="editDraft.color.toLowerCase() === color"
            :disabled="!editorFieldEditable('color')"
            @click="editDraft.color = color"
          >
            <span>✓</span>
          </button>
          <label
            class="gantt-color-custom"
            :class="{ selected: !editorColorOptions.includes(editDraft.color.toLowerCase()) }"
            aria-label="自定义颜色"
          >
            <input v-model="editDraft.color" type="color" :disabled="!editorFieldEditable('color')">
          </label>
        </div>
      </div>

      <div v-if="editorFieldVisible('planColor')" class="gantt-editor-field">
        <span>计划条颜色</span>
        <div class="gantt-color-palette" :class="{ disabled: !editorFieldEditable('planColor') }">
          <button
            v-for="color in editorColorOptions"
            :key="color"
            type="button"
            class="gantt-color-swatch"
            :class="{ selected: editDraft.planColor.toLowerCase() === color }"
            :style="{ '--swatch-color': color }"
            :aria-label="`选择计划条颜色 ${color}`"
            :aria-pressed="editDraft.planColor.toLowerCase() === color"
            :disabled="!editorFieldEditable('planColor')"
            @click="editDraft.planColor = color"
          >
            <span>✓</span>
          </button>
          <label
            class="gantt-color-custom"
            :class="{
              selected: Boolean(editDraft.planColor)
                && !editorColorOptions.includes(editDraft.planColor.toLowerCase())
            }"
            aria-label="自定义计划条颜色"
          >
            <input
              type="color"
              :value="editDraft.planColor || defaultPlanColor()"
              :disabled="!editorFieldEditable('planColor')"
              @input="editDraft.planColor = ($event.target as HTMLInputElement).value"
            >
          </label>
        </div>
      </div>

      <slot
        name="editor-footer"
        :mode="editMode"
        :draft="editDraft"
        :save="saveEditor"
        :close="closeEditor"
        :remove="deleteSelectedTask"
      >
      <footer>
        <button v-if="editMode === 'edit'" type="button" class="danger" @click="deleteSelectedTask">删除</button>
        <span></span>
        <button type="button" @click="closeEditor">取消</button>
        <button type="button" class="primary" @click="saveEditor">保存</button>
      </footer>
      </slot>
    </aside>
      </slot>
    </template>

    <template v-if="markerEditorOpen">
      <slot
        name="marker-editor"
        :mode="markerEditMode"
        :draft="markerDraft"
        :save="saveMarker"
        :close="closeMarkerEditor"
        :remove="deleteMarker"
      >
    <div class="gantt-editor-backdrop gantt-marker-editor-backdrop" @click="closeMarkerEditor"></div>
    <aside class="gantt-editor gantt-marker-editor" aria-label="里程碑编辑">
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
        <GanttDatePicker v-model="markerDraft.date" aria-label="里程碑日期" />
      </label>

      <div class="gantt-editor-field">
        <span>颜色</span>
        <div class="gantt-color-palette">
          <button
            v-for="color in editorColorOptions"
            :key="color"
            type="button"
            class="gantt-color-swatch"
            :class="{ selected: markerDraft.color.toLowerCase() === color }"
            :style="{ '--swatch-color': color }"
            :aria-label="`选择颜色 ${color}`"
            :aria-pressed="markerDraft.color.toLowerCase() === color"
            @click="markerDraft.color = color"
          >
            <span>✓</span>
          </button>
          <label
            class="gantt-color-custom"
            :class="{ selected: !editorColorOptions.includes(markerDraft.color.toLowerCase()) }"
            aria-label="自定义颜色"
          >
            <input v-model="markerDraft.color" type="color">
          </label>
        </div>
      </div>

      <footer>
        <button v-if="markerEditMode === 'edit'" type="button" class="danger" @click="deleteMarker">删除</button>
        <span></span>
        <button type="button" @click="closeMarkerEditor">取消</button>
        <button type="button" class="primary" @click="saveMarker">保存</button>
      </footer>
    </aside>
      </slot>
    </template>

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
        <GanttSelect
          :model-value="linkEditDraft.type"
          :options="linkTypeOptions"
          aria-label="依赖类型"
          @update:model-value="setLinkType"
        />
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
          <GanttSelect
            :model-value="linkEditDraft.lagUnit"
            :options="lagUnitOptions"
            aria-label="间隔单位"
            @update:model-value="setLagUnit"
          />
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
