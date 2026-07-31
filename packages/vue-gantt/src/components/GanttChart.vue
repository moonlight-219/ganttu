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
} from "ct-gantt-core"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import GanttDatePicker from "./GanttDatePicker.vue"
import GanttSelect from "./GanttSelect.vue"
import GanttDialog from "./GanttDialog.vue"
import { drawGrid } from "../rendering/canvas/grid"
import { buildOrthogonalLinkPath, taskAnchorPoint, type LinkAnchor } from "../rendering/canvas/links"
import { setupCanvas } from "../rendering/canvas/viewport"
import type {
  GanttLinkRejection,
  GanttExportImageOptions,
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
}>()

const viewOptions: Array<{ mode: ViewMode; label: string }> = [
  { mode: "day", label: "周/日" },
  { mode: "week", label: "年/周" },
  { mode: "month", label: "年/月" },
  { mode: "quarter", label: "年/季度" }
]
const PLAN_BAR_HEIGHT = 12
const ACTUAL_BAR_HEIGHT = 14
const BAR_VERTICAL_GAP = 8
const MIN_TABLE_COLUMN_WIDTH = 48
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
const isFullscreen = ref(false)
const exportingImage = ref(false)
const viewportSize = ref({ width: 0, height: 0 })
let stopSplitterResize: (() => void) | null = null
let linkDraftFrame = 0
let pendingLinkDraftPoint: { x: number; y: number } | null = null
let resizeObserver: ResizeObserver | null = null
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
const tableColumnWidths = computed(() => {
  const baseColumns = tableColumns.value.map((column) => ({
    column,
    width: Math.max(MIN_TABLE_COLUMN_WIDTH, column.width ?? 100)
  }))
  const baseWidth = baseColumns.reduce((width, item) => width + item.width, 0)
  const availableWidth = Math.max(0, taskListWidth.value)
  if (!baseColumns.length || baseWidth >= availableWidth) return baseColumns

  const extraWidth = availableWidth - baseWidth
  let distributedWidth = 0
  return baseColumns.map((item, index) => {
    const addedWidth = index === baseColumns.length - 1
      ? extraWidth - distributedWidth
      : Math.floor(extraWidth * (item.width / baseWidth))
    distributedWidth += addedWidth
    return {
      column: item.column,
      width: item.width + addedWidth
    }
  })
})
const tableGridTemplate = computed(() => tableColumnWidths.value
  .map(({ width }) => `${width}px`)
  .join(" "))
const tableContentWidth = computed(() => tableColumnWidths.value
  .reduce((width, item) => width + item.width, 0))
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
  // 拖拽中范围只扩不缩：在原始范围上叠加预览日期，避免拖动途中时间轴两端被提前裁剪
  const preview = dragPreview.value
  if (preview) {
    for (const id of [preview.taskId, ...Object.keys(preview.affected ?? {})]) {
      const task = taskById.value.get(id)
      if (task) {
        dates.push(
          toDate(task.plan.start),
          toDate(task.plan.end),
          toDate(task.actual.start),
          toDate(task.actual.end)
        )
      }
    }
  }
  if (!dates.length) {
    const today = toDate(new Date())
    return padDateRangeToViewport({ start: today, end: addDays(today, 30) })
  }

  return padDateRangeToViewport({
    start: new Date(Math.min(...dates.map((date) => date.getTime()))),
    end: new Date(Math.max(...dates.map((date) => date.getTime())))
  })
})
// 数据跨度不足以铺满视口宽度时，向右补足日期列，避免时间轴右侧出现无表头无网格的留白
function padDateRangeToViewport(range: { start: Date; end: Date }): { start: Date; end: Date } {
  if (mergedConfig.value.fitTimelineToViewport === false) {
    return range
  }
  const viewportWidth = viewportSize.value.width
  const columnWidth = mergedConfig.value.columnWidth
  if (viewportWidth <= 0 || columnWidth <= 0) {
    return range
  }
  const spanDays = Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1
  const requiredDays = Math.ceil(viewportWidth / columnWidth)
  if (spanDays >= requiredDays) {
    return range
  }
  return { start: range.start, end: addDays(range.start, requiredDays - 1) }
}
const scale = computed<TimeScale[]>(() => computeTimeScale(
  dateRange.value.start,
  dateRange.value.end,
  mergedConfig.value.viewMode,
  mergedConfig.value.columnWidth,
  mergedConfig.value.firstDayOfWeek
))
const totalWidth = computed(() => scale.value.reduce((sum, tick) => sum + tick.width, 0))
const totalHeight = computed(() => {
  const bodyHeight = flatTasks.value.length
    ? Math.max(flatTasks.value.length * mergedConfig.value.rowHeight, viewportHeight.value)
    : mergedConfig.value.showTimelineWhenEmpty
      ? viewportHeight.value
      : 0
  return mergedConfig.value.headerHeight + bodyHeight
})
const viewportHeight = computed(() => {
  const fallbackHeight = Number.isFinite(Number.parseFloat(chartHeight.value)) ? Number.parseFloat(chartHeight.value) : 0
    const measuredHeight = viewportSize.value.height
    || timelineRef.value?.clientHeight
    || tableRef.value?.clientHeight
    || fallbackHeight
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
  if (mergedConfig.value.viewMode !== "day") {
    return []
  }
  return scale.value
    .filter((tick) => tick.start.getDay() === 0 || tick.start.getDay() === 6)
    .map((tick) => ({
      date: formatDate(tick.start),
      left: tick.left,
      width: tick.width
    }))
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
const renderTasks = computed<GanttTask[]>(() => dependencyTasks.value.map((task) => ({
  ...task,
  dependencies: []
})))
const renderLayoutConfig = computed<GanttConfig>(() => ({
  ...layoutConfig.value,
  autoSchedule: false
}))
const layoutResult = computed(() => computeLayout(
  renderTasks.value,
  [],
  renderLayoutConfig.value,
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
const shouldShowEmptyTimeline = computed(() => !props.tasks.length && mergedConfig.value.showTimelineWhenEmpty === true)

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
  if (mergedConfig.value.showPlanBar === false) {
    return []
  }
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

// 拖拽预览把时间轴向左扩展时，timelineStart 前移会使所有内容坐标整体右移，
// 需同步补偿滚动位置，避免视口内容跳动、被拖拽条钉在最左端不跟手
watch(timelineStart, (next, prev) => {
  if (!draggingTask.value || !timelineRef.value) {
    return
  }
  const shiftPx = Math.round((prev.getTime() - next.getTime()) / 86400000) * mergedConfig.value.columnWidth
  if (!shiftPx) {
    return
  }
  const timeline = timelineRef.value
  timeline.scrollLeft += shiftPx
  scrollLeft.value = timeline.scrollLeft
}, { flush: "post" })

onMounted(() => {
  drawCanvas()
  updateViewportSize()
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      updateViewportSize()
      nextTick(drawCanvas)
    })
    if (chartRef.value) {
      resizeObserver.observe(chartRef.value)
    }
    if (timelineRef.value) {
      resizeObserver.observe(timelineRef.value)
    }
    if (tableRef.value) {
      resizeObserver.observe(tableRef.value)
    }
  }
  document.addEventListener("fullscreenchange", syncFullscreenState)
})

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", syncFullscreenState)
  resizeObserver?.disconnect()
  resizeObserver = null
  stopSplitterResize?.()
  clearTaskDetailsTimer()
  if (linkNoticeTimer) {
    window.clearTimeout(linkNoticeTimer)
  }
  if (linkDraftFrame) {
    window.cancelAnimationFrame(linkDraftFrame)
  }
})

function syncFullscreenState() {
  isFullscreen.value = document.fullscreenElement === fullscreenElement()
  requestAnimationFrame(() => {
    updateViewportSize()
    drawCanvas()
  })
}

function updateViewportSize() {
  const chart = chartRef.value
  const timeline = timelineRef.value
  const table = tableRef.value
  viewportSize.value = {
    width: timeline?.clientWidth ?? chart?.clientWidth ?? 0,
    height: timeline?.clientHeight ?? table?.clientHeight ?? chart?.clientHeight ?? 0
  }
}

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

function horizontalEdgeScroll(clientX: number): boolean {
  const timeline = timelineRef.value
  if (!timeline) {
    return false
  }
  const rect = timeline.getBoundingClientRect()
  if (rect.width <= 0) {
    return false
  }
  const edgeSize = 56
  const maxStep = Math.max(4, Math.min(18, mergedConfig.value.columnWidth / 2))
  let nextScrollLeft = timeline.scrollLeft

  if (clientX < rect.left + edgeSize) {
    const ratio = Math.min(1, Math.max(0, (rect.left + edgeSize - clientX) / edgeSize))
    nextScrollLeft = Math.max(0, timeline.scrollLeft - Math.ceil(maxStep * ratio))
  } else if (clientX > rect.right - edgeSize) {
    const ratio = Math.min(1, Math.max(0, (clientX - (rect.right - edgeSize)) / edgeSize))
    const maxScrollLeft = Math.max(0, timeline.scrollWidth - timeline.clientWidth)
    nextScrollLeft = Math.min(maxScrollLeft, timeline.scrollLeft + Math.ceil(maxStep * ratio))
  }

  if (nextScrollLeft === timeline.scrollLeft) {
    return false
  }
  timeline.scrollLeft = nextScrollLeft
  scrollLeft.value = nextScrollLeft
  return true
}

function isNearTimelineHorizontalEdge(clientX: number): boolean {
  const rect = timelineRef.value?.getBoundingClientRect()
  if (!rect) {
    return false
  }
  if (rect.width <= 0) {
    return false
  }
  const edgeSize = 56
  return clientX < rect.left + edgeSize || clientX > rect.right - edgeSize
}

// 滚动已到头时的虚拟推进量：指针停在边缘仍能持续移动任务条，驱动时间轴继续扩展
function horizontalEdgeNudge(clientX: number): number {
  const rect = timelineRef.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0) {
    return 0
  }
  const edgeSize = 56
  const maxStep = Math.max(4, Math.min(18, mergedConfig.value.columnWidth / 2))
  if (clientX < rect.left + edgeSize) {
    const ratio = Math.min(1, Math.max(0, (rect.left + edgeSize - clientX) / edgeSize))
    return -Math.ceil(maxStep * ratio)
  }
  if (clientX > rect.right - edgeSize) {
    const ratio = Math.min(1, Math.max(0, (clientX - (rect.right - edgeSize)) / edgeSize))
    return Math.ceil(maxStep * ratio)
  }
  return 0
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
  showDependencyNotice({ reason, sourceId, targetId, message })
}

function showDependencyNotice(rejection: GanttLinkRejection) {
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

function planPatchTime(task: GanttTask, patch: PatchTask, key: "planStart" | "planEnd") {
  const fallback = key === "planStart" ? task.plan.start : task.plan.end
  return toDate(patch[key] ?? fallback).getTime()
}

function didClampPlanPatch(task: GanttTask, requested: PatchTask, clamped: PatchTask) {
  return planPatchTime(task, requested, "planStart") !== planPatchTime(task, clamped, "planStart")
    || planPatchTime(task, requested, "planEnd") !== planPatchTime(task, clamped, "planEnd")
}

function hasPlanPatchChanged(task: GanttTask, patch: PatchTask) {
  return planPatchTime(task, {}, "planStart") !== planPatchTime(task, patch, "planStart")
    || planPatchTime(task, {}, "planEnd") !== planPatchTime(task, patch, "planEnd")
}

function notifyPlanDependencyConstraint(task: GanttTask, requested: PatchTask, clamped: PatchTask) {
  if (!didClampPlanPatch(task, requested, clamped)) {
    return
  }
  const incoming = normalizedLinks.value.filter((link) => link.targetId === task.id)
  const sourceId = incoming[0]?.sourceId ?? task.id
  const lockText = incoming[0] ? linkLockLabel(incoming[0].type) : "计划时间受到依赖关系限制"
  showDependencyNotice({
    reason: "constraint",
    sourceId,
    targetId: task.id,
    message: `${lockText}，已按依赖约束调整。`
  })
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

async function exportImage(options: GanttExportImageOptions = {}): Promise<string> {
  await nextTick()
  drawCanvas()

  const dataUrl = renderGanttCanvasImage(options)
  if (options.download !== false) {
    const type = options.type ?? "image/png"
    downloadDataUrl(dataUrl, options.filename ?? `gantt-${formatDate(new Date())}.${type === "image/jpeg" ? "jpg" : "png"}`)
  }
  return dataUrl
}

function renderGanttCanvasImage(options: GanttExportImageOptions = {}): string {
  const chart = chartRef.value
  const timeline = timelineRef.value
  const table = tableRef.value
  if (!chart) {
    throw new Error("Gantt chart is not mounted")
  }

  const rect = chart.getBoundingClientRect()
  const width = Math.max(1, Math.ceil(rect.width))
  const height = Math.max(1, Math.ceil(rect.height))
  const pixelRatio = Math.max(1, options.pixelRatio ?? window.devicePixelRatio ?? 1)
  const background = options.background ?? "#ffffff"
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.floor(width * pixelRatio))
  canvas.height = Math.max(1, Math.floor(height * pixelRatio))
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Canvas context is not available")
  }

  context.scale(pixelRatio, pixelRatio)
  context.fillStyle = background
  context.fillRect(0, 0, width, height)

  const toolbarHeight = Math.round(chart.querySelector<HTMLElement>(".gantt-toolbar")?.getBoundingClientRect().height ?? 0)
  const headerHeight = mergedConfig.value.headerHeight
  const rowHeight = mergedConfig.value.rowHeight
  const tableWidth = Math.min(taskListWidth.value, width)
  const splitterWidth = 8
  const timelineX = Math.min(width, tableWidth + splitterWidth)
  const timelineWidth = Math.max(1, timeline?.clientWidth ?? width - timelineX)
  const tableScrollLeft = table?.scrollLeft ?? 0

  drawExportToolbar(context, width, toolbarHeight)
  drawExportTable(context, tableWidth, toolbarHeight, headerHeight, rowHeight, tableScrollLeft)
  drawExportSplitter(context, tableWidth, toolbarHeight, splitterWidth, height - toolbarHeight)
  drawExportTimeline(context, timelineX, toolbarHeight, timelineWidth, height - toolbarHeight, headerHeight, rowHeight)

  return canvas.toDataURL(options.type ?? "image/png")
}

async function exportDomImage(options: GanttExportImageOptions = {}): Promise<string> {
  const chart = chartRef.value
  if (!chart) {
    throw new Error("Gantt chart is not mounted")
  }

  const rect = chart.getBoundingClientRect()
  const width = Math.max(1, Math.ceil(rect.width))
  const height = Math.max(1, Math.ceil(rect.height))
  const pixelRatio = Math.max(1, options.pixelRatio ?? window.devicePixelRatio ?? 1)
  const background = options.background ?? "#ffffff"
  const clone = chart.cloneNode(true) as HTMLElement
  clone.querySelectorAll(".gantt-editor-backdrop, .gantt-editor, .gantt-task-popover, .gantt-link-notice").forEach((node) => node.remove())
  replaceCanvasWithImages(chart, clone)
  clone.style.width = `${width}px`
  clone.style.height = `${height}px`
  clone.style.margin = "0"
  clone.style.transform = "none"

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width * pixelRatio}" height="${height * pixelRatio}" viewBox="0 0 ${width} ${height}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml">
      <style>${collectDocumentStyles()}</style>
      ${clone.outerHTML}
    </div>
  </foreignObject>
</svg>`
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }))
  try {
    const image = await loadImage(svgUrl)
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.floor(width * pixelRatio))
    canvas.height = Math.max(1, Math.floor(height * pixelRatio))
    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("Canvas context is not available")
    }
    context.fillStyle = background
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.scale(pixelRatio, pixelRatio)
    context.drawImage(image, 0, 0, width, height)
    const type = options.type ?? "image/png"
    const dataUrl = canvas.toDataURL(type)
    if (options.download !== false) {
      downloadDataUrl(dataUrl, options.filename ?? `gantt-${formatDate(new Date())}.${type === "image/jpeg" ? "jpg" : "png"}`)
    }
    return dataUrl
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

function drawExportToolbar(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, width, height)
  context.strokeStyle = "#e8edf3"
  context.beginPath()
  context.moveTo(0, height - 0.5)
  context.lineTo(width, height - 0.5)
  context.stroke()
  drawCanvasText(context, "项目甘特图", 14, height / 2 + 5, 700, "#182230", 180)
  drawCanvasText(context, `${flatTasks.value.length} 个任务`, 100, height / 2 + 5, 400, "#667085", 120)
}

function drawExportTable(
  context: CanvasRenderingContext2D,
  width: number,
  top: number,
  headerHeight: number,
  rowHeight: number,
  scrollLeftValue: number
) {
  context.save()
  clipCanvasRect(context, 0, top, width, Math.max(1, context.canvas.height))
  context.fillStyle = "#ffffff"
  context.fillRect(0, top, width, context.canvas.height)
  context.fillStyle = "#fbfcfe"
  context.fillRect(0, top, width, headerHeight)
  context.strokeStyle = "#e8edf3"
  context.beginPath()
  context.moveTo(0, top + headerHeight - 0.5)
  context.lineTo(width, top + headerHeight - 0.5)
  context.stroke()

  let cursor = -scrollLeftValue
  for (const { column, width: columnWidth } of tableColumnWidths.value) {
    if (cursor + columnWidth >= 0 && cursor <= width) {
      context.strokeStyle = "#eef2f7"
      context.strokeRect(cursor, top, columnWidth, headerHeight)
      drawCanvasText(context, column.label, cursor + 10, top + headerHeight / 2 + 4, 600, "#66758f", columnWidth - 20, column.align ?? "center")
    }
    cursor += columnWidth
  }

  visibleRows.value.forEach((flat) => {
    const rowY = top + headerHeight + flat.rowIndex * rowHeight - scrollTop.value
    if (rowY > context.canvas.height || rowY + rowHeight < top + headerHeight) return
    const task = previewTask(flat.task)
    context.fillStyle = flat.task.id === selectedTaskId.value ? "rgba(37, 99, 235, 0.09)" : flat.task.type === "summary" ? "#fbfcfe" : "#ffffff"
    context.fillRect(0, rowY, width, rowHeight)
    context.strokeStyle = "#edf1f6"
    context.beginPath()
    context.moveTo(0, rowY + rowHeight - 0.5)
    context.lineTo(width, rowY + rowHeight - 0.5)
    context.stroke()

    let cellX = -scrollLeftValue
    for (const { column, width: columnWidth } of tableColumnWidths.value) {
      if (cellX + columnWidth >= 0 && cellX <= width) {
        context.strokeStyle = "#eef2f7"
        context.beginPath()
        context.moveTo(cellX + columnWidth - 0.5, rowY)
        context.lineTo(cellX + columnWidth - 0.5, rowY + rowHeight)
        context.stroke()
        drawExportTableCell(context, column, task, flat.depth, cellX, rowY, columnWidth, rowHeight)
      }
      cellX += columnWidth
    }
  })
  context.restore()
}

function drawExportTableCell(
  context: CanvasRenderingContext2D,
  column: CustomColumn,
  task: GanttTask,
  depth: number,
  x: number,
  y: number,
  width: number,
  height: number
) {
  if (column.key === "name") {
    const textX = x + 12 + depth * 18
    context.fillStyle = task.type === "summary" ? "#111827" : "#2563eb"
    context.beginPath()
    context.arc(textX + 6, y + height / 2, task.type === "summary" ? 3 : 2.5, 0, Math.PI * 2)
    context.fill()
    drawCanvasText(context, task.name, textX + 18, y + height / 2 + 4, task.type === "summary" ? 700 : 500, "#1f3b66", width - (textX - x) - 24, "left")
    return
  }
  if (column.key === "progress") {
    const value = Math.max(0, Math.min(100, Number(task.actual.progress) || 0))
    const barWidth = Math.max(28, width - 32)
    const barX = x + 12
    const barY = y + height / 2 - 4
    drawRoundRect(context, barX, barY, barWidth, 8, 999, "#e9eef5")
    drawRoundRect(context, barX, barY, barWidth * value / 100, 8, 999, progressColor())
    drawCanvasText(context, `${value}%`, barX + barWidth + 4, y + height / 2 + 4, 600, "#475467", 34, "left")
    return
  }
  const text = ["planStart", "planEnd", "actualStart", "actualEnd"].includes(column.key)
    ? shortDate(String(columnValue(column, task)))
    : String(columnValue(column, task))
  drawCanvasText(context, text, x + 8, y + height / 2 + 4, task.type === "summary" ? 700 : 500, "#475467", width - 16, column.align ?? "center")
}

function drawExportSplitter(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  context.fillStyle = "#f8fafc"
  context.fillRect(x, y, width, height)
  context.strokeStyle = "#d7dde8"
  context.beginPath()
  context.moveTo(x + width - 0.5, y)
  context.lineTo(x + width - 0.5, y + height)
  context.stroke()
}

function drawExportTimeline(
  context: CanvasRenderingContext2D,
  x: number,
  top: number,
  width: number,
  height: number,
  headerHeight: number,
  rowHeight: number
) {
  context.save()
  clipCanvasRect(context, x, top, width, height)
  context.fillStyle = "#ffffff"
  context.fillRect(x, top, width, height)
  drawExportTimelineHeader(context, x, top, width, headerHeight)
  drawExportTimelineGrid(context, x, top + headerHeight, width, height - headerHeight, rowHeight)
  drawExportMarkers(context, x, top + headerHeight, width, height - headerHeight)
  drawExportBars(context, x, top, width, height, headerHeight)
  context.restore()
}

function drawExportTimelineHeader(context: CanvasRenderingContext2D, x: number, top: number, width: number, headerHeight: number) {
  context.fillStyle = "#ffffff"
  context.fillRect(x, top, width, headerHeight)
  context.strokeStyle = "#d7dde8"
  context.strokeRect(x, top, width, headerHeight)
  for (const header of topHeaders.value) {
    const left = x + header.left - scrollLeft.value
    if (left + header.width < x || left > x + width) continue
    context.strokeStyle = "#d7dde8"
    context.strokeRect(left, top, header.width, 24)
    drawCanvasText(context, header.label, left + 4, top + 16, 600, "#475467", header.width - 8, "center")
  }
  for (const tick of scale.value) {
    const left = x + tick.left - scrollLeft.value
    if (left + tick.width < x || left > x + width) continue
    if (mergedConfig.value.viewMode === "day" && (tick.start.getDay() === 0 || tick.start.getDay() === 6)) {
      context.fillStyle = "#eef1f5"
      context.fillRect(left, top + 24, tick.width, Math.max(0, headerHeight - 24))
    }
    context.strokeStyle = "#d7dde8"
    context.strokeRect(left, top + 24, tick.width, Math.max(0, headerHeight - 24))
    drawCanvasText(context, tickLabel(tick), left + 4, top + 42, 500, "#667085", tick.width - 8, "center")
  }
}

function drawExportTimelineGrid(context: CanvasRenderingContext2D, x: number, top: number, width: number, height: number, rowHeight: number) {
  const columnWidth = mergedConfig.value.columnWidth
  context.fillStyle = "#ffffff"
  context.fillRect(x, top, width, height)
  context.fillStyle = "rgba(248, 250, 252, 0.72)"
  for (let rowY = top - (scrollTop.value % (rowHeight * 2)); rowY < top + height; rowY += rowHeight * 2) {
    context.fillRect(x, rowY, width, rowHeight)
  }
  context.strokeStyle = "rgba(16, 24, 40, 0.09)"
  for (let rowY = top - (scrollTop.value % rowHeight); rowY < top + height; rowY += rowHeight) {
    context.beginPath()
    context.moveTo(x, rowY + 0.5)
    context.lineTo(x + width, rowY + 0.5)
    context.stroke()
  }
  context.strokeStyle = "rgba(37, 99, 235, 0.12)"
  for (let columnX = x - (scrollLeft.value % columnWidth); columnX < x + width; columnX += columnWidth) {
    context.beginPath()
    context.moveTo(columnX + 0.5, top)
    context.lineTo(columnX + 0.5, top + height)
    context.stroke()
  }
  if (mergedConfig.value.viewMode === "day") {
    context.fillStyle = "rgba(71, 84, 103, 0.11)"
    for (const weekend of weekendColumns.value) {
      const left = x + weekend.left - scrollLeft.value
      if (left + weekend.width < x || left > x + width) continue
      context.fillRect(left, top, weekend.width, height)
    }
  }
}

function drawExportMarkers(context: CanvasRenderingContext2D, x: number, top: number, width: number, height: number) {
  for (const group of groupedMarkers.value) {
    const markerX = x + ((toDate(group.date).getTime() - timelineStart.value.getTime()) / 86400000 + 0.5) * mergedConfig.value.columnWidth - scrollLeft.value
    if (markerX < x || markerX > x + width) continue
    context.strokeStyle = group.color || "#d97706"
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(markerX, top)
    context.lineTo(markerX, top + height)
    context.stroke()
    const label = group.markers[0]?.name ?? ""
    if (label) {
      const labelWidth = Math.min(120, Math.max(56, label.length * 14))
      drawRoundRect(context, markerX - 4, top + 8, labelWidth, 24, 4, group.color || "#d97706")
      drawCanvasText(context, label, markerX + 4, top + 24, 700, "#ffffff", labelWidth - 12, "left")
    }
  }
  context.lineWidth = 1
}

function drawExportBars(context: CanvasRenderingContext2D, x: number, top: number, width: number, height: number, headerHeight: number) {
  const { planTop, actualTop } = barVerticalMetrics()
  const bottom = top + height
  for (const layout of renderedLayouts.value) {
    const task = taskById.value.get(layout.taskId)
    if (!task || task.type === "milestone") continue
    const displayTask = previewTask(task)
    const rowY = top + layout.top - scrollTop.value
    if (rowY > bottom || rowY + mergedConfig.value.rowHeight < top + headerHeight) continue
    if (mergedConfig.value.showPlanBar !== false) {
      const plan = planPreviewLayout(displayTask)
      const planX = x + plan.left - scrollLeft.value
      const planY = rowY + planTop
      if (displayTask.type === "summary") {
        drawSummaryExportBar(context, planX, planY + 2, plan.width, 8, displayTask.planColor || defaultPlanColor(), true)
      } else {
        drawRoundRect(context, planX, planY, plan.width, PLAN_BAR_HEIGHT, 999, displayTask.planColor || defaultPlanColor())
        drawRoundRect(context, planX, planY, plan.width * Math.max(0, Math.min(100, displayTask.actual.progress)) / 100, PLAN_BAR_HEIGHT, 999, "rgba(20, 116, 112, 0.72)")
      }
    }
    if (mergedConfig.value.showActualBar !== false) {
      const actualX = x + layout.left - scrollLeft.value
      const actualY = rowY + (displayTask.type === "summary" ? actualTop + 1 : actualTop)
      const actualHeight = displayTask.type === "summary" ? 8 : ACTUAL_BAR_HEIGHT
      if (displayTask.type === "summary") {
        drawSummaryExportBar(context, actualX, actualY - 2, layout.width, 12, actualTaskColor(displayTask), false)
      } else {
        drawRoundRect(context, actualX, actualY, layout.width, actualHeight, 999, actualTaskColor(displayTask))
      }
      if (isOverdue(displayTask)) {
        const actualStart = toDate(displayTask.actual.start)
        const actualEnd = toDate(displayTask.actual.end)
        const overdueStart = new Date(Math.max(actualStart.getTime(), addDays(displayTask.plan.end, 1).getTime()))
        const totalDays = taskDurationDays(actualStart, actualEnd)
        const offsetDays = Math.max(0, Math.round((overdueStart.getTime() - actualStart.getTime()) / 86400000))
        const overdueX = actualX + Math.min(layout.width, layout.width * offsetDays / totalDays)
        if (displayTask.type === "summary") {
          drawSummaryExportOverdue(context, overdueX, actualY - 2, Math.max(0, actualX + layout.width - overdueX), 12)
        } else {
          drawRoundRect(context, overdueX, actualY, Math.max(0, actualX + layout.width - overdueX), actualHeight, 999, "#dc2626")
        }
      }
    }
  }
}

function drawSummaryExportOverdue(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  if (width <= 0) return
  drawRoundRect(context, x, y + height / 2 - 2, width, 4, 999, "#dc2626")
  drawRoundRect(context, x + width - 8, y, 8, height, 3, "#dc2626")
}

function drawSummaryExportBar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  isPlan: boolean
) {
  if (width <= 0) return
  if (isPlan) {
    drawRoundRect(context, x, y, width, Math.max(4, height - 2), 999, color)
  } else {
    drawRoundRect(context, x, y + height / 2 - 2, width, 4, 999, color)
  }
  const capWidth = isPlan ? 6 : 8
  drawRoundRect(context, x, y, capWidth, height, 3, color)
  drawRoundRect(context, x + width - capWidth, y, capWidth, height, 3, color)
}

function clipCanvasRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  context.beginPath()
  context.rect(x, y, width, height)
  context.clip()
}

function drawRoundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, color: string) {
  if (width <= 0 || height <= 0) return
  const r = Math.min(radius, width / 2, height / 2)
  context.fillStyle = color
  context.beginPath()
  context.moveTo(x + r, y)
  context.lineTo(x + width - r, y)
  context.quadraticCurveTo(x + width, y, x + width, y + r)
  context.lineTo(x + width, y + height - r)
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  context.lineTo(x + r, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - r)
  context.lineTo(x, y + r)
  context.quadraticCurveTo(x, y, x + r, y)
  context.fill()
}

function drawCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  weight: number,
  color: string,
  maxWidth: number,
  align: CanvasTextAlign = "left"
) {
  context.save()
  context.fillStyle = color
  context.font = `${weight} 12px "Microsoft YaHei", "Segoe UI", Arial, sans-serif`
  context.textAlign = align
  context.textBaseline = "alphabetic"
  const originX = align === "center" ? x + maxWidth / 2 : align === "right" ? x + maxWidth : x
  let output = text
  while (output.length > 1 && context.measureText(output).width > maxWidth) {
    output = `${output.slice(0, -2)}…`
  }
  context.fillText(output, originX, y)
  context.restore()
}

async function handleExportImage() {
  if (exportingImage.value) {
    return
  }
  exportingImage.value = true
  try {
    await exportImage()
  } catch (error) {
    console.error(error)
    window.alert("导出图片失败，请稍后重试或检查浏览器是否限制了图片下载。")
  } finally {
    exportingImage.value = false
  }
}

function replaceCanvasWithImages(source: HTMLElement, target: HTMLElement) {
  const sourceCanvases = Array.from(source.querySelectorAll("canvas"))
  const targetCanvases = Array.from(target.querySelectorAll("canvas"))
  targetCanvases.forEach((canvas, index) => {
    const sourceCanvas = sourceCanvases[index]
    if (!sourceCanvas) return
    const image = document.createElement("img")
    image.src = sourceCanvas.toDataURL("image/png")
    image.className = canvas.className
    image.setAttribute("style", canvas.getAttribute("style") ?? "")
    image.setAttribute("aria-hidden", "true")
    canvas.replaceWith(image)
  })
}

function collectDocumentStyles(): string {
  return Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n")
      } catch {
        return ""
      }
    })
    .join("\n")
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Failed to render gantt image"))
    image.src = src
  })
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a")
  link.href = dataUrl
  link.download = filename
  link.style.display = "none"
  document.body.appendChild(link)
  link.click()
  link.remove()
}

async function enterFullscreen() {
  const target = fullscreenElement()
  if (!target || !target.requestFullscreen) return
  await target.requestFullscreen()
}

async function exitFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen()
  }
}

async function toggleFullscreen() {
  if (document.fullscreenElement === fullscreenElement()) {
    await exitFullscreen()
  } else {
    await enterFullscreen()
  }
}

function fullscreenElement() {
  return chartRef.value?.closest<HTMLElement>("[data-gantt-fullscreen-root]") ?? chartRef.value
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
  const originalScrollLeft = scrollLeft.value
  const originalTimelineStart = timelineStart.value.getTime()
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
  let edgeScrollFrame = 0
  let pendingDeltaDays = 0
  let lastClientX = startX
  let edgeNudgePx = 0

  const computeDeltaDays = (clientX: number) =>
    Math.round((clientX - startX + scrollLeft.value - originalScrollLeft + edgeNudgePx) / columnWidth)
      + Math.round((timelineStart.value.getTime() - originalTimelineStart) / 86400000)

  const queuePreview = (deltaDays: number) => {
    if (deltaDays === lastDeltaDays) {
      return
    }
    lastDeltaDays = deltaDays
    pendingDeltaDays = deltaDays
    if (!previewFrame) {
      previewFrame = window.requestAnimationFrame(flushPreview)
    }
  }

  const tickEdgeScroll = () => {
    edgeScrollFrame = 0
    if (!horizontalEdgeScroll(lastClientX)) {
      edgeNudgePx += horizontalEdgeNudge(lastClientX)
    }
    queuePreview(computeDeltaDays(lastClientX))
    if (draggingTask.value && isNearTimelineHorizontalEdge(lastClientX)) {
      edgeScrollFrame = window.requestAnimationFrame(tickEdgeScroll)
    }
  }

  const ensureEdgeScroll = () => {
    if (!edgeScrollFrame && isNearTimelineHorizontalEdge(lastClientX)) {
      edgeScrollFrame = window.requestAnimationFrame(tickEdgeScroll)
    }
  }

  const flushPreview = () => {
    previewFrame = 0
    const patch = buildDragPatch(task, mode, originalStart, originalEnd, pendingDeltaDays)
    dragPreview.value = { taskId: task.id, patch }
  }

  const onMove = (moveEvent: PointerEvent) => {
    lastClientX = moveEvent.clientX
    horizontalEdgeScroll(lastClientX)
    queuePreview(computeDeltaDays(lastClientX))
    ensureEdgeScroll()
  }

  const onUp = (upEvent: PointerEvent) => {
    lastClientX = upEvent.clientX
    const deltaDays = computeDeltaDays(lastClientX)
    if (previewFrame) {
      window.cancelAnimationFrame(previewFrame)
      previewFrame = 0
    }
    if (edgeScrollFrame) {
      window.cancelAnimationFrame(edgeScrollFrame)
      edgeScrollFrame = 0
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
    if (edgeScrollFrame) {
      window.cancelAnimationFrame(edgeScrollFrame)
      edgeScrollFrame = 0
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
  const originalScrollLeft = scrollLeft.value
  const originalTimelineStart = timelineStart.value.getTime()
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
  let edgeScrollFrame = 0
  let pendingDeltaDays = 0
  let lastClientX = startX
  let edgeNudgePx = 0

  const computeDeltaDays = (clientX: number) =>
    Math.round((clientX - startX + scrollLeft.value - originalScrollLeft + edgeNudgePx) / columnWidth)
      + Math.round((timelineStart.value.getTime() - originalTimelineStart) / 86400000)

  const queuePreview = (deltaDays: number) => {
    if (deltaDays === lastDeltaDays) {
      return
    }
    lastDeltaDays = deltaDays
    pendingDeltaDays = deltaDays
    if (!previewFrame) {
      previewFrame = window.requestAnimationFrame(flushPreview)
    }
  }

  const tickEdgeScroll = () => {
    edgeScrollFrame = 0
    if (!horizontalEdgeScroll(lastClientX)) {
      edgeNudgePx += horizontalEdgeNudge(lastClientX)
    }
    queuePreview(computeDeltaDays(lastClientX))
    if (draggingTask.value && isNearTimelineHorizontalEdge(lastClientX)) {
      edgeScrollFrame = window.requestAnimationFrame(tickEdgeScroll)
    }
  }

  const ensureEdgeScroll = () => {
    if (!edgeScrollFrame && isNearTimelineHorizontalEdge(lastClientX)) {
      edgeScrollFrame = window.requestAnimationFrame(tickEdgeScroll)
    }
  }

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
    lastClientX = moveEvent.clientX
    horizontalEdgeScroll(lastClientX)
    queuePreview(computeDeltaDays(lastClientX))
    ensureEdgeScroll()
  }

  const onUp = (upEvent: PointerEvent) => {
    lastClientX = upEvent.clientX
    const deltaDays = computeDeltaDays(lastClientX)
    if (previewFrame) {
      window.cancelAnimationFrame(previewFrame)
      previewFrame = 0
    }
    if (edgeScrollFrame) {
      window.cancelAnimationFrame(edgeScrollFrame)
      edgeScrollFrame = 0
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

    const requestedPatch = buildPlanDragPatch(task, mode, originalStart, originalEnd, deltaDays)
    const patch = clampPlanPatchByDependencies(task, requestedPatch, mode)
    const affected = computePlanDependencyPatches(task.id, patch)
    notifyPlanDependencyConstraint(task, requestedPatch, patch)
    if (!hasPlanPatchChanged(task, patch) && !Object.keys(affected).length) {
      dragPreview.value = null
      return
    }
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
    if (edgeScrollFrame) {
      window.cancelAnimationFrame(edgeScrollFrame)
      edgeScrollFrame = 0
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
  if (
    mergedConfig.value.editable === false
    || mergedConfig.value.enableLinkCreation === false
    || mergedConfig.value.showPlanBar === false
    || task.type === "milestone"
    || task.type === "summary"
  ) {
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
  if (mergedConfig.value.showPlanBar === false) {
    clearLinkDraft()
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

defineExpose({
  exportImage,
  enterFullscreen,
  exitFullscreen,
  toggleFullscreen
})
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
    <div v-if="!tasks.length && !shouldShowEmptyTimeline" class="gantt-empty">暂无任务</div>
    <div v-else class="gantt-main" :class="{ 'empty-timeline': shouldShowEmptyTimeline }">
      <div v-if="!shouldShowEmptyTimeline" class="gantt-table" :style="{ width: `${taskListWidth}px` }">
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
        v-if="!shouldShowEmptyTimeline"
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
              :style="{ transform: `translateX(${weekend.left}px)`, width: `${weekend.width}px` }"
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

          <svg v-if="mergedConfig.showPlanBar !== false" class="gantt-link-layer" :style="{ top: `${mergedConfig.headerHeight}px`, width: `${totalWidth}px`, height: `${Math.max(1, totalHeight - mergedConfig.headerHeight)}px` }" aria-label="任务依赖关系">
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
              <span v-if="taskById.get(layout.taskId)?.type === 'summary'" class="gantt-summary-cap start"></span>
              <span v-if="taskById.get(layout.taskId)?.type === 'summary'" class="gantt-summary-cap end"></span>
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
                <span v-if="taskById.get(layout.taskId)?.type === 'summary'" class="gantt-summary-line"></span>
                <span v-if="taskById.get(layout.taskId)?.type === 'summary'" class="gantt-summary-cap start"></span>
                <span v-if="taskById.get(layout.taskId)?.type === 'summary'" class="gantt-summary-cap end"></span>
                <span v-if="taskById.get(layout.taskId)?.type === 'summary'" class="gantt-summary-overdue-line" :style="overdueSegmentStyle(previewTask(taskById.get(layout.taskId)!))"></span>
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
    <GanttDialog
      :open="editorOpen"
      mode="drawer"
      :title="editDraft.name || (editDraft.type === 'milestone' ? '里程碑' : editDraft.type === 'summary' ? '阶段' : '任务')"
      :subtitle="editMode === 'create' ? '创建' : '编辑'"
      :show-delete="editMode === 'edit'"
      delete-label="删除"
      aria-label="任务编辑"
      @close="closeEditor"
      @save="saveEditor"
      @delete="deleteSelectedTask"
    >
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
            :aria-label="`选择实际条颜色 ${color}`"
            :aria-pressed="editDraft.color.toLowerCase() === color"
            :disabled="!editorFieldEditable('color')"
            @click="editDraft.color = color"
          >
            <span>&#10003;</span>
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
            <span>&#10003;</span>
          </button>
          <label
            class="gantt-color-custom"
            :class="{ selected: Boolean(editDraft.planColor) && !editorColorOptions.includes(editDraft.planColor.toLowerCase()) }"
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
      <template #footer>
        <slot name="editor-footer" :mode="editMode" :draft="editDraft" :save="saveEditor" :close="closeEditor" :remove="deleteSelectedTask">
          <button v-if="editMode === 'edit'" type="button" class="danger" @click="deleteSelectedTask">删除</button>
          <span></span>
          <button type="button" @click="closeEditor">取消</button>
          <button type="button" class="primary" @click="saveEditor">保存</button>
        </slot>
      </template>
    </GanttDialog>
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
    <GanttDialog
      :open="markerEditorOpen"
      mode="modal"
      title="里程碑"
      :subtitle="markerEditMode === 'create' ? '创建' : '编辑'"
      :show-delete="markerEditMode === 'edit'"
      delete-label="删除"
      aria-label="里程碑编辑"
      @close="closeMarkerEditor"
      @save="saveMarker"
      @delete="deleteMarker"
    >
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
            <span>&#10003;</span>
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
    </GanttDialog>
      </slot>
    </template>

    <GanttDialog
      :open="linkEditorOpen"
      mode="modal"
      title="任务依赖"
      subtitle="编辑"
      show-delete
      delete-label="删除依赖"
      aria-label="任务依赖编辑"
      @close="closeLinkEditor"
      @save="saveLinkEditor"
      @delete="deleteLink"
    >
      <div class="gantt-link-editor-tasks">
        <b>{{ taskName(selectedLink?.sourceId ?? '') }}</b>
        <span class="gantt-link-editor-arrow">&rarr;</span>
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
            aria-label="依赖类型"
            @update:model-value="setLagUnit"
          />
        </label>
      </div>
    </GanttDialog>
  </section>
</template>

