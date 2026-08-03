<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue"
import GanttChart, {
  type GanttChartExpose,
  type GanttLinkRejection,
  type GanttMarkerEditRequest,
  type GanttTaskEditRequest
} from "ct-gantt-vue"
import "../../packages/vue-gantt/src/styles/gantt.css"
import type { CustomColumn, GanttConfig, GanttLink, GanttMarker, GanttTask, PatchTask } from "ct-gantt-core"
import { createLargeDataset } from "./demos/basic/data"

const defaultDemoColumns: CustomColumn[] = [
  { key: "name", label: "任务名称", width: 200, editable: true },
  { key: "owner", label: "负责人", width: 88, editable: true },
  { key: "planStart", label: "计划开始", width: 92, type: "date", editable: true },
  { key: "planEnd", label: "计划完成", width: 92, type: "date", editable: true },
  { key: "actualStart", label: "实际开始", width: 92, type: "date", editable: true },
  { key: "actualEnd", label: "实际完成", width: 92, type: "date", editable: true },
  { key: "progress", label: "进度", width: 92, type: "number", editable: true },
  {
    key: "priority",
    label: "优先级",
    width: 78,
    align: "center",
    type: "select",
    editable: true,
    options: [
      { label: "高", value: "high" },
      { label: "中", value: "medium" },
      { label: "低", value: "low" }
    ]
  },
  {
    key: "risk",
    label: "风险",
    width: 70,
    align: "center",
    type: "select",
    editable: true,
    options: [
      { label: "高", value: "高" },
      { label: "中", value: "中" },
      { label: "低", value: "低" }
    ]
  }
]

// Gantt 组件的 columnWidth 语义是"每天像素"（computeTimeScale 内部 width = diffDays × columnWidth）。
// 这里先按"目标每列宽度"声明，再统一换算成每天像素，避免 quarter/year 视图下列宽被放大几十倍导致日期标签跑出视野。
const DEMO_TARGET_COLUMN_WIDTHS: Record<NonNullable<GanttConfig["viewMode"]>, number> = {
  day: 30,
  week: 72,
  month: 34,
  quarter: 82,
  year: 120
}
const DEMO_DAYS_PER_UNIT: Record<NonNullable<GanttConfig["viewMode"]>, number> = {
  day: 1,
  week: 7,
  month: 30.4,   // 365 / 12
  quarter: 91.3, // 365 / 4
  year: 365
}
const demoColumnWidths = Object.fromEntries(
  (Object.keys(DEMO_TARGET_COLUMN_WIDTHS) as Array<NonNullable<GanttConfig["viewMode"]>>).map((mode) => [
    mode,
    DEMO_TARGET_COLUMN_WIDTHS[mode] / DEMO_DAYS_PER_UNIT[mode]
  ])
) as Record<NonNullable<GanttConfig["viewMode"]>, number>

const demoConfig = reactive<Partial<GanttConfig>>({
  viewMode: "month",
  rowHeight: 44,
  columnWidth: demoColumnWidths.month,
  headerHeight: 52,
  taskListWidth: 320,
  locale: "zh-CN",
  firstDayOfWeek: 1,
  dateFormat: "YYYY-MM-DD",
  columnWidths: demoColumnWidths,
  showPlanBar: true,
  showActualBar: true,
  showTimelineWhenEmpty: true,
  editable: true,
  editablePlan: true,
  editableActual: true,
  enableLinkCreation: true,
  showLinkRejectionNotice: true,
  virtualScroll: true,
  autoSchedule: true,
  taskColors: {
    task: "#2563eb",
    summary: "#475467",
    milestone: "#d97706",
    plan: "#cbd5e1",
    progress: "#0f766e"
  },
  columns: defaultDemoColumns.map((column) => ({ ...column })),
  editorFields: [
    { key: "name", label: "名称", editable: true },
    { key: "type", label: "类型", type: "select", editable: true },
    { key: "parentId", label: "父级阶段", type: "select", editable: true },
    { key: "planStart", label: "计划开始", type: "date", editable: true },
    { key: "planEnd", label: "计划完成", type: "date", editable: true },
    { key: "actualStart", label: "实际开始", type: "date", editable: true },
    { key: "actualEnd", label: "实际完成", type: "date", editable: true },
    { key: "progress", label: "进度", type: "number", editable: true },
    { key: "resources", label: "负责人", editable: true },
    { key: "schedulingMode", label: "依赖排程", visible: true, type: "select", editable: true },
    { key: "planColor", label: "计划条内部颜色", visible: true, editable: true },
    { key: "color", label: "实际条颜色", visible: true, editable: true },
    {
      key: "priority",
      label: "优先级",
      type: "select",
      editable: true,
      options: [
        { label: "高", value: "high" },
        { label: "中", value: "medium" },
        { label: "低", value: "low" }
      ]
    },
    { key: "risk", label: "风险", editable: true }
  ]
})

type DemoDataMode = "empty" | "five" | "basic" | "medium" | "large" | "huge" | "massive"

const demoAllTasks = ref<GanttTask[]>(createLargeDataset(100))
const demoDataMode = ref<DemoDataMode>("basic")
const demoGanttRef = ref<GanttChartExpose>()
const demoColumnPanelOpen = ref(false)
const demoLinks = ref<GanttLink[]>([
  { id: "demo-fs", sourceId: "group-1-module-1-task-1", targetId: "group-1-module-1-task-2", type: "FS", lag: 0, lagUnit: "calendar" },
  { id: "demo-ss", sourceId: "group-1-module-1-task-2", targetId: "group-1-module-1-task-3", type: "SS", lag: 1, lagUnit: "working" }
])
const demoMarkers = ref<GanttMarker[]>([
  { id: "review", name: "方案评审", date: "2026-07-10", color: "#d97706" },
  { id: "launch", name: "一期上线", date: "2026-09-01", color: "#dc2626" }
])

// ── 列宽自适应：根据数据时间跨度 + 视口宽度，自动调整"每天像素" ──
// 每个 viewMode 下每天像素的合理范围（推导自每列像素上下限 ÷ 该单位天数）
const DEMO_COLUMN_WIDTH_RANGE: Record<NonNullable<GanttConfig["viewMode"]>, { min: number; max: number }> = {
  day: { min: 22, max: 60 },        // 每列 22-60px
  week: { min: 4, max: 20 },         // 每列 28-140px
  month: { min: 0.6, max: 30 },      // 每列 18-912px
  quarter: { min: 0.2, max: 10 },    // 每列 18-913px
  year: { min: 0.05, max: 2.5 }      // 每列 18-912px
}

function measureTimelineViewportWidth(): number {
  const timeline = document.querySelector<HTMLElement>(".gantt-demo-hero .gantt-timeline")
  if (timeline?.clientWidth) {
    return timeline.clientWidth
  }
  // 估算：window - sidebar - 页面 padding - taskList - splitter
  const sidebar = window.innerWidth > 980 ? 238 : 0
  const padding = window.innerWidth > 980 ? 68 : 32
  return Math.max(600, window.innerWidth - sidebar - padding - (demoConfig.taskListWidth ?? 320) - 5)
}

function computeAdaptiveColumnWidth(viewMode: NonNullable<GanttConfig["viewMode"]>): number {
  const range = DEMO_COLUMN_WIDTH_RANGE[viewMode]
  let minTime = Infinity
  let maxTime = -Infinity
  for (const task of demoAllTasks.value) {
    for (const dateStr of [task.plan?.start, task.plan?.end, task.actual?.start, task.actual?.end]) {
      if (!dateStr) continue
      const t = new Date(dateStr).getTime()
      if (t < minTime) minTime = t
      if (t > maxTime) maxTime = t
    }
  }
  if (!isFinite(minTime) || !isFinite(maxTime)) {
    return (range.min + range.max) / 2
  }
  // 数据跨度（天数），至少 7 天避免除零/过小
  const spanDays = Math.max(7, Math.round((maxTime - minTime) / 86400000) + 1)
  const viewportWidth = measureTimelineViewportWidth()
  // 目标：timeline 总宽度 ≈ 视口的 1.2 倍（填满 + 一点滚动余地）
  const targetTotalWidth = viewportWidth * 1.2
  const ideal = targetTotalWidth / spanDays
  // 下限：至少填满视口（即使超过 range.max 也接受，避免小数据量时挤在左侧）
  const lowerBound = Math.max(range.min, viewportWidth / spanDays)
  return Math.max(lowerBound, Math.min(ideal, range.max))
}

function applyAdaptiveColumnWidth() {
  const viewMode = (demoConfig.viewMode ?? "month") as NonNullable<GanttConfig["viewMode"]>
  const width = computeAdaptiveColumnWidth(viewMode)
  demoColumnWidths[viewMode] = width
  // 触发响应式：替换整个 columnWidths 对象
  demoConfig.columnWidths = { ...demoColumnWidths }
  demoConfig.columnWidth = width
}

let adaptiveResizeTimer = 0
function onWindowResize() {
  window.clearTimeout(adaptiveResizeTimer)
  adaptiveResizeTimer = window.setTimeout(applyAdaptiveColumnWidth, 150)
}
const demoViewOptions: Array<{ mode: GanttConfig["viewMode"]; label: string }> = [
  { mode: "day", label: "周/日" },
  { mode: "week", label: "年/周" },
  { mode: "month", label: "年/月" },
  { mode: "quarter", label: "年/季度" }
]
const demoDatasets: Array<{ mode: DemoDataMode; label: string; count: number }> = [
  { mode: "empty", label: "空数据", count: 0 },
  { mode: "five", label: "5 条", count: 5 },
  { mode: "basic", label: "100 条", count: 100 },
  { mode: "medium", label: "1,000 条", count: 1000 },
  { mode: "large", label: "3,200 条", count: 3200 },
  { mode: "huge", label: "5,200 条", count: 5200 },
  { mode: "massive", label: "10,000 条", count: 10000 }
]
const demoColumnSettings = reactive(defaultDemoColumns.map((column) => ({
  key: column.key,
  label: column.label,
  visible: column.visible !== false,
  editable: column.editable !== false
})))
const demoColumnDrafts = reactive(defaultDemoColumns.map((column) => ({
  key: column.key,
  label: column.label,
  visible: column.visible !== false,
  editable: column.editable !== false
})))
async function saveDemoApi(resource: string, action: string, payload: unknown) {
  console.info(`[demo api] ${resource}.${action}`, payload)
  await Promise.resolve()
}

function mergeTaskPatch(task: GanttTask, patch: PatchTask): GanttTask {
  return {
    ...task,
    ...patch,
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
    },
    custom: patch.custom ? { ...task.custom, ...patch.custom } : task.custom
  }
}

async function handleTaskChange(id: string, patch: PatchTask) {
  demoAllTasks.value = demoAllTasks.value.map((task) =>
    task.id === id ? mergeTaskPatch(task, patch) : task
  )
  await saveDemoApi("task", "update", { id, patch })
}
async function handleTaskCreate(task: GanttTask) {
  demoAllTasks.value = [...demoAllTasks.value, task]
  await saveDemoApi("task", "create", task)
}

async function handleTaskDelete(id: string) {
  demoAllTasks.value = demoAllTasks.value.filter((t) => t.id !== id)
  await saveDemoApi("task", "delete", { id })
}

async function handleLinkChange(links: GanttLink[]) {
  demoLinks.value = links
  await saveDemoApi("link", "replaceAll", links)
}

async function handleMarkerCreate(marker: GanttMarker) {
  demoMarkers.value = [...demoMarkers.value, marker]
  await saveDemoApi("marker", "create", marker)
}

async function handleMarkerChange(id: string, marker: GanttMarker) {
  demoMarkers.value = demoMarkers.value.map((m) => (m.id === id ? marker : m))
  await saveDemoApi("marker", "update", { id, marker })
}

async function handleMarkerDelete(id: string) {
  demoMarkers.value = demoMarkers.value.filter((m) => m.id !== id)
  await saveDemoApi("marker", "delete", { id })
}

function useDemoDataset(mode: DemoDataMode, count: number) {
  demoDataMode.value = mode
  demoAllTasks.value = createLargeDataset(count)
  void nextTick(applyAdaptiveColumnWidth)
}

function togglePlanBar() {
  demoConfig.showPlanBar = !demoConfig.showPlanBar
  void saveDemoApi("config", "togglePlanBar", { showPlanBar: demoConfig.showPlanBar })
}

function toggleActualBar() {
  demoConfig.showActualBar = !demoConfig.showActualBar
  void saveDemoApi("config", "toggleActualBar", { showActualBar: demoConfig.showActualBar })
}

function syncDemoColumnDrafts() {
  for (const draft of demoColumnDrafts) {
    const setting = demoColumnSettings.find((item) => item.key === draft.key)
    draft.visible = setting?.visible ?? true
    draft.editable = setting?.editable ?? true
  }
}

function openDemoColumnPanel() {
  syncDemoColumnDrafts()
  demoColumnPanelOpen.value = true
}

function cancelDemoColumnPanel() {
  syncDemoColumnDrafts()
  demoColumnPanelOpen.value = false
}

function applyDemoColumns() {
  for (const setting of demoColumnSettings) {
    const draft = demoColumnDrafts.find((item) => item.key === setting.key)
    setting.visible = draft?.visible ?? true
    setting.editable = draft?.editable ?? true
  }
  demoConfig.columns = demoColumnSettings
    .map((setting) => {
      const source = defaultDemoColumns.find((column) => column.key === setting.key)!
      return { ...source, visible: setting.visible, editable: setting.editable }
    })
  demoColumnPanelOpen.value = false
  void saveDemoApi("config", "updateColumns", { columns: demoConfig.columns })
}

function updateDemoColumnVisible(key: string, checked: boolean) {
  const draft = demoColumnDrafts.find((item) => item.key === key)
  if (!draft) return
  draft.visible = checked
  if (!checked) {
    draft.editable = false
  }
}

function updateDemoColumnEditable(key: string, checked: boolean) {
  const draft = demoColumnDrafts.find((item) => item.key === key)
  if (!draft) return
  draft.editable = checked
  if (checked) {
    draft.visible = true
  }
}

function resetDemoColumns() {
  for (const draft of demoColumnDrafts) {
    const source = defaultDemoColumns.find((column) => column.key === draft.key)
    draft.visible = source?.visible !== false
    draft.editable = source?.editable !== false
  }
}

function setDemoViewMode(mode: GanttConfig["viewMode"]) {
  demoConfig.viewMode = mode
  void nextTick(applyAdaptiveColumnWidth)
  void saveDemoApi("view", "changeMode", { mode })
}

async function exportDemoImage() {
  await demoGanttRef.value?.exportImage({ filename: "vue-gantt-demo.png" })
}

async function toggleDemoFullscreen() {
  await demoGanttRef.value?.toggleFullscreen()
}

// 命令式引擎 API 演示：直接拿引擎实例做视口操作，不经 props/emit
function scrollDemoToToday() {
  demoGanttRef.value?.getEngine()?.scrollToDate(new Date())
}

function scrollDemoToFirstTask() {
  const first = demoAllTasks.value[0]
  if (first) {
    demoGanttRef.value?.getEngine()?.scrollToTask(first.id)
  }
}

function collapseAllDemo() {
  const engine = demoGanttRef.value?.getEngine()
  if (!engine) return
  const summaryIds = demoAllTasks.value.filter((t) => t.type === "summary").map((t) => t.id)
  engine.setCollapsed(summaryIds, true)
}

function expandAllDemo() {
  const engine = demoGanttRef.value?.getEngine()
  if (!engine) return
  engine.setCollapsed(engine.getCollapsedIds(), false)
}

function createDemoTask() {
  demoGanttRef.value?.openCreateTask("task")
}

function createDemoMarker() {
  demoGanttRef.value?.openCreateMarker()
}

function handleTaskEditRequest(request: GanttTaskEditRequest) {
  console.info("task-edit-request", request)
}

function handleMarkerEditRequest(request: GanttMarkerEditRequest) {
  console.info("marker-edit-request", request)
}

function handleLinkRejected(rejection: GanttLinkRejection) {
  console.warn("link-rejected", rejection.message)
}

const mobileNavOpen = ref(false)
const copiedKey = ref("")
const activePlaygroundPage = ref<"examples" | "docs">("examples")
const activeExampleCode = ref<"component" | "native" | "vue-native">("component")

function setPlaygroundPage(page: "examples" | "docs") {
  activePlaygroundPage.value = page
  mobileNavOpen.value = false
  window.scrollTo({ top: 0, behavior: "smooth" })
}

const navigation = [
  { id: "overview", label: "1.1 插件说明" },
  { id: "install", label: "1.2 引用插件" },
  { id: "container", label: "1.3 定义容器" },
  { id: "config", label: "1.4 定义参数" },
  { id: "data", label: "1.5 定义数据" },
  { id: "create", label: "1.6 创建甘特图" },
  { id: "props", label: "1.7 组件属性" },
  { id: "events", label: "1.8 事件说明" },
  { id: "slots", label: "1.9 插槽说明" },
  { id: "methods", label: "1.10 组件方法" },
  { id: "core", label: "1.11 Core API" },
  { id: "notes", label: "1.12 使用注意" }
]

// ---------- 代码示例语言切换 ----------
const codeLang = ref<"ts" | "js">("ts")
// 代码块高亮语言类名，随 codeLang 切换
const codeClass = computed(() => codeLang.value === "ts" ? "language-typescript" : "language-javascript")

const npmCodeTS = `// 1. 安装组件（项目需使用 Vue 3.5+）
pnpm add ct-gantt-vue

// 仅在需要直接调用布局、排程等 Core API 时额外安装
// pnpm add ct-gantt-core

// 2. 在入口文件（main.ts）或业务组件中引入样式
import "ct-gantt-vue/style.css"

// 3. 按需引入组件和所需类型
import GanttChart, {
  type GanttTask,          // 任务 / 阶段 / 里程碑数据结构
  type GanttLink,          // 任务依赖关系
  type GanttMarker,        // 时间轴里程碑
  type GanttConfig,        // 甘特图配置项
  type PatchTask,          // 变更事件回传的扁平更新对象
  type GanttChartExpose    // 组件 ref 暴露的方法类型
} from "ct-gantt-vue"`

const npmCodeJS = `// 1. 安装组件（项目需使用 Vue 3.5+）
pnpm add ct-gantt-vue

// 仅在需要直接调用布局、排程等 Core API 时额外安装
// pnpm add ct-gantt-core

// 2. 在入口文件（main.js）或业务组件中引入样式
import "ct-gantt-vue/style.css"

// 3. 引入组件（JS 中类型仅为 JSDoc 注释，不影响运行）
import GanttChart from "ct-gantt-vue"
// 如需类型提示，可使用 JSDoc：
// /** @type {import("ct-gantt-vue").GanttTask[]} */`

const npmCode = computed(() => codeLang.value === "ts" ? npmCodeTS : npmCodeJS)

const containerCode = `<template>
  <!-- width 和 height 也可以通过 config 传入 -->
  <div id="GanttChartDIV" class="gantt-doc-demo">
    <GanttChart
      :tasks="tasks"
      :links="links"
      :markers="markers"
      :config="ganttConfig"
      height="620px"
      @task-change="handleTaskChange"
      @link-change="handleLinkChange"
    />
  </div>
</template>`

const configCodeTS = `const ganttConfig: Partial<GanttConfig> = {
  // 以下配置均为可选；不传时会使用组件默认值
  // 甘特图基础设置
  viewMode: "day",                 // 时间刻度: day / week / month / quarter / year
  width: "100%",                   // 甘特图整体宽度
  height: "620px",                 // 高度支持数字像素或 px / % / vh 等 CSS 尺寸
  rowHeight: 48,                   // 左侧表格和右侧时间轴行高
  columnWidth: 34,                 // 右侧时间格宽度
  headerHeight: 52,                // 表头高度
  taskListWidth: 520,              // 左侧表格宽度

  // 展示与交互控制
  showPlanBar: true,               // 是否显示计划条
  showActualBar: true,             // 是否显示实际条
  showTimelineWhenEmpty: false,     // 数据为空时是否仍展示右侧日期轴和网格
  editablePlan: true,              // 计划条是否允许拖拽和拉伸
  editableActual: true,            // 实际条是否允许拖拽和拉伸
  enableLinkCreation: true,        // 是否允许创建任务依赖
  autoSchedule: true,              // 计划条拖拽时是否按依赖联动排程

  // 自定义左侧表格列
  columns: [
    { key: "name", label: "任务名称", width: 180, editable: true },
    { key: "owner", label: "负责人", width: 88, editable: true },
    { key: "planStart", label: "计划开始", width: 96, type: "date", editable: true },
    { key: "progress", label: "进度", width: 82, type: "number", editable: true },
    {
      key: "priority",
      label: "优先级",
      width: 78,
      align: "center",
      type: "select",
      editable: true,
      options: [
        { label: "高", value: "high" },
        { label: "中", value: "medium" },
        { label: "低", value: "low" }
      ]
    }
  ],

  // 控制内置任务抽屉字段
  editorFields: [
    { key: "name", label: "名称", editable: true },
    { key: "planStart", label: "计划开始", type: "date", editable: true },
    { key: "planEnd", label: "计划完成", type: "date", editable: true },
    { key: "actualStart", label: "实际开始", type: "date", editable: true },
    { key: "actualEnd", label: "实际完成", type: "date", editable: true },
    { key: "progress", label: "进度", type: "number", editable: true },
    { key: "resources", label: "负责人", editable: true },
    // playground 用于展示全部能力；业务项目只需开启实际会用到的高级字段。
    { key: "schedulingMode", label: "依赖排程", visible: true, type: "select", editable: true },
    { key: "planColor", label: "计划条内部颜色", visible: true, editable: true },
    { key: "color", label: "实际条颜色", visible: true, editable: true },
  ]
}`
// JS 版本仅去掉类型标注
const configCodeJS = configCodeTS.replace(": Partial<GanttConfig>", "")
const configCode = computed(() => codeLang.value === "ts" ? configCodeTS : configCodeJS)

const dataCodeTS = `const tasks = ref<GanttTask[]>([
  {
    id: "phase-1",                                      // 必填：唯一 ID
    name: "一期交付",                                   // 必填：名称
    type: "summary",                                    // 必填：task / summary / milestone
    plan: { start: "2026-07-01", end: "2026-07-16" },   // 必填：计划时间
    actual: { start: "2026-07-01", end: "2026-07-18", progress: 48 }, // 必填：实际时间和进度
    color: "#64748b",                                   // 可选：实际条颜色
    planColor: "#0f766e",                               // 可选：计划条内部进度颜色
    custom: { priority: "high", owner: "项目组" }        // 可选：业务自定义字段
  },
  {
    id: "task-1",
    parentId: "phase-1",                                // 可选：父级阶段 ID
    name: "需求确认",
    type: "task",
    plan: { start: "2026-07-01", end: "2026-07-05" },
    actual: { start: "2026-07-02", end: "2026-07-06", progress: 100 },
    resources: ["林晓"],
    color: "#2563eb",
    planColor: "#bfdbfe",
    custom: { priority: "high", owner: "林晓" }
  },
  {
    id: "task-2",
    parentId: "phase-1",
    name: "原型设计",
    type: "task",
    plan: { start: "2026-07-06", end: "2026-07-10" },
    actual: { start: "2026-07-07", end: "2026-07-11", progress: 60 },
    resources: ["周宁"],
    color: "#10b981",
    planColor: "#bbf7d0",
    custom: { priority: "medium", owner: "周宁" }
  }
])

const links = ref<GanttLink[]>([
  {
    id: "task-1-task-2",  // 必填：依赖 ID
    sourceId: "task-1",   // 必填：前置任务
    targetId: "task-2",   // 必填：后置任务
    type: "FS",           // 必填：FS / SS / FF / SF
    lag: 0,               // 可选：间隔天数
    lagUnit: "calendar"   // 可选：calendar / working
  }
])

const markers = ref<GanttMarker[]>([
  { id: "review", name: "方案评审", date: "2026-07-10", color: "#d97706" }
  // id/name/date 必填，color 可选
])`
// JS 版本：ref 去掉泛型
const dataCodeJS = dataCodeTS.replaceAll("ref<GanttTask[]>", "ref").replaceAll("ref<GanttLink[]>", "ref").replaceAll("ref<GanttMarker[]>", "ref")
const dataCode = computed(() => codeLang.value === "ts" ? dataCodeTS : dataCodeJS)

const createCodeTS = `<script setup lang="ts">
import { ref } from "vue"
import GanttChart, { type GanttTask, type PatchTask } from "ct-gantt-vue"
import "ct-gantt-vue/style.css"

const tasks = ref<GanttTask[]>([
  {
    id: "task-1",
    name: "需求确认",
    type: "task",
    plan: { start: "2026-08-03", end: "2026-08-07" },
    actual: { start: "2026-08-03", end: "2026-08-07", progress: 30 }
  }
])

// 组件使用受控数据流，需要将事件返回的 PatchTask 合并回任务数据。
function mergeTaskPatch(task: GanttTask, patch: PatchTask): GanttTask {
  const {
    planStart,
    planEnd,
    actualStart,
    actualEnd,
    progress,
    custom,
    ...taskFields
  } = patch

  return {
    ...task,
    ...taskFields,
    plan: {
      ...task.plan,
      start: planStart ?? task.plan.start,
      end: planEnd ?? task.plan.end
    },
    actual: {
      ...task.actual,
      start: actualStart ?? task.actual.start,
      end: actualEnd ?? task.actual.end,
      progress: progress ?? task.actual.progress
    },
    custom: custom ? { ...task.custom, ...custom } : task.custom
  }
}

function handleTaskChange(id: string, patch: PatchTask) {
  tasks.value = tasks.value.map((task) =>
    task.id === id ? mergeTaskPatch(task, patch) : task
  )
}
<\\/script>

<template>
  <GanttChart
    :tasks="tasks"
    height="620px"
    @task-change="handleTaskChange"
  />
</template>`.replace("<\\/script>", "</" + "script>")

// JS 版本：<script setup> 去掉 lang="ts" 和所有类型标注
const createCodeJS = createCodeTS
  .replace(` lang="ts"`, "")
  .replace(`import GanttChart, { type GanttTask, type PatchTask } from "ct-gantt-vue"`, `import GanttChart from "ct-gantt-vue"`)
  .replaceAll(`: GanttTask`, "")
  .replaceAll(`: PatchTask`, "")
  .replaceAll(`ref<GanttTask[]>`, `ref`)
const createCode = computed(() => codeLang.value === "ts" ? createCodeTS : createCodeJS)

const nativeCodeTS = `import {
  createGantt,
  type GanttTask
} from "ct-gantt-vue"
import "ct-gantt-vue/style.css"

// Vite 默认入口需要存在 <div id="app"></div>。
const app = document.querySelector<HTMLDivElement>("#app")
if (!app) throw new Error("缺少 #app 容器")
app.innerHTML = '<div id="gantt" style="width:100%;height:620px"></div>'

// 原生实例接收普通数组，不要求使用 Vue ref。
const tasks: GanttTask[] = [
  {
    id: "task-1",
    name: "需求确认",
    type: "task",
    plan: { start: "2026-08-03", end: "2026-08-07" },
    actual: { start: "2026-08-03", end: "2026-08-07", progress: 30 }
  }
]

// 容器必须已经存在；也可以直接传入 HTMLElement。
const gantt = createGantt("#gantt", {
  tasks,
  height: 620,
  // 拖拽、编辑完成后触发，可在这里持久化到服务端。
  onTaskChange(id, patch) {
    console.log("任务变更", id, patch)
  }
})

// 接口重新获取数据后，通过 setter 主动同步到实例。
gantt.setTasks(tasks)

// 离开页面前销毁，清理事件监听、观察器和动画。
window.addEventListener("beforeunload", () => gantt.destroy(), { once: true })`

const nativeCodeJS = nativeCodeTS
  .replace(`,\n  type GanttTask`, "")
  .replace(`: GanttTask[]`, "")
  .replace(`<HTMLDivElement>`, "")
const nativeCode = computed(() => codeLang.value === "ts" ? nativeCodeTS : nativeCodeJS)

const nativeVueCode = `<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import { createGantt, type GanttInstance, type GanttTask } from "ct-gantt-vue"
import "ct-gantt-vue/style.css"

// 原生实例需要一个真实 DOM 容器和一个实例引用。
const containerRef = ref<HTMLElement | null>(null)
const tasks = ref<GanttTask[]>([
  {
    id: "task-1",
    name: "需求确认",
    type: "task",
    plan: { start: "2026-08-03", end: "2026-08-07" },
    actual: { start: "2026-08-03", end: "2026-08-07", progress: 30 }
  }
])
let gantt: GanttInstance | null = null

// 必须等待 Vue 完成 DOM 挂载后再创建甘特图。
onMounted(() => {
  gantt = createGantt(containerRef.value!, { tasks: tasks.value, height: 620 })
})

// Vue 业务数据变化时，手动同步到原生实例。
watch(tasks, (value) => gantt?.setTasks(value), { deep: true })

// Vue 组件卸载时同时销毁甘特图实例。
onBeforeUnmount(() => gantt?.destroy())
<\/script>

<template>
  <div ref="containerRef" class="gantt-container"></div>
</template>

<style scoped>
.gantt-container {
  width: 100%;
  height: 620px;
}
</style>`.replace("<\/script>", "</" + "script>")

const nativeReactCode = `import { useEffect, useRef } from "react"
import { createGantt, type GanttInstance, type GanttTask } from "ct-gantt-vue"

export function NativeGantt({ tasks }: { tasks: GanttTask[] }) {
  // 分别保存 DOM 容器和甘特图实例。
  const containerRef = useRef<HTMLDivElement>(null)
  const ganttRef = useRef<GanttInstance | null>(null)

  // 首次挂载时创建；effect 清理函数负责销毁。
  useEffect(() => {
    ganttRef.current = createGantt(containerRef.current!, { tasks, height: 620 })
    return () => {
      ganttRef.current?.destroy()
      ganttRef.current = null
    }
  }, [])

  // React props 更新后，将最新任务同步到实例。
  useEffect(() => ganttRef.current?.setTasks(tasks), [tasks])
  return <div ref={containerRef} style={{ width: "100%", height: 620 }} />
}`

const featureDemoCode = `<script setup lang="ts">
import { reactive, ref } from "vue"
import GanttChart, {
  type GanttChartExpose,
  type GanttConfig,
  type GanttLink,
  type GanttMarker,
  type GanttTask,
  type PatchTask
} from "ct-gantt-vue"
import "ct-gantt-vue/style.css"

// 组件 ref 用于调用导出、全屏、滚动和新建弹窗等公开方法。
const ganttRef = ref<GanttChartExpose>()

// GanttChart 是受控组件，任务数据由业务侧持有。
const tasks = ref<GanttTask[]>([
  {
    id: "phase-1",
    name: "项目包 1",
    type: "summary",
    plan: { start: "2026-06-01", end: "2026-07-31" },
    actual: { start: "2026-06-01", end: "2026-07-31", progress: 45 }
  },
  {
    id: "task-1",
    parentId: "phase-1",
    name: "任务 1.1",
    type: "task",
    plan: { start: "2026-06-10", end: "2026-06-20" },
    actual: { start: "2026-06-12", end: "2026-06-24", progress: 70 }
  }
])

// links 表示计划条依赖，markers 表示时间轴固定里程碑。
const links = ref<GanttLink[]>([])
const markers = ref<GanttMarker[]>([
  { id: "review", name: "方案评审", date: "2026-07-10", color: "#d97706" }
])

// 所有配置均为可选；这里只展示完整功能演示需要的配置。
const config = reactive<Partial<GanttConfig>>({
  viewMode: "month",
  rowHeight: 44,
  taskListWidth: 320,
  showPlanBar: true,
  showActualBar: true,
  editablePlan: true,
  editableActual: true,
  enableLinkCreation: true,
  virtualScroll: true,
  autoSchedule: true
})

// 组件返回扁平 PatchTask，需要合并回 plan/actual 嵌套数据。
function handleTaskChange(id: string, patch: PatchTask) {
  tasks.value = tasks.value.map((task) => {
    if (task.id !== id) return task
    const { planStart, planEnd, actualStart, actualEnd, progress, ...fields } = patch
    return {
      ...task,
      ...fields,
      plan: {
        ...task.plan,
        start: planStart ?? task.plan.start,
        end: planEnd ?? task.plan.end
      },
      actual: {
        ...task.actual,
        start: actualStart ?? task.actual.start,
        end: actualEnd ?? task.actual.end,
        progress: progress ?? task.actual.progress
      }
    }
  })
}

// 通过组件 ref 调用命令式 API，不需要重新创建组件。
const exportImage = () => ganttRef.value?.exportImage({ filename: "project-gantt.png" })
const toggleFullscreen = () => ganttRef.value?.toggleFullscreen()
const scrollToToday = () => ganttRef.value?.getEngine()?.scrollToDate(new Date())
const createTask = () => ganttRef.value?.openCreateTask("task")
const createMarker = () => ganttRef.value?.openCreateMarker()
<\/script>

<template>
  <!-- 业务工具栏可以自由组合组件公开方法。 -->
  <div class="gantt-toolbar">
    <button type="button" @click="exportImage">导出图片</button>
    <button type="button" @click="toggleFullscreen">全屏</button>
    <button type="button" @click="scrollToToday">跳到今天</button>
    <button type="button" @click="createTask">新建任务</button>
    <button type="button" @click="createMarker">新建里程碑</button>
  </div>

  <!-- 创建、删除和编辑事件都需要更新业务侧数组。 -->
  <GanttChart
    ref="ganttRef"
    :tasks="tasks"
    :links="links"
    :markers="markers"
    :config="config"
    height="620px"
    @task-change="handleTaskChange"
    @task-create="tasks.push($event)"
    @task-delete="tasks = tasks.filter((task) => task.id !== $event)"
    @link-change="links = $event"
    @marker-create="markers.push($event)"
    @marker-change="(id, marker) => markers = markers.map((item) => item.id === id ? marker : item)"
    @marker-delete="markers = markers.filter((item) => item.id !== $event)"
  />
</template>

<style scoped>
/* 工具栏属于业务页面，可按项目设计系统自由替换。 */
.gantt-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.gantt-toolbar button {
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid #d5deec;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
</style>`.replace("<\/script>", "</" + "script>")

const featureDemoCodeJS = featureDemoCode
  .replace(` lang="ts"`, "")
  .replace(
    `import GanttChart, {
  type GanttChartExpose,
  type GanttConfig,
  type GanttLink,
  type GanttMarker,
  type GanttTask,
  type PatchTask
} from "ct-gantt-vue"`,
    `import GanttChart from "ct-gantt-vue"`
  )
  .replaceAll(`<GanttChartExpose>`, "")
  .replaceAll(`<GanttTask[]>`, "")
  .replaceAll(`<GanttLink[]>`, "")
  .replaceAll(`<GanttMarker[]>`, "")
  .replaceAll(`<Partial<GanttConfig>>`, "")
  .replace(`id: string, patch: PatchTask`, `id, patch`)

const nativeVueCodeJS = nativeVueCode
  .replace(` lang="ts"`, "")
  .replace(
    `import { createGantt, type GanttInstance, type GanttTask } from "ct-gantt-vue"`,
    `import { createGantt } from "ct-gantt-vue"`
  )
  .replaceAll(`<HTMLElement | null>`, "")
  .replaceAll(`<GanttTask[]>`, "")
  .replace(`let gantt: GanttInstance | null = null`, `let gantt = null`)
  .replace(`containerRef.value!`, `containerRef.value`)

const selectedExampleCode = computed(() => {
  if (activeExampleCode.value === "native") return codeLang.value === "ts" ? nativeCodeTS : nativeCodeJS
  if (activeExampleCode.value === "vue-native") return codeLang.value === "ts" ? nativeVueCode : nativeVueCodeJS
  return codeLang.value === "ts" ? featureDemoCode : featureDemoCodeJS
})

const customSlotCode = `<GanttChart :tasks="tasks" :config="{ columns }">
  <!-- 自定义左侧表格「优先级」列的展示 -->
  <template #cell-priority="{ value, task }">
    <PriorityTag :value="value" :task="task" />
  </template>

  <!-- 自定义任务抽屉中「优先级」字段的编辑控件 -->
  <template #editor-field-priority="{ draft, value }">
    <PrioritySelect
      :model-value="value"
      @update:model-value="draft.custom.priority = $event"
    />
  </template>
</GanttChart>`

const externalEditorCode = `<GanttChart
  :tasks="tasks"
  :config="{
    builtInTaskEditor: false,
    builtInMarkerEditor: false
  }"
  @task-edit-request="openTaskDrawer"
  @marker-edit-request="openMarkerDialog"
/>`

const exportImageCodeTS = `<script setup lang="ts">
import { ref } from "vue"
import GanttChart, { type GanttChartExpose, type GanttTask } from "ct-gantt-vue"
import "ct-gantt-vue/style.css"

const ganttRef = ref<GanttChartExpose>()
const tasks = ref<GanttTask[]>([
  {
    id: "task-1",
    name: "需求确认",
    type: "task",
    plan: { start: "2026-08-03", end: "2026-08-07" },
    actual: { start: "2026-08-03", end: "2026-08-07", progress: 30 }
  }
])

async function exportGanttImage() {
  await ganttRef.value?.exportImage({
    filename: "project-gantt.png",
    pixelRatio: 2
  })
}
<\\/script>

<template>
  <button type="button" @click="exportGanttImage">导出图片</button>
  <GanttChart ref="ganttRef" :tasks="tasks" height="620px" />
</template>`.replace("<\\/script>", "</" + "script>")

// JS 版本：去掉 lang="ts" 和 ref 泛型
const exportImageCodeJS = exportImageCodeTS
  .replace(` lang="ts"`, "")
  .replace(`import GanttChart, { type GanttChartExpose, type GanttTask } from "ct-gantt-vue"`, `import GanttChart from "ct-gantt-vue"`)
  .replaceAll(`<GanttChartExpose>`, "")
  .replaceAll(`<GanttTask[]>`, "")
const exportImageCode = computed(() => codeLang.value === "ts" ? exportImageCodeTS : exportImageCodeJS)

const propRows = [
  ["tasks", "GanttTask[]", "是", "任务、阶段、里程碑数据。"],
  ["links", "GanttLink[]", "否", "任务依赖数据，仅计划条参与依赖。"],
  ["markers", "GanttMarker[]", "否", "时间轴上的里程碑标识。"],
  ["config", "Partial<GanttConfig>", "否", "甘特图配置对象。"],
  ["width", "string | number", "否", "组件宽度，数字按 px，字符串支持 CSS 尺寸；优先级高于 config.width。"],
  ["height", "string | number", "否", "组件高度，数字按 px，字符串支持 px、%、vh 等；百分比要求父容器有明确高度。"],
  ["onTaskChange", "(id, patch) => void", "否", "task-change 的同名回调属性。"],
  ["onTaskCreate / onTaskDelete", "function", "否", "task-create / task-delete 的同名回调属性。"],
  ["onTaskEditRequest", "(request) => void", "否", "task-edit-request 的同名回调属性。"],
  ["onMarkerCreate / onMarkerChange / onMarkerDelete", "function", "否", "里程碑增删改事件的同名回调属性。"],
  ["onMarkerEditRequest", "(request) => void", "否", "marker-edit-request 的同名回调属性。"],
  ["onLinkChange / onLinkRejected", "function", "否", "依赖变更与拒绝事件的同名回调属性。"]
]

const configRows = [
  ["viewMode", "day | week | month | quarter | year", "month", "时间刻度。"],
  ["rowHeight", "number", "44", "行高。"],
  ["columnWidth", "number", "30", "右侧时间格宽度。"],
  ["columnWidths", "Partial<Record<ViewMode, number>>", "-", "按视图单独设置格子宽度。"],
  ["headerHeight", "number", "50", "表头高度。"],
  ["taskListWidth", "number", "280", "左侧表格宽度。"],
  ["width / height", "string | number", "100% / 620px", "数字按 px；字符串支持 px、%、vh、vw 等 CSS 尺寸，百分比高度依赖父容器高度。"],
  ["locale", "string", "zh-CN", "预留的本地化标识，当前不会改变界面文案。"],
  ["firstDayOfWeek", "0 | 1", "0", "周起始日，0 表示周日，1 表示周一。"],
  ["dateFormat", "string", "YYYY-MM-DD", "预留的日期格式，当前日期输入输出仍使用组件既有格式。"],
  ["theme", "light | dark | string", "-", "预留的主题标识，当前不会自动切换组件样式。"],
  ["visibleRange", "{ start; end }", "自动计算", "初始显示范围；边缘拖拽可向两端继续扩展。"],
  ["columns", "CustomColumn[]", "内置列", "完整替换左侧表格列，并同步对应编辑字段的显隐。"],
  ["customColumns", "CustomColumn[]", "[]", "在内置列后追加自定义列。"],
  ["editorFields", "GanttEditorField[]", "内置字段", "控制任务编辑抽屉字段；明确设置 visible 时优先于列配置。"],
  ["editable", "boolean", "true", "总编辑开关，关闭后任务条不可拖拽编辑。"],
  ["showPlanBar", "boolean", "true", "是否显示计划条；关闭后依赖线和依赖创建入口会同步隐藏。"],
  ["showActualBar", "boolean", "true", "是否显示实际条。"],
  ["showTimelineWhenEmpty", "boolean", "false", "任务数据为空时是否仍展示右侧日期轴、网格和里程碑；左侧表格不展示。"],
  ["editablePlan", "boolean", "false", "计划条是否可拖拽、拉伸。"],
  ["editableActual", "boolean", "true", "实际条是否可拖拽、拉伸。"],
  ["enableLinkCreation", "boolean", "true", "是否允许创建依赖。"],
  ["showLinkRejectionNotice", "boolean", "true", "是否显示依赖拒绝提示。"],
  ["builtInTaskEditor", "boolean", "true", "是否使用内置任务抽屉。"],
  ["builtInMarkerEditor", "boolean", "true", "是否使用内置里程碑弹窗。"],
  ["virtualScroll", "boolean", "true", "是否启用纵向虚拟滚动。"],
  ["autoSchedule", "boolean", "true", "拖动计划条时是否按依赖联动排程；实际条不受依赖自动排程影响。"],
  ["taskColors", "object", "内置色值", "任务条、阶段条、里程碑、计划条默认颜色。"]
]

const taskRows = [
  ["id", "string", "是", "唯一标识。"],
  ["name", "string", "是", "名称。"],
  ["type", "task | summary | milestone", "是", "任务类型。"],
  ["plan", "DateRange", "是", "计划开始和计划完成。"],
  ["actual", "Required<DateRange>", "是", "实际开始、实际完成和进度。"],
  ["parentId", "string | null", "否", "父级阶段 ID。"],
  ["dependencies", "Dependency[]", "否", "任务自身依赖声明，通常也可通过 links 统一传入。"],
  ["color", "string", "否", "实际条颜色。"],
  ["planColor", "string", "否", "计划条内部进度颜色；外部底色由 taskColors.plan 统一控制。"],
  ["calendarId", "standard | delivery", "否", "工作日历：standard 为周一至周五，delivery 包含周末。"],
  ["resources", "string[]", "否", "负责人列表。"],
  ["segments", "Array<{ start; end }>", "否", "预留的分段任务字段，当前视图暂未拆段渲染。"],
  ["constraint", "{ type; date? }", "否", "任务约束，Core 排程影响分析中会用于冲突判断。"],
  ["duration", "number", "否", "任务工期。"],
  ["schedulingMode", "auto | manual", "否", "排程方式。"],
  ["custom", "Record<string, unknown>", "否", "业务自定义字段。"]
]

const dateRangeRows = [
  ["start", "string | Date", "是", "开始日期。"],
  ["end", "string | Date", "是", "结束日期。"],
  ["progress", "number", "plan 否 / actual 是", "进度，actual 中必须提供。"]
]

const dependencyRows = [
  ["id", "string", "否", "依赖 ID，不传时会自动组合生成。"],
  ["predecessorId", "string", "是", "前置任务 ID，用于任务自身 dependencies 字段。"],
  ["type", "FS | SS | FF | SF", "是", "依赖类型。"],
  ["lag", "number", "是", "间隔天数。"],
  ["lagUnit", "calendar | working", "是", "间隔单位。"]
]

const linkRows = [
  ["id", "string", "是", "依赖唯一标识。"],
  ["sourceId", "string", "是", "前置任务 ID。"],
  ["targetId", "string", "是", "后置任务 ID。"],
  ["type", "FS | SS | FF | SF", "是", "依赖类型。"],
  ["lag", "number", "否", "间隔天数，默认 0。"],
  ["lagUnit", "calendar | working", "否", "间隔单位，默认 calendar。"]
]

const markerRows = [
  ["id", "string", "是", "里程碑唯一标识。"],
  ["name", "string", "是", "展示在时间轴上的里程碑名称。"],
  ["date", "string | Date", "是", "里程碑日期。"],
  ["color", "string", "否", "里程碑线和标签颜色。"]
]

const columnRows = [
  ["key", "string", "是", "列字段名，内置字段或 custom 字段名。"],
  ["label", "string", "是", "表头名称。"],
  ["width", "number", "否", "列宽。"],
  ["visible", "boolean", "否", "是否显示。"],
  ["align", "left | center | right", "否", "单元格对齐方式。"],
  ["editable", "boolean", "否", "该列是否进入编辑抽屉并可编辑。"],
  ["type", "text | number | date | select", "否", "编辑控件类型。"],
  ["options", "Array<{ label; value }>", "否", "select 类型选项。"],
  ["formatter / render", "function", "否", "自定义展示文本或样式。"]
]

const editorFieldRows = [
  ["key", "string", "是", "字段名。"],
  ["label", "string", "是", "表单标签。"],
  ["visible", "boolean", "否", "是否在编辑抽屉中显示。"],
  ["editable", "boolean", "否", "是否可编辑。"],
  ["type", "text | number | date | select", "否", "表单控件类型。"],
  ["options", "Array<{ label; value }>", "否", "select 类型选项。"],
  ["placeholder", "string", "否", "输入提示。"]
]

const constraintRows = [
  ["type", "SNET | SNLT | MSO | MFO | ASAP | ALAP", "是", "约束类型。"],
  ["date", "string | Date", "否", "约束日期，部分约束类型需要。"]
]

const eventRows = [
  ["task-change", "(id, patch)", "拖拽、拉伸、保存任务时触发。"],
  ["task-create", "(task)", "创建任务时触发。"],
  ["task-delete", "(id)", "删除任务时触发。"],
  ["task-edit-request", "(request)", "builtInTaskEditor 为 false 时，请求业务侧打开外部任务编辑器。"],
  ["marker-create", "(marker)", "创建里程碑时触发。"],
  ["marker-change", "(id, marker)", "编辑里程碑时触发。"],
  ["marker-delete", "(id)", "删除里程碑时触发。"],
  ["marker-edit-request", "(request)", "builtInMarkerEditor 为 false 时，请求业务侧打开外部里程碑编辑器。"],
  ["link-change", "(links)", "新增、编辑、删除依赖时触发。"],
  ["link-rejected", "(rejection)", "重复、自连、循环依赖被拒绝，或计划条拖拽被依赖约束限制时触发。"]
]

const patchRows = [
  ["planStart / planEnd", "string | Date", "计划条拖拽、拉伸或编辑保存时返回。"],
  ["actualStart / actualEnd", "string | Date", "实际条拖拽、拉伸或编辑保存时返回。"],
  ["progress", "number", "进度变更时返回。"],
  ["name / type / parentId", "string", "任务基础信息编辑保存时返回。"],
  ["color / planColor", "string", "实际条颜色或计划条内部进度颜色编辑保存时返回。"],
  ["duration / schedulingMode", "number / auto | manual", "工期或排程方式编辑保存时返回。"],
  ["resources", "string[]", "负责人编辑保存时返回。"],
  ["calendarId", "standard | delivery", "工作日历选择保存时返回内部标识。"],
  ["custom", "Record<string, unknown>", "自定义字段编辑保存时返回。"]
]

const editRequestRows = [
  ["mode", "create | edit", "编辑模式。"],
  ["task", "GanttTask | undefined", "编辑已有任务时存在，创建时为空。"],
  ["taskType", "task | summary | milestone", "当前任务类型。"],
  ["draft", "GanttTaskEditorDraft", "内置编辑器使用的草稿数据。"],
  ["fields", "GanttEditorField[]", "本次可渲染的编辑字段。"]
]

const markerRequestRows = [
  ["mode", "create | edit", "编辑模式。"],
  ["marker", "GanttMarker | undefined", "编辑已有里程碑时存在，创建时为空。"],
  ["draft", "GanttMarkerEditorDraft", "内置里程碑编辑器使用的草稿数据。"]
]

const linkRejectionRows = [
  ["reason", "duplicate | cycle | self | constraint", "拒绝/限制原因：重复、循环依赖、自连或依赖约束限制。"],
  ["sourceId", "string", "前置任务 ID。"],
  ["targetId", "string", "后置任务 ID。"],
  ["message", "string", "可直接展示给用户的提示文案。"]
]

const slotRows = [
  ["cell-{key}", "{ task, column, value, rowIndex }", "自定义左侧表格单元格。"],
  ["cell", "{ task, column, value, rowIndex }", "统一自定义左侧表格单元格。"],
  ["header-{key}", "{ column }", "自定义左侧表头。"],
  ["header", "{ column }", "统一自定义左侧表头。"],
  ["task-editor", "{ mode, draft, fields, save, close, remove }", "完全替换任务编辑抽屉。"],
  ["editor-field-{key}", "{ field, draft, value }", "替换某个自定义字段编辑控件。"],
  ["editor-footer", "{ mode, draft, save, close, remove }", "替换任务抽屉底部按钮。"],
  ["marker-editor", "{ mode, draft, save, close, remove }", "完全替换里程碑弹窗。"]
]

const methodRows = [
  ["exportImage(options?)", "Promise<string>", "导出当前可视区域为图片，默认下载并返回 data URL。"],
  ["enterFullscreen()", "Promise<void>", "进入浏览器全屏。"],
  ["exitFullscreen()", "Promise<void>", "退出浏览器全屏。"],
  ["toggleFullscreen()", "Promise<void>", "切换浏览器全屏状态。"],
  ["openCreateTask(type?)", "void", "打开新建任务、阶段或里程碑抽屉；type 默认为 task。"],
  ["openCreateMarker()", "void", "打开新建时间轴里程碑弹窗。"],
  ["getEngine()", "GanttEngine | null", "获取命令式引擎实例，可调用 scrollToDate、zoomToFit、setTask 等方法。"]
]

const nativeOptionRows = [
  ["tasks", "GanttTask[]", "[]", "初始任务、阶段和任务型里程碑。"],
  ["links", "GanttLink[]", "[]", "初始依赖关系。"],
  ["markers", "GanttMarker[]", "[]", "初始时间轴里程碑。"],
  ["config", "Partial<GanttConfig>", "{}", "甘特图配置。"],
  ["width", "string | number", "100%", "实例宽度；数字按 px，字符串支持 CSS 尺寸单位。"],
  ["height", "string | number", "620px", "实例高度；支持数字、px、%、vh 等，百分比要求父容器有明确高度。"],
  ["onTaskChange / Create / Delete", "function", "-", "任务变更、创建和删除回调。"],
  ["onTaskEditRequest", "function", "-", "关闭内置任务编辑器后的编辑请求。"],
  ["onMarkerCreate / Change / Delete", "function", "-", "时间轴里程碑增删改回调。"],
  ["onMarkerEditRequest", "function", "-", "关闭内置里程碑编辑器后的编辑请求。"],
  ["onLinkChange / onLinkRejected", "function", "-", "依赖变更和拒绝回调。"]
]

const integrationModeRows = [
  ["Vue 组件", "Vue 项目（推荐）", "自动处理挂载和销毁；父组件通过 props 与事件维护受控数据。"],
  ["createGantt", "原生 HTML、Vue、React 等浏览器项目", "手动处理生命周期；实例自动维护交互数据，外部数据通过 setter 同步。"]
]

const nativeMethodRows = [
  ["getContainer()", "HTMLElement", "获取实例挂载容器。"],
  ["getTasks() / getLinks() / getMarkers()", "数据副本", "读取当前实例数据，不直接暴露内部数组。"],
  ["getConfig()", "Partial<GanttConfig>", "读取当前实例配置副本。"],
  ["setTasks(tasks) / setLinks(links) / setMarkers(markers)", "void", "用外部业务数据替换实例数据。"],
  ["setTask(id, patch)", "void", "使用 PatchTask 更新单个任务。"],
  ["addTask(task) / removeTask(id)", "void", "以命令方式新增或删除任务。"],
  ["setConfig(config)", "void", "合并配置 patch，不会清空未传配置。"],
  ["setSize(width?, height?)", "void", "调整实例宽高。"],
  ["scrollToDate(date) / scrollToTask(id)", "void", "滚动到指定日期或任务。"],
  ["zoomToFit(padding?)", "void", "调整列宽，使任务日期范围适配视口。"],
  ["exportImage(options?)", "Promise<string>", "导出当前可视区域。"],
  ["enterFullscreen / exitFullscreen / toggleFullscreen", "Promise<void>", "控制浏览器全屏。"],
  ["openCreateTask(type?) / openCreateMarker()", "void", "打开内置新建编辑器。"],
  ["getEngine()", "GanttEngine | null", "获取底层命令式引擎。"],
  ["isDestroyed()", "boolean", "判断实例是否已销毁。"],
  ["destroy()", "void", "卸载界面并清理监听器、观察器和动画；可重复调用。"]
]

const exportOptionRows = [
  ["filename", "string", "gantt-当天日期.png", "下载文件名。"],
  ["type", "image/png | image/jpeg", "image/png", "图片格式。"],
  ["background", "string", "#ffffff", "导出图片背景色。"],
  ["pixelRatio", "number", "devicePixelRatio", "导出倍率，数值越大越清晰也越占内存。"],
  ["download", "boolean", "true", "是否自动触发下载；设为 false 时只返回 data URL。"]
]

const coreRows = [
  ["computeTimeScale(start, end, viewMode, columnWidth, firstDayOfWeek)", "生成时间轴刻度。"],
  ["computeLayout(tasks, links, config, collapsedIds?, viewport?)", "计算任务条在时间轴中的位置，返回 Result<TaskLayout[]>。"],
  ["flattenTasks(tasks, collapsedIds?)", "展开阶段树，生成可渲染行，支持父子孙多级结构。"],
  ["normalizeLinks(tasks, standaloneLinks?)", "标准化依赖，合并 task.dependencies 和 links，并过滤无效关系。"],
  ["checkCyclicDependency(links)", "检测依赖是否产生循环。"],
  ["scheduleByDependencies(tasks, links)", "Core 独立排程工具：按 FS / SS / FF / SF 依赖调整任务时间，返回 Result<GanttTask[]>。"],
  ["computeImpact(taskId, patch, tasks, links, config)", "计算一次任务变更影响到的后续任务和约束冲突。"],
  ["shiftTask(task, start)", "按新开始日期整体平移任务实际时间。"],
  ["toDate / formatDate / addDays / diffDays / inclusiveDays / isValidDate", "日期工具方法。"]
]

async function copyCode(key: string, value: string) {
  await navigator.clipboard?.writeText(value)
  copiedKey.value = key
  window.setTimeout(() => {
    if (copiedKey.value === key) {
      copiedKey.value = ""
    }
  }, 1600)
}

function closeMobileNav() {
  mobileNavOpen.value = false
}

declare global {
  interface Window {
    hljs?: { highlightAll(): void }
  }
}

onMounted(async () => {
  await nextTick()
  window.hljs?.highlightAll()
  // 初始化自适应列宽 + 监听窗口尺寸
  applyAdaptiveColumnWidth()
  window.addEventListener("resize", onWindowResize)
})

onBeforeUnmount(() => {
  window.clearTimeout(adaptiveResizeTimer)
  window.removeEventListener("resize", onWindowResize)
})

// 切换语言、页面或示例代码后重新高亮。
watch([codeLang, activePlaygroundPage, activeExampleCode], async () => {
  await nextTick()
  // 清除已高亮的标记，否则 highlightAll 会跳过
  document.querySelectorAll(".code-block code").forEach((el) => {
    el.classList.remove("hljs")
    el.removeAttribute("data-highlighted")
  })
  window.hljs?.highlightAll()
})
</script>

<template>
  <div class="docs-page">
    <header class="docs-header playground-header">
      <button
        v-if="activePlaygroundPage === 'docs'"
        class="menu-button"
        type="button"
        aria-label="打开目录"
        :aria-expanded="mobileNavOpen"
        @click="mobileNavOpen = !mobileNavOpen"
      >
        <span></span><span></span><span></span>
      </button>
      <button type="button" class="docs-brand" @click="setPlaygroundPage('examples')">Vue Gantt</button>
      <nav class="playground-tabs" aria-label="Playground 页面">
        <button
          type="button"
          :class="{ active: activePlaygroundPage === 'examples' }"
          @click="setPlaygroundPage('examples')"
        >
          功能示例
        </button>
        <button
          type="button"
          :class="{ active: activePlaygroundPage === 'docs' }"
          @click="setPlaygroundPage('docs')"
        >
          使用文档
        </button>
      </nav>
      <span class="docs-version">v0.1.0</span>
      <div class="docs-lang-toggle" aria-label="示例代码语言">
        <button type="button" :class="{ active: codeLang === 'ts' }" @click="codeLang = 'ts'">TS</button>
        <button type="button" :class="{ active: codeLang === 'js' }" @click="codeLang = 'js'">JS</button>
      </div>
    </header>

    <template v-if="activePlaygroundPage === 'examples'">
    <main class="examples-workspace">
    <section class="gantt-demo-hero standalone" data-gantt-fullscreen-root style="padding-bottom:20px;">
      <div class="gantt-demo-toolbar" style="margin-bottom:20px;">
        <div class="toolbar-row toolbar-row-primary">
          <div class="toolbar-info">
            <strong class="toolbar-title">项目甘特图</strong>
            <span class="toolbar-meta">{{ demoAllTasks.length }} 个任务</span>
            <span class="toolbar-divider" aria-hidden="true"></span>
            <span class="toolbar-legend">
              <i class="dot plan"></i>计划
              <i class="dot actual"></i>实际
            </span>
          </div>
          <div class="toolbar-actions">
            <button type="button" class="quiet" disabled>编辑</button>
            <button type="button" class="quiet" @click="exportDemoImage">导出图片</button>
            <button type="button" class="quiet" @click="toggleDemoFullscreen">全屏</button>
            <button type="button" class="quiet" @click="scrollDemoToToday">跳到今天</button>
            <button type="button" class="quiet" @click="scrollDemoToFirstTask">跳到首任务</button>
            <button type="button" class="quiet" @click="collapseAllDemo">折叠全部</button>
            <button type="button" class="quiet" @click="expandAllDemo">展开全部</button>
            <button type="button" class="primary" @click="createDemoTask">新建任务</button>
            <button type="button" class="secondary" @click="createDemoMarker">新建里程碑</button>
          </div>
        </div>
        <div class="toolbar-row toolbar-row-controls">
          <div class="toolbar-group toolbar-group-datasets">
            <span class="group-label">数据规模</span>
            <div class="segmented">
              <button
                v-for="dataset in demoDatasets"
                :key="dataset.mode"
                type="button"
                :class="{ active: demoDataMode === dataset.mode }"
                @click="useDemoDataset(dataset.mode, dataset.count)"
              >
                {{ dataset.label }}
              </button>
            </div>
          </div>
          <div class="toolbar-group">
            <span class="group-label">显示</span>
            <div class="segmented">
              <button
                type="button"
                :class="{ active: demoConfig.showPlanBar !== false }"
                @click="togglePlanBar"
              >
                计划条
              </button>
              <button
                type="button"
                :class="{ active: demoConfig.showActualBar !== false }"
                @click="toggleActualBar"
              >
                实际条
              </button>
              <div class="demo-column-config">
                <button
                  type="button"
                  :class="{ active: demoColumnPanelOpen }"
                  @click="demoColumnPanelOpen ? cancelDemoColumnPanel() : openDemoColumnPanel()"
                >
                  自定义列
                </button>
                <div v-if="demoColumnPanelOpen" class="demo-column-panel">
                  <div class="demo-column-panel-head">
                    <strong>列配置</strong>
                    <button type="button" @click="resetDemoColumns">重置</button>
                  </div>
                  <div class="demo-column-row demo-column-row-title">
                    <span>字段</span>
                    <span>展示</span>
                    <span>可编辑</span>
                  </div>
                  <div v-for="column in demoColumnDrafts" :key="column.key" class="demo-column-row">
                    <span>{{ column.label }}</span>
                    <label>
                      <input
                        type="checkbox"
                        :checked="column.visible"
                        @change="updateDemoColumnVisible(column.key, ($event.target as HTMLInputElement).checked)"
                      >
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        :checked="column.editable"
                        :disabled="!column.visible"
                        @change="updateDemoColumnEditable(column.key, ($event.target as HTMLInputElement).checked)"
                      >
                    </label>
                  </div>
                  <div class="demo-column-panel-footer">
                    <button type="button" @click="cancelDemoColumnPanel">取消</button>
                    <button type="button" class="primary" @click="applyDemoColumns">保存</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="toolbar-group toolbar-group-view">
            <span class="group-label">视图</span>
            <fieldset class="segmented" aria-label="时间刻度">
              <label
                v-for="option in demoViewOptions"
                :key="option.mode"
                :class="{ active: demoConfig.viewMode === option.mode }"
              >
                <input
                  type="radio"
                  name="demo-view-mode"
                  :value="option.mode"
                  :checked="demoConfig.viewMode === option.mode"
                  @change="setDemoViewMode(option.mode)"
                >
                <span>{{ option.label }}</span>
              </label>
            </fieldset>
          </div>
        </div>
      </div>
     <GanttChart
       ref="demoGanttRef"
       :tasks="demoAllTasks"
       :links="demoLinks"
       :markers="demoMarkers"
       :config="demoConfig"
       height="650px"
        @task-change="handleTaskChange"
        @task-create="handleTaskCreate"
        @task-delete="handleTaskDelete"
        @task-edit-request="handleTaskEditRequest"
        @link-change="handleLinkChange"
        @link-rejected="handleLinkRejected"
        @marker-create="handleMarkerCreate"
        @marker-change="handleMarkerChange"
        @marker-delete="handleMarkerDelete"
        @marker-edit-request="handleMarkerEditRequest"
      >
        <template #cell-priority="{ value }">
          <span
            class="demo-priority"
            :class="`level-${value || 'medium'}`"
            title="业务优先级，仅用于排序和资源取舍，不参与日期排程"
          >
            {{ value === "high" ? "高" : value === "low" ? "低" : "中" }}
          </span>
        </template>
        <template #cell-risk="{ value }">
          <span
            class="demo-risk"
            :class="{ danger: value === '高', warning: value === '中', safe: value === '低' }"
            title="风险等级，用于提示延期或交付风险，不参与日期排程"
          >{{ value || "低" }}</span>
        </template>
      </GanttChart>
    </section>

    <section class="example-code-center">
      <div class="example-code-heading">
        <div>
          <h1>功能示例代码</h1>
          <p>上方演示与组件使用同一套数据、配置和公开 API，可按接入方式查看并复制代码。</p>
        </div>
        <div class="example-code-controls">
          <div class="example-code-tabs" role="tablist" aria-label="示例代码类型">
            <button type="button" :class="{ active: activeExampleCode === 'component' }" @click="activeExampleCode = 'component'">Vue 组件</button>
            <button type="button" :class="{ active: activeExampleCode === 'native' }" @click="activeExampleCode = 'native'">原生实例</button>
            <button type="button" :class="{ active: activeExampleCode === 'vue-native' }" @click="activeExampleCode = 'vue-native'">Vue 原生接入</button>
          </div>
          <div class="example-language-tabs" role="group" aria-label="示例代码语言">
            <button type="button" :class="{ active: codeLang === 'ts' }" @click="codeLang = 'ts'">TS</button>
            <button type="button" :class="{ active: codeLang === 'js' }" @click="codeLang = 'js'">JS</button>
          </div>
        </div>
      </div>
      <p class="example-copy-note">
        复制前先安装 <code>vue@^3.5.0</code> 和 <code>ct-gantt-vue</code>；Vue 组件与 Vue 原生接入代码保存为
        <code>.vue</code> 文件，原生实例代码放入 Vite 的 <code>main.ts</code> 或 <code>main.js</code>，并保留默认
        <code>#app</code> 容器。
      </p>
      <div class="code-block example-code-block">
        <button type="button" @click="copyCode('feature-example', selectedExampleCode)">{{ copiedKey === "feature-example" ? "已复制" : "复制" }}</button>
        <pre><code :class="codeClass">{{ selectedExampleCode }}</code></pre>
      </div>
    </section>
    </main>
    </template>

    <template v-else>

    <aside class="docs-nav" :class="{ open: mobileNavOpen }">
      <strong>目录</strong>
      <a
        v-for="item in navigation"
        :key="item.id"
        :href="`#${item.id}`"
        @click="closeMobileNav"
      >
        {{ item.label }}
      </a>
    </aside>
    <button v-if="mobileNavOpen" class="nav-mask" type="button" @click="closeMobileNav"></button>

    <main class="docs-content">
      <section id="overview" class="doc-section">
        <h1>1.1. Vue Gantt 插件说明</h1>
        <p>
          Vue Gantt 是一个基于 Vue 3 的甘特图组件，支持计划条、实际条、任务依赖、里程碑、
          自定义左侧表格列、内置编辑器和外部编辑器接入。
        </p>
        <ul>
          <li>适用于项目计划、研发排期、交付跟踪等业务场景。</li>
          <li>组件采用受控数据流，所有数据变更通过事件返回给业务侧。</li>
          <li>计划条与实际条独立控制，依赖关系只建立在计划条之间。</li>
          <li>如果只需要排程或布局算法，可以单独使用 <code>ct-gantt-core</code>。</li>
        </ul>
      </section>

      <section id="install" class="doc-section">
        <h1>1.2. 引用 Vue Gantt 插件</h1>
        <p>
          当前发布包面向 Vue 构建工具项目，请通过 npm、pnpm 或 yarn 安装，不提供可直接通过
          <code>&lt;script&gt;</code> 标签引用的独立浏览器包。
        </p>
        <div class="code-block">
          <button type="button" @click="copyCode('npm', npmCode)">{{ copiedKey === "npm" ? "已复制" : "复制" }}</button>
          <span class="lang-switch">
            <button type="button" :class="{ active: codeLang === 'ts' }" @click="codeLang = 'ts'">TS</button>
            <button type="button" :class="{ active: codeLang === 'js' }" @click="codeLang = 'js'">JS</button>
          </span>
          <pre><code :class="codeClass">{{ npmCode }}</code></pre>
        </div>
      </section>

      <section id="container" class="doc-section">
        <h1>1.3. 定义甘特图容器</h1>
        <p>在 Vue 模板中定义组件渲染位置，并传入任务、依赖、里程碑和配置对象。</p>
        <div class="code-block">
          <button type="button" @click="copyCode('container', containerCode)">{{ copiedKey === "container" ? "已复制" : "复制" }}</button>
          <pre><code class="language-xml">{{ containerCode }}</code></pre>
        </div>
      </section>

      <section id="config" class="doc-section">
        <h1>1.4. 定义甘特图参数</h1>
        <p>
          此步骤可选。如果不传入配置对象，组件会使用默认配置。需要个性化展示或限制交互时，
          可以通过 <code>GanttConfig</code> 进行配置。
        </p>
        <div class="code-block tall">
          <button type="button" @click="copyCode('config', configCode)">{{ copiedKey === "config" ? "已复制" : "复制" }}</button>
          <span class="lang-switch">
            <button type="button" :class="{ active: codeLang === 'ts' }" @click="codeLang = 'ts'">TS</button>
            <button type="button" :class="{ active: codeLang === 'js' }" @click="codeLang = 'js'">JS</button>
          </span>
          <pre><code :class="codeClass">{{ configCode }}</code></pre>
        </div>
        <h2>主要参数说明</h2>
        <div class="doc-table four-cols">
          <div class="table-head"><span>参数</span><span>类型</span><span>默认值</span><span>说明</span></div>
          <div v-for="row in configRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span><span>{{ row[3] }}</span>
          </div>
        </div>
        <p class="doc-hint">
          说明：<code>columns</code> 会完整替换左侧表格列，并同步隐藏对应的任务编辑字段；
          <code>customColumns</code> 会在内置列后追加列；只有明确设置 <code>editorFields.visible</code> 才会覆盖该联动。
          自定义列如果需要进入任务编辑抽屉，请设置 <code>editable: true</code>，并按需要补充 <code>type</code>、<code>options</code> 或 <code>editor</code>。
          <code>locale</code>、<code>dateFormat</code> 和 <code>theme</code> 当前为预留配置，不会改变组件渲染结果。
        </p>
        <h2>CustomColumn 字段说明</h2>
        <div class="doc-table four-cols">
          <div class="table-head"><span>字段</span><span>类型</span><span>必填</span><span>说明</span></div>
          <div v-for="row in columnRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span><span>{{ row[3] }}</span>
          </div>
        </div>
        <h2>GanttEditorField 字段说明</h2>
        <div class="doc-table four-cols">
          <div class="table-head"><span>字段</span><span>类型</span><span>必填</span><span>说明</span></div>
          <div v-for="row in editorFieldRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span><span>{{ row[3] }}</span>
          </div>
        </div>
      </section>

      <section id="data" class="doc-section">
        <h1>1.5. 定义甘特图数据</h1>
        <p>甘特图数据主要由任务、依赖和里程碑三部分组成。</p>
        <div class="code-block tall">
          <button type="button" @click="copyCode('data', dataCode)">{{ copiedKey === "data" ? "已复制" : "复制" }}</button>
          <span class="lang-switch">
            <button type="button" :class="{ active: codeLang === 'ts' }" @click="codeLang = 'ts'">TS</button>
            <button type="button" :class="{ active: codeLang === 'js' }" @click="codeLang = 'js'">JS</button>
          </span>
          <pre><code :class="codeClass">{{ dataCode }}</code></pre>
        </div>
        <h2>任务字段说明</h2>
        <div class="doc-table four-cols">
          <div class="table-head"><span>字段</span><span>类型</span><span>必填</span><span>说明</span></div>
          <div v-for="row in taskRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span><span>{{ row[3] }}</span>
          </div>
        </div>
        <p class="doc-hint">
          <code>summary</code> 阶段拥有子任务时，计划日期、实际日期和进度会自动汇总并只读；
          没有子任务的空阶段仍可手动设置这些字段。
        </p>
        <h2>DateRange 字段说明</h2>
        <div class="doc-table four-cols">
          <div class="table-head"><span>字段</span><span>类型</span><span>必填</span><span>说明</span></div>
          <div v-for="row in dateRangeRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span><span>{{ row[3] }}</span>
          </div>
        </div>
        <h2>Dependency 字段说明</h2>
        <p class="doc-hint">
          <code>Dependency</code> 用在 <code>task.dependencies</code> 中；<code>GanttLink</code> 用在组件的 <code>links</code> 属性中。
          两者会在内部统一标准化为依赖线。
        </p>
        <div class="doc-table four-cols">
          <div class="table-head"><span>字段</span><span>类型</span><span>必填</span><span>说明</span></div>
          <div v-for="row in dependencyRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span><span>{{ row[3] }}</span>
          </div>
        </div>
        <h2>GanttLink 字段说明</h2>
        <div class="doc-table four-cols">
          <div class="table-head"><span>字段</span><span>类型</span><span>必填</span><span>说明</span></div>
          <div v-for="row in linkRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span><span>{{ row[3] }}</span>
          </div>
        </div>
        <h2>里程碑字段说明</h2>
        <div class="doc-table four-cols">
          <div class="table-head"><span>字段</span><span>类型</span><span>必填</span><span>说明</span></div>
          <div v-for="row in markerRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span><span>{{ row[3] }}</span>
          </div>
        </div>
        <h2>Constraint 字段说明</h2>
        <div class="doc-table four-cols">
          <div class="table-head"><span>字段</span><span>类型</span><span>必填</span><span>说明</span></div>
          <div v-for="row in constraintRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span><span>{{ row[3] }}</span>
          </div>
        </div>
      </section>

      <section id="create" class="doc-section">
        <h1>1.6. 渲染或创建甘特图</h1>
        <div class="doc-table three-cols">
          <div class="table-head"><span>接入方式</span><span>适用场景</span><span>数据与生命周期</span></div>
          <div v-for="row in integrationModeRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span>
          </div>
        </div>
        <p>
          Vue 项目推荐直接渲染 <code>GanttChart</code> 组件。
          组件采用受控数据流，拖拽、拉伸和编辑保存后需要在事件中更新业务数据。
        </p>
        <div class="code-block">
          <button type="button" @click="copyCode('create', createCode)">{{ copiedKey === "create" ? "已复制" : "复制" }}</button>
          <span class="lang-switch">
            <button type="button" :class="{ active: codeLang === 'ts' }" @click="codeLang = 'ts'">TS</button>
            <button type="button" :class="{ active: codeLang === 'js' }" @click="codeLang = 'js'">JS</button>
          </span>
          <pre><code :class="codeClass">{{ createCode }}</code></pre>
        </div>
        <h2>原生实例方式</h2>
        <p>
          原生 HTML、Vue、React 或其他浏览器框架也可以调用 <code>createGantt(container, options)</code>。
          实例会自动回写界面内发生的增删改；外部数据变化时调用 setter，同一容器不允许重复挂载，卸载时必须调用 <code>destroy()</code>。
        </p>
        <div class="code-block tall">
          <button type="button" @click="copyCode('native', nativeCode)">{{ copiedKey === "native" ? "已复制" : "复制" }}</button>
          <span class="lang-switch">
            <button type="button" :class="{ active: codeLang === 'ts' }" @click="codeLang = 'ts'">TS</button>
            <button type="button" :class="{ active: codeLang === 'js' }" @click="codeLang = 'js'">JS</button>
          </span>
          <pre><code :class="codeClass">{{ nativeCode }}</code></pre>
        </div>
        <p class="doc-hint">
          当前原生入口复用 Vue 渲染器；非 Vue 项目使用时仍需安装 Vue 3.5+。Vue/React 中应分别在 mounted/useEffect 后创建，并在卸载回调中销毁。
        </p>
        <h2>在 Vue 中使用原生实例</h2>
        <div class="code-block tall">
          <button type="button" @click="copyCode('native-vue', nativeVueCode)">{{ copiedKey === "native-vue" ? "已复制" : "复制" }}</button>
          <pre><code class="language-typescript">{{ nativeVueCode }}</code></pre>
        </div>
        <h2>在 React 中使用原生实例</h2>
        <div class="code-block tall">
          <button type="button" @click="copyCode('native-react', nativeReactCode)">{{ copiedKey === "native-react" ? "已复制" : "复制" }}</button>
          <pre><code class="language-typescript">{{ nativeReactCode }}</code></pre>
        </div>
      </section>

      <section id="props" class="doc-section">
        <h1>1.7. 甘特图组件属性</h1>
        <p>组件属性用于传入数据、配置和尺寸；所有事件也可以通过对应的 <code>onXxx</code> 回调属性监听。</p>
        <div class="doc-table four-cols">
          <div class="table-head"><span>属性</span><span>类型</span><span>必填</span><span>说明</span></div>
          <div v-for="row in propRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span><span>{{ row[3] }}</span>
          </div>
        </div>
        <p class="doc-hint">
          <code>width</code> / <code>height</code> 传数字时按像素处理，例如 <code>:height="620"</code>；
          传字符串时可使用 <code>620px</code>、<code>70vh</code> 或 <code>100%</code>。
          百分比高度要求父级容器具有明确高度，否则浏览器无法计算实际高度。
        </p>
      </section>

      <section id="events" class="doc-section">
        <h1>1.8. 甘特图事件说明</h1>
        <p>组件内部不会直接修改业务数据。所有变更都会通过事件抛出，由业务侧自行保存。</p>
        <div class="doc-table three-cols">
          <div class="table-head"><span>事件</span><span>参数</span><span>说明</span></div>
          <div v-for="row in eventRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span>
          </div>
        </div>
        <h2>PatchTask 字段说明</h2>
        <div class="doc-table three-cols">
          <div class="table-head"><span>字段</span><span>类型</span><span>说明</span></div>
          <div v-for="row in patchRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span>
          </div>
        </div>
        <h2>外部任务编辑请求 GanttTaskEditRequest</h2>
        <div class="doc-table three-cols">
          <div class="table-head"><span>字段</span><span>类型</span><span>说明</span></div>
          <div v-for="row in editRequestRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span>
          </div>
        </div>
        <h2>外部里程碑编辑请求 GanttMarkerEditRequest</h2>
        <div class="doc-table three-cols">
          <div class="table-head"><span>字段</span><span>类型</span><span>说明</span></div>
          <div v-for="row in markerRequestRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span>
          </div>
        </div>
        <h2>依赖拒绝信息 GanttLinkRejection</h2>
        <div class="doc-table three-cols">
          <div class="table-head"><span>字段</span><span>类型</span><span>说明</span></div>
          <div v-for="row in linkRejectionRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span>
          </div>
        </div>
      </section>

      <section id="slots" class="doc-section">
        <h1>1.9. 自定义插槽说明</h1>
        <p>左侧表格、任务编辑器和里程碑编辑器均可通过插槽进行自定义。</p>
        <div class="doc-table three-cols">
          <div class="table-head"><span>插槽</span><span>参数</span><span>说明</span></div>
          <div v-for="row in slotRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span>
          </div>
        </div>
        <h2>自定义列和字段编辑示例</h2>
        <div class="code-block">
          <button type="button" @click="copyCode('slot', customSlotCode)">{{ copiedKey === "slot" ? "已复制" : "复制" }}</button>
          <pre><code class="language-xml">{{ customSlotCode }}</code></pre>
        </div>
        <h2>完全使用外部弹窗示例</h2>
        <div class="code-block">
          <button type="button" @click="copyCode('editor', externalEditorCode)">{{ copiedKey === "editor" ? "已复制" : "复制" }}</button>
          <pre><code class="language-xml">{{ externalEditorCode }}</code></pre>
        </div>
      </section>

      <section id="methods" class="doc-section">
        <h1>1.10. 甘特图组件方法</h1>
        <p>通过组件 ref 可以调用导出、全屏、打开新建编辑器和获取引擎等公开方法。</p>
        <p class="doc-hint">
          当前 <code>exportImage</code> 导出的是当前可视区域，适合大数据场景下快速保存当前视图；如果需要导出全部行，建议业务侧做分页或分片导出。
        </p>
        <div class="doc-table three-cols">
          <div class="table-head"><span>方法</span><span>返回值</span><span>说明</span></div>
          <div v-for="row in methodRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span>
          </div>
        </div>
        <h2>CreateGanttOptions</h2>
        <div class="doc-table four-cols">
          <div class="table-head"><span>参数</span><span>类型</span><span>默认值</span><span>说明</span></div>
          <div v-for="row in nativeOptionRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span><span>{{ row[3] }}</span>
          </div>
        </div>
        <h2>createGantt 实例方法</h2>
        <div class="doc-table three-cols">
          <div class="table-head"><span>方法</span><span>返回值</span><span>说明</span></div>
          <div v-for="row in nativeMethodRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span>
          </div>
        </div>
        <h2>exportImage options</h2>
        <div class="doc-table four-cols">
          <div class="table-head"><span>参数</span><span>类型</span><span>默认值</span><span>说明</span></div>
          <div v-for="row in exportOptionRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span><span>{{ row[3] }}</span>
          </div>
        </div>
        <div class="code-block">
          <button type="button" @click="copyCode('export', exportImageCode)">{{ copiedKey === "export" ? "已复制" : "复制" }}</button>
          <span class="lang-switch">
            <button type="button" :class="{ active: codeLang === 'ts' }" @click="codeLang = 'ts'">TS</button>
            <button type="button" :class="{ active: codeLang === 'js' }" @click="codeLang = 'js'">JS</button>
          </span>
          <pre><code :class="codeClass">{{ exportImageCode }}</code></pre>
        </div>
      </section>

      <section id="core" class="doc-section">
        <h1>1.11. Core API 方法</h1>
        <p><code>ct-gantt-core</code> 不依赖 Vue，可用于服务端、其他框架或自定义渲染场景。</p>
        <div class="doc-table two-cols">
          <div class="table-head"><span>方法</span><span>说明</span></div>
          <div v-for="row in coreRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span>
          </div>
        </div>
      </section>

      <section id="notes" class="doc-section">
        <h1>1.12. 使用注意事项</h1>
        <ul>
          <li>任务依赖只允许计划条建立，实际条不参与依赖关系。</li>
          <li>关闭 <code>showPlanBar</code> 后，计划条、依赖线和依赖创建入口会一起隐藏。</li>
          <li>组件内的依赖自动排程只作用于计划条；实际条代表真实执行记录，拖拽实际条不会联动依赖任务。</li>
          <li>如果希望空数据时仍展示日期轴和网格，可开启 <code>showTimelineWhenEmpty</code>；此时左侧表格、任务条和实际条不会展示。</li>
          <li>同一个前置任务和后置任务之间只能保留一条依赖线。</li>
          <li>计划条被依赖约束限制时会触发 <code>link-rejected</code>，其中 <code>reason</code> 为 <code>constraint</code>。</li>
          <li>里程碑当前按日期固定展示在时间轴上，不随表格滚动，也不支持上下自由拖拽；如需特殊位置样式，建议通过里程碑编辑器或自定义样式扩展。</li>
          <li>计划条外部底色由 <code>taskColors.plan</code> 统一控制，内部进度颜色由 <code>planColor</code> 控制；实际条颜色由 <code>color</code> 控制。</li>
          <li>工期、日历 ID、排程方式和任务条颜色属于高级编辑字段，默认隐藏；需要时通过 <code>editorFields.visible</code> 开启。</li>
          <li>左侧自定义列只有设置 <code>editable: true</code> 才自动进入编辑器，并应同时设置 <code>type</code> 和必要的 <code>options</code>。</li>
          <li>如果不需要内置弹窗，可关闭 <code>builtInTaskEditor</code> 或使用对应插槽完全替换。</li>
        </ul>
      </section>
    </main>
    </template>
  </div>
</template>
