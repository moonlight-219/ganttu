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
  { key: "risk", label: "风险", width: 70, align: "center", editable: true }
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
  fitTimelineToViewport: true,
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
    { key: "calendarId", label: "日历 ID", editable: true },
    { key: "schedulingMode", label: "排程方式", type: "select", editable: true },
    { key: "color", label: "实际条颜色", editable: true },
    { key: "planColor", label: "计划条颜色", editable: true },
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
    .filter((setting) => setting.visible)
    .map((setting) => {
      const source = defaultDemoColumns.find((column) => column.key === setting.key)!
      return { ...source, editable: setting.editable }
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

const cdnCode = `<!-- 1. 引入甘特图样式 -->
<link rel="stylesheet" href="./gantt/style.css" />

<!-- 2. 引入 Vue 3 运行环境（CDN 版本） -->
<script src="./vue.global.prod.js"><\\/script>

<!-- 3. 引入 Vue Gantt UMD 包，依赖 Vue 全局变量 -->
<script src="./gantt/vue-gantt.umd.cjs"><\\/script>`.replace("<\\/script>", "</" + "script>")

const npmCodeTS = `// 1. 安装依赖（vue 和 ct-gantt-vue 是两个独立包）
pnpm add vue ct-gantt-core ct-gantt-vue

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

const npmCodeJS = `// 1. 安装依赖（vue 和 ct-gantt-vue 是两个独立包）
pnpm add vue ct-gantt-core ct-gantt-vue

// 2. 在入口文件（main.js）或业务组件中引入样式
import "ct-gantt-vue/style.css"

// 3. 引入组件（JS 中类型仅为 JSDoc 注释，不影响运行）
import GanttChart from "ct-gantt-vue"
// 如需类型提示，可使用 JSDoc：
// /** @type {import("ct-gantt-vue").GanttTask[]} */`

const npmCode = computed(() => codeLang.value === "ts" ? npmCodeTS : npmCodeJS)

const containerCode = `<template>
  <!-- 甘特图容器：必须指定宽高，否则画布渲染异常 -->
  <div id="GanttChartDIV" class="gantt-doc-demo">
    <GanttChart
      :tasks="tasks"          <!-- 必填：任务数据 -->
      :links="links"          <!-- 可选：任务依赖关系 -->
      :markers="markers"      <!-- 可选：时间轴里程碑 -->
      :config="ganttConfig"   <!-- 可选：甘特图配置项 -->
      height="620px"          <!-- 组件高度，优先级高于 config.height -->
      @task-change="handleTaskChange"   <!-- 任务变更事件 -->
      @link-change="handleLinkChange"   <!-- 依赖变更事件 -->
    />
  </div>
</template>`

const configCodeTS = `const ganttConfig: Partial<GanttConfig> = {
  // 以下配置均为可选；不传时会使用组件默认值
  // 甘特图基础设置
  viewMode: "day",                 // 时间刻度: day / week / month / quarter / year
  width: "100%",                   // 甘特图整体宽度
  height: "620px",                 // 甘特图整体高度
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
    { key: "color", label: "实际条颜色", editable: true },
    { key: "planColor", label: "计划条颜色", editable: true }
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
    planColor: "#cbd5e1",                               // 可选：计划条颜色
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

// 1. 定义响应式任务数据
const tasks = ref<GanttTask[]>([])

// 2. 将 PatchTask（组件回传的扁平变更）合并回完整的 GanttTask 结构
function mergeTaskPatch(task: GanttTask, patch: PatchTask): GanttTask {
  return {
    ...task,
    ...patch,
    plan: {
      ...task.plan,
      start: patch.planStart ?? task.plan.start,   // 计划开始
      end: patch.planEnd ?? task.plan.end           // 计划完成
    },
    actual: {
      ...task.actual,
      start: patch.actualStart ?? task.actual.start,  // 实际开始
      end: patch.actualEnd ?? task.actual.end,         // 实际完成
      progress: patch.progress ?? task.actual.progress // 进度
    },
    custom: patch.custom ? { ...task.custom, ...patch.custom } : task.custom  // 自定义字段
  }
}

// 3. 处理任务变更事件（拖拽、拉伸、编辑保存等）
function handleTaskChange(id: string, patch: PatchTask) {
  tasks.value = tasks.value.map((task) =>
    task.id === id ? mergeTaskPatch(task, patch) : task
  )
}
<\\/script>`.replace("<\\/script>", "</" + "script>")

// JS 版本：<script setup> 去掉 lang="ts" 和所有类型标注
const createCodeJS = createCodeTS
  .replace(` lang="ts"`, "")
  .replace(`import GanttChart, { type GanttTask, type PatchTask } from "ct-gantt-vue"`, `import GanttChart from "ct-gantt-vue"`)
  .replaceAll(`: GanttTask`, "")
  .replaceAll(`: PatchTask`, "")
  .replaceAll(`ref<GanttTask[]>`, `ref`)
const createCode = computed(() => codeLang.value === "ts" ? createCodeTS : createCodeJS)

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
    builtInTaskEditor: false,     <!-- 关闭内置任务抽屉 -->
    builtInMarkerEditor: false    <!-- 关闭内置里程碑弹窗 -->
  }"
  @task-edit-request="openTaskDrawer"        <!-- 双击 / 编辑按钮 → 打开外部任务抽屉 -->
  @marker-edit-request="openMarkerDialog"    <!-- 双击里程碑 → 打开外部里程碑弹窗 -->
/>`

const exportImageCodeTS = `<script setup lang="ts">
import { ref } from "vue"
import GanttChart, { type GanttChartExpose } from "ct-gantt-vue"

// 1. 获取组件 ref，用于调用公开方法
const ganttRef = ref<GanttChartExpose>()

// 2. 导出甘特图为图片
async function exportGanttImage() {
  // 导出当前可视区域，默认触发浏览器下载
  const dataUrl = await ganttRef.value?.exportImage({
    filename: "project-gantt.png",  // 下载文件名
    pixelRatio: 2                   // 高清导出（2 倍分辨率）
  })
  // 如果不希望自动下载，可传 download: false，仅获取 data URL
}
<\\/script>

<template>
  <!-- 通过 ref 绑定组件实例 -->
  <GanttChart ref="ganttRef" :tasks="tasks" />
</template>`.replace("<\\/script>", "</" + "script>")

// JS 版本：去掉 lang="ts" 和 ref 泛型
const exportImageCodeJS = exportImageCodeTS
  .replace(` lang="ts"`, "")
  .replace(`import GanttChart, { type GanttChartExpose } from "ct-gantt-vue"`, `import GanttChart from "ct-gantt-vue"`)
  .replaceAll(`<GanttChartExpose>`, "")
const exportImageCode = computed(() => codeLang.value === "ts" ? exportImageCodeTS : exportImageCodeJS)

const propRows = [
  ["tasks", "GanttTask[]", "是", "任务、阶段、里程碑数据。"],
  ["links", "GanttLink[]", "否", "任务依赖数据，仅计划条参与依赖。"],
  ["markers", "GanttMarker[]", "否", "时间轴上的里程碑标识。"],
  ["config", "Partial<GanttConfig>", "否", "甘特图配置对象。"],
  ["width", "string | number", "否", "组件宽度，优先级高于 config.width。"],
  ["height", "string | number", "否", "组件高度，优先级高于 config.height。"]
]

const configRows = [
  ["viewMode", "day | week | month | quarter | year", "month", "时间刻度。"],
  ["rowHeight", "number", "44", "行高。"],
  ["columnWidth", "number", "30", "右侧时间格宽度。"],
  ["columnWidths", "Partial<Record<ViewMode, number>>", "-", "按视图单独设置格子宽度。"],
  ["headerHeight", "number", "50", "表头高度。"],
  ["taskListWidth", "number", "280", "左侧表格宽度。"],
  ["width / height", "string | number", "100% / 620px", "甘特图整体宽高。"],
  ["locale", "string", "zh-CN", "本地化标识。"],
  ["firstDayOfWeek", "0 | 1", "0", "周起始日，0 表示周日，1 表示周一。"],
  ["dateFormat", "string", "YYYY-MM-DD", "日期格式配置。"],
  ["theme", "light | dark | string", "light", "主题标识，当前主要用于业务扩展。"],
  ["visibleRange", "{ start; end }", "自动计算", "固定显示的时间范围。"],
  ["columns", "CustomColumn[]", "内置列", "完整替换左侧表格列。"],
  ["customColumns", "CustomColumn[]", "[]", "在内置列后追加自定义列。"],
  ["editorFields", "GanttEditorField[]", "内置字段", "控制任务编辑抽屉的字段。"],
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
  ["fitTimelineToViewport", "boolean", "true", "数据跨度较小时是否自动补全日期列以铺满视口；关闭后 timeline 按真实数据跨度渲染，可能出现横向滚动条。"],
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
  ["planColor", "string", "否", "计划条颜色。"],
  ["calendarId", "string", "否", "任务日历 ID。"],
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
  ["color / planColor", "string", "实际条或计划条颜色编辑保存时返回。"],
  ["duration / schedulingMode", "number / auto | manual", "工期或排程方式编辑保存时返回。"],
  ["resources", "string[]", "负责人编辑保存时返回。"],
  ["calendarId", "string", "日历 ID 编辑保存时返回。"],
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
  ["exportImage(options?)", "Promise<string>", "导出当前可视区域为图片，默认下载并返回 data URL。"]
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

// 切换 TS/JS 后重新高亮
watch(codeLang, async () => {
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
    <section class="gantt-demo-hero" data-gantt-fullscreen-root>
      <div class="gantt-demo-toolbar">
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
              <button
                type="button"
                :class="{ active: demoConfig.fitTimelineToViewport !== false }"
                @click="demoConfig.fitTimelineToViewport = !demoConfig.fitTimelineToViewport"
              >
                铺满
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
       height="540px"
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
          <span class="demo-priority" :class="`level-${value || 'medium'}`">
            {{ value === "high" ? "高" : value === "low" ? "低" : "中" }}
          </span>
        </template>
        <template #cell-risk="{ value }">
          <span class="demo-risk" :class="{ danger: value === '高' }">{{ value || "低" }}</span>
        </template>
      </GanttChart>
    </section>
    <header class="docs-header">
      <button
        class="menu-button"
        type="button"
        aria-label="打开目录"
        :aria-expanded="mobileNavOpen"
        @click="mobileNavOpen = !mobileNavOpen"
      >
        <span></span><span></span><span></span>
      </button>
      <a class="docs-brand" href="#overview" @click="closeMobileNav">Vue Gantt 使用文档</a>
      <span class="docs-version">v0.1.0</span>
    </header>

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
        <p>在页面或项目中引用插件，可根据项目构建方式选择普通引用或 npm 引用。</p>
        <ul>
          <li>普通 JS 引用</li>
        </ul>
        <div class="code-block">
          <button type="button" @click="copyCode('cdn', cdnCode)">{{ copiedKey === "cdn" ? "已复制" : "复制" }}</button>
          <pre><code class="language-xml">{{ cdnCode }}</code></pre>
        </div>
        <ul>
          <li>npm 引用</li>
        </ul>
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
          说明：<code>columns</code> 会完整替换左侧表格列；<code>customColumns</code> 会在内置列后追加列。
          自定义列如果需要进入任务编辑抽屉，请设置 <code>editable: true</code>，并按需要补充 <code>type</code>、<code>options</code> 或 <code>editor</code>。
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
        <h1>1.6. 创建甘特图对象</h1>
        <p>
          在 Vue 中不需要手动实例化对象，只需要渲染 <code>GanttChart</code> 组件。
          拖拽、拉伸、编辑保存等操作会触发事件，业务侧在事件中更新数据。
        </p>
        <div class="code-block">
          <button type="button" @click="copyCode('create', createCode)">{{ copiedKey === "create" ? "已复制" : "复制" }}</button>
          <span class="lang-switch">
            <button type="button" :class="{ active: codeLang === 'ts' }" @click="codeLang = 'ts'">TS</button>
            <button type="button" :class="{ active: codeLang === 'js' }" @click="codeLang = 'js'">JS</button>
          </span>
          <pre><code :class="codeClass">{{ createCode }}</code></pre>
        </div>
      </section>

      <section id="props" class="doc-section">
        <h1>1.7. 甘特图组件属性</h1>
        <p>组件属性用于传入数据、配置和尺寸。</p>
        <div class="doc-table four-cols">
          <div class="table-head"><span>属性</span><span>类型</span><span>必填</span><span>说明</span></div>
          <div v-for="row in propRows" :key="row[0]" class="table-row">
            <code>{{ row[0] }}</code><span>{{ row[1] }}</span><span>{{ row[2] }}</span><span>{{ row[3] }}</span>
          </div>
        </div>
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
        <p>通过组件 ref 可以调用公开方法。导出图片会返回 data URL，默认同时触发下载。</p>
        <p class="doc-hint">
          当前 <code>exportImage</code> 导出的是当前可视区域，适合大数据场景下快速保存当前视图；如果需要导出全部行，建议业务侧做分页或分片导出。
        </p>
        <div class="doc-table three-cols">
          <div class="table-head"><span>方法</span><span>返回值</span><span>说明</span></div>
          <div v-for="row in methodRows" :key="row[0]" class="table-row">
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
          <li>计划条颜色由 <code>planColor</code> 控制，实际条颜色由 <code>color</code> 控制，两者互不跟随。</li>
          <li>左侧自定义列如果需要参与编辑，请同时设置 <code>editable</code>、<code>type</code> 和必要的 <code>options</code>。</li>
          <li>如果不需要内置弹窗，可关闭 <code>builtInTaskEditor</code> 或使用对应插槽完全替换。</li>
        </ul>
      </section>
    </main>
  </div>
</template>
