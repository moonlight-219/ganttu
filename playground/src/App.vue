<script setup lang="ts">
import { computed, ref } from "vue"
import {
  GanttChart,
  type GanttConfig,
  type GanttLink,
  type GanttTask,
  type PatchTask
} from "./ganttImports"
import type { GanttLinkRejection, GanttMarker } from "@gantt/vue-gantt"

type ViewMode = GanttConfig["viewMode"]

const navigation = [
  { id: "overview", label: "概览" },
  { id: "install", label: "快速开始" },
  { id: "demo", label: "交互演示" },
  { id: "data", label: "数据模型" },
  { id: "config", label: "配置项" },
  { id: "columns", label: "自定义列" },
  { id: "editors", label: "编辑器" },
  { id: "dependencies", label: "任务依赖" },
  { id: "events", label: "事件" },
  { id: "core", label: "Core API" }
]

const viewModes: Array<{ value: ViewMode; label: string }> = [
  { value: "day", label: "日" },
  { value: "week", label: "周" },
  { value: "month", label: "月" }
]

const viewMode = ref<ViewMode>("day")
const editablePlan = ref(true)
const mobileNavOpen = ref(false)
const copied = ref(false)
const linkMessage = ref("")

const tasks = ref<GanttTask[]>([
  {
    id: "phase-design",
    name: "产品设计",
    type: "summary",
    plan: { start: "2026-07-01", end: "2026-07-14" },
    actual: { start: "2026-07-01", end: "2026-07-16", progress: 64 },
    color: "#64748b",
    planColor: "#cbd5e1",
    custom: { priority: "高", department: "产品" }
  },
  {
    id: "task-research",
    parentId: "phase-design",
    name: "用户调研",
    type: "task",
    plan: { start: "2026-07-01", end: "2026-07-04" },
    actual: { start: "2026-07-01", end: "2026-07-05", progress: 100 },
    resources: ["林晓"],
    color: "#3b82f6",
    planColor: "#bfdbfe",
    custom: { priority: "高", department: "产品" }
  },
  {
    id: "task-flow",
    parentId: "phase-design",
    name: "流程梳理",
    type: "task",
    plan: { start: "2026-07-05", end: "2026-07-09" },
    actual: { start: "2026-07-06", end: "2026-07-11", progress: 72 },
    resources: ["周可"],
    color: "#8b5cf6",
    planColor: "#ddd6fe",
    custom: { priority: "中", department: "产品" }
  },
  {
    id: "task-review",
    parentId: "phase-design",
    name: "方案评审",
    type: "task",
    plan: { start: "2026-07-10", end: "2026-07-14" },
    actual: { start: "2026-07-12", end: "2026-07-16", progress: 35 },
    resources: ["陈一"],
    color: "#ec4899",
    planColor: "#fbcfe8",
    custom: { priority: "高", department: "设计" }
  },
  {
    id: "phase-build",
    name: "开发交付",
    type: "summary",
    plan: { start: "2026-07-15", end: "2026-07-29" },
    actual: { start: "2026-07-17", end: "2026-07-31", progress: 28 },
    color: "#64748b",
    planColor: "#cbd5e1",
    custom: { priority: "高", department: "研发" }
  },
  {
    id: "task-ui",
    parentId: "phase-build",
    name: "界面开发",
    type: "task",
    plan: { start: "2026-07-15", end: "2026-07-21" },
    actual: { start: "2026-07-17", end: "2026-07-23", progress: 55 },
    resources: ["苏澄"],
    color: "#06b6d4",
    planColor: "#a5f3fc",
    custom: { priority: "中", department: "前端" }
  },
  {
    id: "task-api",
    parentId: "phase-build",
    name: "接口联调",
    type: "task",
    plan: { start: "2026-07-20", end: "2026-07-25" },
    actual: { start: "2026-07-22", end: "2026-07-28", progress: 22 },
    resources: ["贺川"],
    color: "#10b981",
    planColor: "#a7f3d0",
    custom: { priority: "高", department: "后端" }
  },
  {
    id: "task-release",
    parentId: "phase-build",
    name: "验收发布",
    type: "task",
    plan: { start: "2026-07-26", end: "2026-07-29" },
    actual: { start: "2026-07-29", end: "2026-07-31", progress: 0 },
    resources: ["许宁"],
    color: "#f97316",
    planColor: "#fed7aa",
    custom: { priority: "高", department: "质量" }
  }
])

const links = ref<GanttLink[]>([
  {
    id: "research-flow",
    sourceId: "task-research",
    targetId: "task-flow",
    type: "FS",
    lag: 0,
    lagUnit: "calendar"
  },
  {
    id: "flow-review",
    sourceId: "task-flow",
    targetId: "task-review",
    type: "FS",
    lag: 0,
    lagUnit: "calendar"
  },
  {
    id: "ui-release",
    sourceId: "task-ui",
    targetId: "task-release",
    type: "FS",
    lag: 1,
    lagUnit: "calendar"
  },
  {
    id: "api-release",
    sourceId: "task-api",
    targetId: "task-release",
    type: "FS",
    lag: 0,
    lagUnit: "calendar"
  }
])

const markers = ref<GanttMarker[]>([
  { id: "design-freeze", name: "设计冻结", date: "2026-07-15", color: "#d97706" },
  { id: "launch", name: "版本发布", date: "2026-07-30", color: "#2563eb" }
])

const config = computed<Partial<GanttConfig>>(() => ({
  viewMode: viewMode.value,
  rowHeight: 44,
  headerHeight: 50,
  taskListWidth: 660,
  columnWidth: viewMode.value === "day" ? 30 : viewMode.value === "week" ? 15 : 8,
  editablePlan: editablePlan.value,
  editableActual: true,
  visibleRange: { start: "2026-07-01", end: "2026-08-05" },
  columns: [
    { key: "name", label: "任务名称", width: 200, editable: true },
    { key: "status", label: "状态", width: 72 },
    { key: "owner", label: "负责人", width: 72, editable: true },
    { key: "planStart", label: "计划开始", width: 92, type: "date", editable: true },
    { key: "actualEnd", label: "实际完成", width: 92, type: "date", editable: true },
    { key: "progress", label: "进度", width: 112, type: "number", editable: true },
    {
      key: "priority",
      label: "优先级",
      width: 78,
      align: "center",
      editable: true,
      type: "select",
      options: [
        { label: "高", value: "高" },
        { label: "中", value: "中" },
        { label: "低", value: "低" }
      ]
    }
  ]
}))

const installCode = `pnpm add vue @gantt/core @gantt/vue-gantt`
const usageCode = `<script setup lang="ts">
import { ref } from "vue"
import GanttChart, {
  type GanttTask,
  type PatchTask
} from "@gantt/vue-gantt"
import "@gantt/vue-gantt/style.css"

const tasks = ref<GanttTask[]>([/* your tasks */])

function handleTaskChange(id: string, patch: PatchTask) {
  tasks.value = tasks.value.map(task =>
    task.id === id ? applyPatch(task, patch) : task
  )
}
<\\/script>

<template>
  <GanttChart
    :tasks="tasks"
    :config="{ viewMode: 'day', editablePlan: true }"
    @task-change="handleTaskChange"
  />
</template>`.replace("<\\/script>", "</" + "script>")

const taskFields = [
  ["id", "string", "必填", "任务唯一标识"],
  ["name", "string", "必填", "任务或阶段名称"],
  ["type", "task | summary | milestone", "必填", "任务类型"],
  ["plan", "DateRange", "必填", "计划开始与完成时间"],
  ["actual", "Required<DateRange>", "必填", "实际时间与进度"],
  ["parentId", "string | null", "可选", "所属阶段 ID"],
  ["color / planColor", "string", "可选", "实际条与计划条独立颜色"],
  ["resources", "string[]", "可选", "负责人列表"],
  ["custom", "Record<string, unknown>", "可选", "自定义列数据"]
]

const configFields = [
  ["viewMode", "day | week | month | quarter | year", "month", "时间刻度"],
  ["rowHeight", "number", "44", "左右统一行高"],
  ["columnWidth", "number", "30", "时间格宽度"],
  ["taskListWidth", "number", "280", "左侧表格初始宽度"],
  ["width / height", "string | number", "100% / 620px", "甘特图整体尺寸"],
  ["showPlanBar / showActualBar", "boolean", "true", "分别控制双时间条"],
  ["editablePlan / editableActual", "boolean", "false / true", "分别控制拖曳和拉伸"],
  ["enableLinkCreation", "boolean", "true", "允许从计划条创建依赖"],
  ["virtualScroll", "boolean", "true", "开启纵向虚拟滚动"],
  ["columns", "CustomColumn[]", "内置列", "完整替换左侧列"],
  ["editorFields", "GanttEditorField[]", "内置字段", "配置编辑器字段"]
]

const eventFields = [
  ["task-change", "(id, patch)", "拖曳、拉伸或保存任务"],
  ["task-create", "(task)", "创建任务"],
  ["task-delete", "(id)", "删除任务"],
  ["task-edit-request", "(request)", "请求由外部编辑任务"],
  ["link-change", "(links)", "创建、编辑或删除依赖"],
  ["link-rejected", "(rejection)", "拒绝重复、循环或自连接"],
  ["marker-change", "(id, marker)", "编辑里程碑"],
  ["marker-edit-request", "(request)", "请求由外部编辑里程碑"],
  ["view-mode-change", "(mode)", "切换时间刻度"]
]

const coreApis = [
  ["normalizeLinks", "标准化依赖，过滤重复关系和循环连接"],
  ["checkCyclicDependency", "检查依赖图是否存在循环"],
  ["scheduleByDependencies", "按 FS / SS / FF / SF 关系排程"],
  ["computeImpact", "计算一次任务修改影响的后续任务"],
  ["computeLayout", "生成任务的时间轴布局"],
  ["flattenTasks", "将阶段树展开为可渲染行"],
  ["computeTimeScale", "生成日、周、月、季度和年刻度"]
]

function applyTaskPatch(task: GanttTask, patch: PatchTask): GanttTask {
  const {
    planStart,
    planEnd,
    actualStart,
    actualEnd,
    progress,
    custom,
    ...taskPatch
  } = patch
  return {
    ...task,
    ...taskPatch,
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
    task.id === id ? applyTaskPatch(task, patch) : task
  )
}

function handleTaskDelete(id: string) {
  tasks.value = tasks.value.filter((task) => task.id !== id && task.parentId !== id)
  links.value = links.value.filter((link) => link.sourceId !== id && link.targetId !== id)
}

function handleMarkerChange(id: string, marker: GanttMarker) {
  markers.value = markers.value.map((item) => item.id === id ? marker : item)
}

function handleLinkRejected(rejection: GanttLinkRejection) {
  linkMessage.value = rejection.message
  window.setTimeout(() => {
    if (linkMessage.value === rejection.message) {
      linkMessage.value = ""
    }
  }, 2600)
}

async function copyCode() {
  await navigator.clipboard?.writeText(usageCode)
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1600)
}

async function copyInstall() {
  await navigator.clipboard?.writeText(installCode)
}

function closeMobileNav() {
  mobileNavOpen.value = false
}
</script>

<template>
  <div class="docs-app">
    <header class="topbar">
      <button
        class="mobile-menu"
        type="button"
        aria-label="打开文档导航"
        :aria-expanded="mobileNavOpen"
        @click="mobileNavOpen = !mobileNavOpen"
      >
        <span></span><span></span><span></span>
      </button>
      <a class="brand" href="#overview" @click="closeMobileNav">
        <span class="brand-mark"><i></i><i></i><i></i></span>
        <strong>Vue Gantt</strong>
      </a>
      <span class="version">v0.1.0</span>
      <nav class="top-links" aria-label="顶部导航">
        <a href="#demo">在线演示</a>
        <a href="#config">API</a>
        <a href="#core">Core</a>
      </nav>
      <a class="start-link" href="#install">开始使用 <span>→</span></a>
    </header>

    <aside class="sidebar" :class="{ open: mobileNavOpen }">
      <div class="sidebar-label">使用文档</div>
      <nav aria-label="文档目录">
        <a
          v-for="item in navigation"
          :key="item.id"
          :href="`#${item.id}`"
          @click="closeMobileNav"
        >
          <span>{{ item.label }}</span>
        </a>
      </nav>
      <div class="sidebar-card">
        <span>当前版本</span>
        <strong>Phase 1 · v0.1.0</strong>
        <small>Vue 3.5+ · TypeScript</small>
      </div>
    </aside>
    <button
      v-if="mobileNavOpen"
      class="nav-backdrop"
      type="button"
      aria-label="关闭文档导航"
      @click="closeMobileNav"
    ></button>

    <main class="docs-main">
      <section id="overview" class="hero">
        <div class="hero-copy">
          <div class="eyebrow"><span></span> Vue 3 甘特图组件</div>
          <h1>让计划与实际<br><em>清晰地发生。</em></h1>
          <p>
            面向真实项目管理场景的双时间条甘特图。计划、执行、依赖、
            阶段汇总与里程碑集中在一个可定制组件中。
          </p>
          <div class="hero-actions">
            <a class="primary-action" href="#install">快速开始 <span>→</span></a>
            <a class="secondary-action" href="#demo">查看演示</a>
          </div>
          <div class="hero-meta">
            <span><b>52</b> 项回归测试</span>
            <span><b>3,000+</b> 行虚拟滚动</span>
            <span><b>0</b> UI 框架依赖</span>
          </div>
        </div>
        <div class="hero-preview" aria-label="甘特图能力概览">
          <div class="preview-window">
            <div class="preview-head">
              <div><i></i><i></i><i></i></div>
              <span>project-roadmap.vue</span>
              <b>Live</b>
            </div>
            <div class="preview-body">
              <div class="preview-table">
                <span class="preview-title">任务</span>
                <span>用户调研</span>
                <span>流程梳理</span>
                <span>方案评审</span>
                <span>界面开发</span>
                <span>验收发布</span>
              </div>
              <div class="preview-timeline">
                <div class="preview-days"><span>08</span><span>12</span><span>16</span><span>20</span><span>24</span><span>28</span></div>
                <i class="today-line"></i>
                <div class="mini-row"><b class="plan p1"></b><b class="actual a1"></b></div>
                <div class="mini-row"><b class="plan p2"></b><b class="actual a2"></b></div>
                <div class="mini-row"><b class="plan p3"></b><b class="actual a3 late"></b></div>
                <div class="mini-row"><b class="plan p4"></b><b class="actual a4"></b></div>
                <div class="mini-row"><b class="plan p5"></b><b class="actual a5"></b></div>
              </div>
            </div>
          </div>
          <div class="floating-card card-plan">
            <i></i>
            <span>计划 / 实际</span>
            <b>独立控制</b>
          </div>
          <div class="floating-card card-dependency">
            <i>↗</i>
            <span>依赖排程</span>
            <b>实时联动</b>
          </div>
        </div>
      </section>

      <section class="feature-strip" aria-label="核心能力">
        <article>
          <span class="feature-number">01</span>
          <div><strong>双时间条</strong><small>计划与实际独立颜色、显隐和拖曳</small></div>
        </article>
        <article>
          <span class="feature-number">02</span>
          <div><strong>依赖排程</strong><small>四类关系、延迟、循环和重复校验</small></div>
        </article>
        <article>
          <span class="feature-number">03</span>
          <div><strong>自由定制</strong><small>列、单元格、编辑器与业务数据插槽</small></div>
        </article>
      </section>

      <section id="install" class="doc-section">
        <div class="section-heading">
          <span>01 · GET STARTED</span>
          <h2>快速开始</h2>
          <p>两个包，一份数据，几分钟内完成第一个甘特图。</p>
        </div>
        <div class="install-grid">
          <div class="install-card">
            <div class="card-kicker">安装依赖</div>
            <div class="terminal-line">
              <span>$</span><code>{{ installCode }}</code>
              <button type="button" @click="copyInstall">复制</button>
            </div>
            <ul class="check-list">
              <li><i>✓</i> Vue 3.5+</li>
              <li><i>✓</i> 完整 TypeScript 类型</li>
              <li><i>✓</i> ESM 与 CommonJS</li>
            </ul>
          </div>
          <div class="install-note">
            <span class="note-icon">i</span>
            <div>
              <strong>受控组件</strong>
              <p>拖曳、编辑和依赖操作通过事件返回，业务端更新 tasks、links 和 markers，数据流始终可追踪。</p>
            </div>
          </div>
        </div>
        <div class="code-card">
          <div class="code-head">
            <div><span class="vue-dot"></span> App.vue</div>
            <button type="button" @click="copyCode">{{ copied ? "已复制" : "复制代码" }}</button>
          </div>
          <pre><code>{{ usageCode }}</code></pre>
        </div>
      </section>

      <section id="demo" class="doc-section wide-section">
        <div class="section-heading inline-heading">
          <div>
            <span>02 · PLAYGROUND</span>
            <h2>真实组件，直接体验</h2>
            <p>拖曳任务条、调整日期、双击编辑，或从计划条两端创建依赖。</p>
          </div>
          <div class="demo-controls">
            <div class="segmented">
              <button
                v-for="mode in viewModes"
                :key="mode.value"
                type="button"
                :class="{ active: viewMode === mode.value }"
                @click="viewMode = mode.value"
              >{{ mode.label }}</button>
            </div>
            <label class="toggle">
              <input v-model="editablePlan" type="checkbox">
              <span></span>
              计划可拖曳
            </label>
          </div>
        </div>
        <div class="demo-shell">
          <div class="demo-browser">
            <span></span><span></span><span></span>
            <b>Interactive demo</b>
            <small>双击任务条可编辑</small>
          </div>
          <div v-if="linkMessage" class="demo-message">{{ linkMessage }}</div>
          <GanttChart
            :tasks="tasks"
            :links="links"
            :markers="markers"
            :config="config"
            height="560px"
            @task-change="handleTaskChange"
            @task-create="tasks.push($event)"
            @task-delete="handleTaskDelete"
            @link-change="links = $event"
            @link-rejected="handleLinkRejected"
            @marker-create="markers.push($event)"
            @marker-change="handleMarkerChange"
            @marker-delete="markers = markers.filter((item) => item.id !== $event)"
          >
            <template #cell-priority="{ value }">
              <span class="priority-pill" :class="`priority-${value}`">{{ value }}</span>
            </template>
          </GanttChart>
        </div>
      </section>

      <section id="data" class="doc-section">
        <div class="section-heading">
          <span>03 · DATA</span>
          <h2>清晰的数据模型</h2>
          <p>任务、阶段、依赖与里程碑各自独立，又能自然组合。</p>
        </div>
        <div class="api-table">
          <div class="api-row api-header"><span>字段</span><span>类型</span><span>要求</span><span>说明</span></div>
          <div v-for="field in taskFields" :key="field[0]" class="api-row">
            <code>{{ field[0] }}</code><span>{{ field[1] }}</span><small>{{ field[2] }}</small><p>{{ field[3] }}</p>
          </div>
        </div>
        <div class="callout">
          <strong>颜色不再互相跟随</strong>
          <p><code>color</code> 控制实际条，<code>planColor</code> 控制计划条；未设置计划色时使用全局 <code>taskColors.plan</code>。</p>
        </div>
      </section>

      <section id="config" class="doc-section">
        <div class="section-heading">
          <span>04 · CONFIGURATION</span>
          <h2>配置项</h2>
          <p>尺寸、刻度、交互和展示逻辑都可以按项目场景调整。</p>
        </div>
        <div class="api-table config-table">
          <div class="api-row api-header"><span>配置</span><span>类型</span><span>默认值</span><span>说明</span></div>
          <div v-for="field in configFields" :key="field[0]" class="api-row">
            <code>{{ field[0] }}</code><span>{{ field[1] }}</span><small>{{ field[2] }}</small><p>{{ field[3] }}</p>
          </div>
        </div>
      </section>

      <section id="columns" class="doc-section split-section">
        <div class="section-heading">
          <span>05 · CUSTOM COLUMNS</span>
          <h2>像表格插槽一样自由</h2>
          <p>完整替换列、追加业务列、格式化内容，或用 Vue 插槽渲染任意单元格。</p>
        </div>
        <div class="split-content">
          <div class="capability-list">
            <article><b>01</b><div><strong>列级配置</strong><p>宽度、对齐、显示、编辑状态、输入类型和下拉选项。</p></div></article>
            <article><b>02</b><div><strong>作用域插槽</strong><p><code>cell-{key}</code> 与 <code>header-{key}</code> 精准替换。</p></div></article>
            <article><b>03</b><div><strong>业务字段</strong><p>自定义值统一存放在 <code>task.custom</code>，保持模型干净。</p></div></article>
          </div>
          <div class="mini-code">
            <div class="code-head"><div><span class="vue-dot"></span> columns.ts</div></div>
            <pre><code>const columns = [
  { key: "name", label: "任务", width: 220 },
  {
    key: "priority",
    label: "优先级",
    type: "select",
    editable: true,
    options: [
      { label: "高", value: "high" },
      { label: "中", value: "medium" }
    ]
  }
]</code></pre>
          </div>
        </div>
      </section>

      <section id="editors" class="doc-section">
        <div class="section-heading">
          <span>06 · EDITORS</span>
          <h2>内置好用，也能完全替换</h2>
          <p>默认提供任务抽屉和里程碑弹窗，同时把设计权完整交给业务端。</p>
        </div>
        <div class="editor-options">
          <article class="option-card featured">
            <span>推荐</span>
            <div class="option-icon">◇</div>
            <h3>插槽替换</h3>
            <p>保留组件的 draft、保存和删除逻辑，仅替换 UI。</p>
            <code>#task-editor</code>
          </article>
          <article class="option-card">
            <div class="option-icon">≡</div>
            <h3>字段配置</h3>
            <p>控制每个字段的显示、只读、类型和选项。</p>
            <code>editorFields</code>
          </article>
          <article class="option-card">
            <div class="option-icon">↗</div>
            <h3>外部编辑器</h3>
            <p>关闭内置编辑器，在业务系统中打开自己的抽屉。</p>
            <code>task-edit-request</code>
          </article>
        </div>
      </section>

      <section id="dependencies" class="doc-section">
        <div class="section-heading">
          <span>07 · DEPENDENCIES</span>
          <h2>可靠的任务依赖</h2>
          <p>依赖只建立在计划条上，实际执行保持独立，避免计划逻辑与现场数据混淆。</p>
        </div>
        <div class="dependency-grid">
          <article><strong>FS</strong><span>完成 → 开始</span><p>最常用的前后任务关系</p></article>
          <article><strong>SS</strong><span>开始 → 开始</span><p>两个任务协同启动</p></article>
          <article><strong>FF</strong><span>完成 → 完成</span><p>约束后置任务完成时间</p></article>
          <article><strong>SF</strong><span>开始 → 完成</span><p>适合轮班和交接场景</p></article>
        </div>
        <div class="rule-line">
          <span><i>✓</i> 同向任务对仅一条</span>
          <span><i>✓</i> 自动拒绝循环</span>
          <span><i>✓</i> 支持日历天与工作日延迟</span>
          <span><i>✓</i> 可替换拒绝提示</span>
        </div>
      </section>

      <section id="events" class="doc-section">
        <div class="section-heading">
          <span>08 · EVENTS</span>
          <h2>完整事件</h2>
          <p>所有数据修改都通过明确事件交还给业务端。</p>
        </div>
        <div class="api-table event-table">
          <div class="api-row api-header"><span>事件</span><span>参数</span><span>触发场景</span></div>
          <div v-for="field in eventFields" :key="field[0]" class="api-row">
            <code>{{ field[0] }}</code><span>{{ field[1] }}</span><p>{{ field[2] }}</p>
          </div>
        </div>
      </section>

      <section id="core" class="doc-section core-section">
        <div class="core-copy">
          <div class="section-heading">
            <span>09 · HEADLESS CORE</span>
            <h2>只要算法，不要界面？</h2>
            <p><code>@gantt/core</code> 不依赖 Vue，可用于服务端、其他框架或完全自定义的渲染器。</p>
          </div>
          <div class="core-command"><span>$</span><code>pnpm add @gantt/core</code></div>
        </div>
        <div class="core-list">
          <article v-for="api in coreApis" :key="api[0]">
            <code>{{ api[0] }}()</code>
            <p>{{ api[1] }}</p>
          </article>
        </div>
      </section>

      <footer class="docs-footer">
        <div class="brand footer-brand">
          <span class="brand-mark"><i></i><i></i><i></i></span>
          <strong>Vue Gantt</strong>
        </div>
        <p>为清晰的项目计划与真实的执行过程而设计。</p>
        <a href="#overview">返回顶部 ↑</a>
      </footer>
    </main>
  </div>
</template>
