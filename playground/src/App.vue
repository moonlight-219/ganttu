<script setup lang="ts">
import { ref, reactive } from "vue"
import GanttChart from "@gantt/vue-gantt"
import "../../packages/vue-gantt/src/styles/gantt.css"
import type { GanttConfig, GanttLink, GanttMarker, GanttTask, PatchTask } from "@gantt/core"
import { createLargeDataset } from "./demos/basic/data"

const demoConfig = reactive<Partial<GanttConfig>>({
  viewMode: "month",
  rowHeight: 44,
  columnWidth: 34,
  headerHeight: 52,
  taskListWidth: 320,
  showPlanBar: true,
  showActualBar: true,
  editablePlan: true,
  editableActual: true,
  enableLinkCreation: true,
  autoSchedule: true,
  columns: [
    { key: "name", label: "任务名称", width: 200, editable: true },
    { key: "planStart", label: "计划开始", width: 92, type: "date", editable: true },
    { key: "planEnd", label: "计划完成", width: 92, type: "date", editable: true },
    { key: "progress", label: "进度", width: 80, type: "number", editable: true }
  ]
})

type DemoDataMode = "basic" | "medium" | "large" | "huge"

const demoAllTasks = ref<GanttTask[]>(createLargeDataset(100))
const demoDataMode = ref<DemoDataMode>("basic")
const demoLinks = ref<GanttLink[]>([])
const demoMarkers = ref<GanttMarker[]>([
  { id: "review", name: "方案评审", date: "2026-07-10", color: "#d97706" },
  { id: "launch", name: "一期上线", date: "2026-09-01", color: "#dc2626" }
])

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

function handleTaskChange(id: string, patch: PatchTask) {
  demoAllTasks.value = demoAllTasks.value.map((task) =>
    task.id === id ? mergeTaskPatch(task, patch) : task
  )
}
function handleViewModeChange(mode: string) {
  demoConfig.viewMode = mode as GanttConfig["viewMode"]
}

function handleTaskCreate(task: GanttTask) {
  demoAllTasks.value = [...demoAllTasks.value, task]
}

function handleTaskDelete(id: string) {
  demoAllTasks.value = demoAllTasks.value.filter((t) => t.id !== id)
}

function handleLinkChange(links: GanttLink[]) {
  demoLinks.value = links
}

function handleMarkerCreate(marker: GanttMarker) {
  demoMarkers.value = [...demoMarkers.value, marker]
}

function handleMarkerChange(id: string, marker: GanttMarker) {
  demoMarkers.value = demoMarkers.value.map((m) => (m.id === id ? marker : m))
}

function handleMarkerDelete(id: string) {
  demoMarkers.value = demoMarkers.value.filter((m) => m.id !== id)
}

function useDemoDataset(mode: DemoDataMode, count: number) {
  demoDataMode.value = mode
  demoAllTasks.value = createLargeDataset(count)
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

const cdnCode = `<!-- 引入 Vue Gantt 样式和脚本 -->
<link rel="stylesheet" href="./gantt/style.css" />
<script src="./vue.global.prod.js"><\\/script>
<script src="./gantt/vue-gantt.umd.cjs"><\\/script>`.replace("<\\/script>", "</" + "script>")

const npmCode = `// 安装
pnpm add vue @gantt/core @gantt/vue-gantt

// 在入口文件或业务组件中引入样式
import "@gantt/vue-gantt/style.css"

// 引入组件和类型
import GanttChart, {
  type GanttTask,
  type GanttLink,
  type GanttMarker,
  type GanttConfig,
  type PatchTask,
  type GanttChartExpose
} from "@gantt/vue-gantt"`

const containerCode = `<template>
  <div id="GanttChartDIV" class="gantt-doc-demo">
    <!-- tasks 必填；links、markers、config、height 均为可选 -->
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

const configCode = `const ganttConfig: Partial<GanttConfig> = {
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

const dataCode = `const tasks = ref<GanttTask[]>([
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

const createCode = `<script setup lang="ts">
import { ref } from "vue"
import GanttChart, { type GanttTask, type PatchTask } from "@gantt/vue-gantt"
import "@gantt/vue-gantt/style.css"

const tasks = ref<GanttTask[]>([])

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

function handleTaskChange(id: string, patch: PatchTask) {
  tasks.value = tasks.value.map((task) =>
    task.id === id ? mergeTaskPatch(task, patch) : task
  )
}
<\\/script>`.replace("<\\/script>", "</" + "script>")

const customSlotCode = `<GanttChart :tasks="tasks" :config="{ columns }">
  <!-- 自定义左侧表格单元格 -->
  <template #cell-priority="{ value, task }">
    <PriorityTag :value="value" :task="task" />
  </template>

  <!-- 自定义任务抽屉中某个字段的编辑控件 -->
  <template #editor-field-priority="{ draft, value }">
    <PrioritySelect
      :model-value="value"
      @update:model-value="draft.custom.priority = $event"
    />
  </template>
</GanttChart>`

const externalEditorCode = `<GanttChart
  :tasks="tasks"
  :config="{ builtInTaskEditor: false, builtInMarkerEditor: false }"
  @task-edit-request="openTaskDrawer"
  @marker-edit-request="openMarkerDialog"
/>`

const exportImageCode = `<script setup lang="ts">
import { ref } from "vue"
import GanttChart, { type GanttChartExpose } from "@gantt/vue-gantt"

const ganttRef = ref<GanttChartExpose>()

async function exportGanttImage() {
  // 默认导出当前可视区域并触发下载
  const dataUrl = await ganttRef.value?.exportImage({
    filename: "project-gantt.png",
    pixelRatio: 2
  })
}
<\\/script>

<template>
  <GanttChart ref="ganttRef" :tasks="tasks" />
</template>`.replace("<\\/script>", "</" + "script>")

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
  ["showPlanBar", "boolean", "true", "是否显示计划条。"],
  ["showActualBar", "boolean", "true", "是否显示实际条。"],
  ["editablePlan", "boolean", "false", "计划条是否可拖拽、拉伸。"],
  ["editableActual", "boolean", "true", "实际条是否可拖拽、拉伸。"],
  ["enableLinkCreation", "boolean", "true", "是否允许创建依赖。"],
  ["showLinkRejectionNotice", "boolean", "true", "是否显示依赖拒绝提示。"],
  ["builtInTaskEditor", "boolean", "true", "是否使用内置任务抽屉。"],
  ["builtInMarkerEditor", "boolean", "true", "是否使用内置里程碑弹窗。"],
  ["virtualScroll", "boolean", "true", "是否启用纵向虚拟滚动。"],
  ["autoSchedule", "boolean", "true", "拖动计划条时是否按依赖联动排程。"],
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
  ["link-rejected", "(rejection)", "重复、自连或循环依赖被拒绝时触发。"],
  ["view-mode-change", "(mode)", "切换时间刻度时触发。"]
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
  ["reason", "duplicate | cycle | self", "拒绝原因：重复、循环依赖或自连。"],
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
  ["scheduleByDependencies(tasks, links)", "按 FS / SS / FF / SF 依赖进行排程，返回 Result<GanttTask[]>。"],
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
</script>

<template>
  <div class="docs-page">
    <section class="gantt-demo-hero">
      <div class="gantt-demo-header">
        <h1>Vue Gantt 交互演示</h1>
        <p>拖拽条图可调整计划/实际时间 · 双击任务打开编辑器 · 连接任务创建依赖关系</p>
        <div class="gantt-demo-tools" aria-label="演示数据">
          <button type="button" :class="{ active: demoDataMode === 'basic' }" @click="useDemoDataset('basic', 100)">基础数据（100条）</button>
          <button type="button" :class="{ active: demoDataMode === 'medium' }" @click="useDemoDataset('medium', 1000)">中等数据（1000条）</button>
          <button type="button" :class="{ active: demoDataMode === 'large' }" @click="useDemoDataset('large', 3200)">大量数据（3200条）</button>
          <button type="button" :class="{ active: demoDataMode === 'huge' }" @click="useDemoDataset('huge', 5200)">超多数据（5200条）</button>
        </div>
      </div>
     <GanttChart
       :tasks="demoAllTasks"
       :links="demoLinks"
       :markers="demoMarkers"
       :config="demoConfig"
       height="540px"
        @task-change="handleTaskChange"
        @view-mode-change="handleViewModeChange"
        @task-create="handleTaskCreate"
        @task-delete="handleTaskDelete"
        @link-change="handleLinkChange"
        @marker-create="handleMarkerCreate"
        @marker-change="handleMarkerChange"
        @marker-delete="handleMarkerDelete"
      />
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
          <li>如果只需要排程或布局算法，可以单独使用 <code>@gantt/core</code>。</li>
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
          <pre><code>{{ cdnCode }}</code></pre>
        </div>
        <ul>
          <li>npm 引用</li>
        </ul>
        <div class="code-block">
          <button type="button" @click="copyCode('npm', npmCode)">{{ copiedKey === "npm" ? "已复制" : "复制" }}</button>
          <pre><code>{{ npmCode }}</code></pre>
        </div>
      </section>

      <section id="container" class="doc-section">
        <h1>1.3. 定义甘特图容器</h1>
        <p>在 Vue 模板中定义组件渲染位置，并传入任务、依赖、里程碑和配置对象。</p>
        <div class="code-block">
          <button type="button" @click="copyCode('container', containerCode)">{{ copiedKey === "container" ? "已复制" : "复制" }}</button>
          <pre><code>{{ containerCode }}</code></pre>
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
          <pre><code>{{ configCode }}</code></pre>
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
          <pre><code>{{ dataCode }}</code></pre>
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
          <pre><code>{{ createCode }}</code></pre>
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
          <pre><code>{{ customSlotCode }}</code></pre>
        </div>
        <h2>完全使用外部弹窗示例</h2>
        <div class="code-block">
          <button type="button" @click="copyCode('editor', externalEditorCode)">{{ copiedKey === "editor" ? "已复制" : "复制" }}</button>
          <pre><code>{{ externalEditorCode }}</code></pre>
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
          <pre><code>{{ exportImageCode }}</code></pre>
        </div>
      </section>

      <section id="core" class="doc-section">
        <h1>1.11. Core API 方法</h1>
        <p><code>@gantt/core</code> 不依赖 Vue，可用于服务端、其他框架或自定义渲染场景。</p>
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
          <li>同一个前置任务和后置任务之间只能保留一条依赖线。</li>
          <li>计划条颜色由 <code>planColor</code> 控制，实际条颜色由 <code>color</code> 控制，两者互不跟随。</li>
          <li>左侧自定义列如果需要参与编辑，请同时设置 <code>editable</code>、<code>type</code> 和必要的 <code>options</code>。</li>
          <li>如果不需要内置弹窗，可关闭 <code>builtInTaskEditor</code> 或使用对应插槽完全替换。</li>
        </ul>
      </section>
    </main>
  </div>
</template>
