# Vue Gantt 甘特图

一个由 `ct-gantt-core` 和 `ct-gantt-vue` 组成的 Vue 3 甘特图项目，支持计划/实际双时间条、阶段汇总、任务依赖、里程碑、虚拟滚动、自定义表格列和可替换编辑器。

## 包说明

| 包 | 用途 |
| --- | --- |
| `ct-gantt-core` | 数据类型、日期工具、依赖标准化、循环检测、排程、布局和影响计算，不包含任何界面 |
| `ct-gantt-vue` | 完整 Vue 甘特图组件和 `createGantt()` 原生实例入口，包含左侧表格、右侧时间轴以及内置编辑界面 |

如果只想自行实现弹窗，可以继续使用 `ct-gantt-vue`，关闭内置编辑器并监听编辑请求；如果连甘特图界面也不需要，只使用排程算法，则单独安装 `ct-gantt-core`。

## 安装

```bash
pnpm add ct-gantt-vue
```

Vue 版本要求：`^3.5.0`。
非 Vue 项目使用 `createGantt()` 时，因为当前原生入口复用 Vue 渲染器，需要同时安装运行时：`pnpm add vue ct-gantt-vue`。

在应用入口或使用甘特图的组件中引入样式：

```ts
import "ct-gantt-vue/style.css"
```

## 最小示例

```vue
<script setup lang="ts">
import { ref } from "vue"
import GanttChart, {
  type GanttConfig,
  type GanttLink,
  type GanttLinkRejection,
  type GanttMarker,
  type GanttTask,
  type PatchTask
} from "ct-gantt-vue"
import "ct-gantt-vue/style.css"

const tasks = ref<GanttTask[]>([
  {
    id: "phase-1",
    name: "第一阶段",
    type: "summary",
    plan: { start: "2026-07-01", end: "2026-07-20" },
    actual: { start: "2026-07-01", end: "2026-07-22", progress: 45 }
  },
  {
    id: "task-a",
    parentId: "phase-1",
    name: "任务 A",
    type: "task",
    plan: { start: "2026-07-01", end: "2026-07-05" },
    actual: { start: "2026-07-02", end: "2026-07-07", progress: 100 },
    resources: ["张三"],
    color: "#2563eb",
    planColor: "#cbd5e1"
  },
  {
    id: "task-b",
    parentId: "phase-1",
    name: "任务 B",
    type: "task",
    plan: { start: "2026-07-06", end: "2026-07-12" },
    actual: { start: "2026-07-08", end: "2026-07-15", progress: 30 },
    resources: ["李四"],
    color: "#10b981",
    planColor: "#fde68a"
  }
])

const links = ref<GanttLink[]>([
  {
    id: "task-a-to-task-b",
    sourceId: "task-a",
    targetId: "task-b",
    type: "FS",
    lag: 0,
    lagUnit: "calendar"
  }
])

const markers = ref<GanttMarker[]>([
  {
    id: "review",
    name: "方案评审",
    date: "2026-07-15",
    color: "#d97706"
  }
])

const config: Partial<GanttConfig> = {
  viewMode: "day",
  rowHeight: 44,
  columnWidth: 30,
  taskListWidth: 720,
  height: 680,
  editablePlan: true,
  editableActual: true,
  visibleRange: {
    start: "2026-07-01",
    end: "2026-07-31"
  }
}

function applyTaskPatch(task: GanttTask, patch: PatchTask): GanttTask {
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
    task.id === id ? applyTaskPatch(task, patch) : task
  )
}

function handleTaskDelete(id: string) {
  tasks.value = tasks.value.filter(
    (task) => task.id !== id && task.parentId !== id
  )
  links.value = links.value.filter(
    (link) => link.sourceId !== id && link.targetId !== id
  )
}

function handleLinkRejected(rejection: GanttLinkRejection) {
  console.warn(rejection.message)
}
</script>

<template>
  <GanttChart
    :tasks="tasks"
    :links="links"
    :markers="markers"
    :config="config"
    @task-change="handleTaskChange"
    @task-create="tasks.push($event)"
    @task-delete="handleTaskDelete"
    @link-change="links = $event"
    @link-rejected="handleLinkRejected"
    @marker-create="markers.push($event)"
    @marker-change="(id, marker) => {
      markers = markers.map((item) => item.id === id ? marker : item)
    }"
    @marker-delete="markers = markers.filter((item) => item.id !== $event)"
  />
</template>
```

> `GanttChart` 是受控组件。拖曳、拉伸、编辑、创建和删除操作会抛出事件，但不会直接改写父组件传入的数据；业务端必须根据事件更新 `tasks`、`links` 或 `markers`。

## 原生实例 API

不使用 Vue 组件时，可以在任意已挂载的 DOM 容器中创建甘特图：

| 接入方式 | 适用场景 | 数据与生命周期 |
| --- | --- | --- |
| `GanttChart` 组件 | Vue 项目（推荐） | 自动处理挂载和销毁；父组件通过 props 和事件维护受控数据 |
| `createGantt()` | 原生 HTML、Vue、React 等浏览器项目 | 手动处理生命周期；实例自动维护交互数据，外部数据通过 setter 同步 |

```ts
import {
  createGantt,
  type GanttTask
} from "ct-gantt-vue"
import "ct-gantt-vue/style.css"

const tasks: GanttTask[] = [
  {
    id: "task-1",
    name: "需求确认",
    type: "task",
    plan: { start: "2026-08-03", end: "2026-08-07" },
    actual: { start: "2026-08-03", end: "2026-08-07", progress: 30 }
  }
]

const gantt = createGantt("#gantt", {
  tasks,
  height: 620,
  onTaskChange(id, patch) {
    console.log(id, patch)
  }
})

gantt.setTask("task-1", { progress: 60 })
gantt.scrollToDate("2026-08-05")
gantt.zoomToFit()

// 页面或框架组件卸载时调用。
gantt.destroy()
```

`createGantt()` 接受 CSS 选择器或 `HTMLElement`。实例会自动维护界面操作产生的任务、依赖和里程碑变更；业务端从接口重新获取数据后，可以调用 `setTasks()`、`setLinks()` 或 `setMarkers()` 同步。

### CreateGanttOptions

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `tasks` | `GanttTask[]` | `[]` | 初始任务数据 |
| `links` | `GanttLink[]` | `[]` | 初始依赖数据 |
| `markers` | `GanttMarker[]` | `[]` | 初始时间轴里程碑 |
| `config` | `Partial<GanttConfig>` | `{}` | 甘特图配置 |
| `width` | `string \| number` | `100%` | 实例宽度；数字按像素处理，字符串支持 CSS 尺寸单位 |
| `height` | `string \| number` | `620px` | 实例高度；数字按像素处理，字符串支持 CSS 尺寸单位 |
| `onTaskChange/Create/Delete` | `function` | - | 任务变更回调 |
| `onTaskEditRequest` | `function` | - | 外部任务编辑请求 |
| `onMarkerCreate/Change/Delete` | `function` | - | 里程碑变更回调 |
| `onMarkerEditRequest` | `function` | - | 外部里程碑编辑请求 |
| `onLinkChange/onLinkRejected` | `function` | - | 依赖变更和拒绝回调 |

### 在 Vue 中使用原生实例

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import { createGantt, type GanttInstance, type GanttTask } from "ct-gantt-vue"

const containerRef = ref<HTMLElement | null>(null)
const tasks = ref<GanttTask[]>([])
let gantt: GanttInstance | null = null

onMounted(() => {
  gantt = createGantt(containerRef.value!, { tasks: tasks.value, height: 620 })
})

watch(tasks, (value) => gantt?.setTasks(value), { deep: true })
onBeforeUnmount(() => gantt?.destroy())
</script>

<template>
  <div ref="containerRef" style="width: 100%; height: 620px"></div>
</template>
```

### 在 React 中使用原生实例

```tsx
import { useEffect, useRef } from "react"
import { createGantt, type GanttInstance, type GanttTask } from "ct-gantt-vue"

export function NativeGantt({ tasks }: { tasks: GanttTask[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const ganttRef = useRef<GanttInstance | null>(null)

  useEffect(() => {
    ganttRef.current = createGantt(containerRef.current!, { tasks, height: 620 })
    return () => {
      ganttRef.current?.destroy()
      ganttRef.current = null
    }
  }, [])

  useEffect(() => ganttRef.current?.setTasks(tasks), [tasks])
  return <div ref={containerRef} style={{ width: "100%", height: 620 }} />
}
```

React 开发模式启用 Strict Mode 时 effect 可能执行两次，清理函数中的 `destroy()` 必须保留。

### GanttInstance 方法

| 方法 | 返回值 | 说明 |
| --- | --- | --- |
| `getContainer()` | `HTMLElement` | 获取挂载容器 |
| `getTasks/getLinks/getMarkers()` | 数据副本 | 读取当前实例数据 |
| `getConfig()` | `Partial<GanttConfig>` | 读取当前配置 |
| `setTasks/setLinks/setMarkers(data)` | `void` | 替换实例数据 |
| `setTask(id, patch)` | `void` | 更新单个任务 |
| `addTask(task)/removeTask(id)` | `void` | 增删任务 |
| `setConfig(config)` | `void` | 合并配置 patch |
| `setSize(width?, height?)` | `void` | 调整实例尺寸 |
| `scrollToDate/scrollToTask` | `void` | 滚动到日期或任务 |
| `zoomToFit(padding?)` | `void` | 缩放日期范围以适配视口 |
| `exportImage(options?)` | `Promise<string>` | 导出当前可视区域 |
| `enterFullscreen/exitFullscreen/toggleFullscreen` | `Promise<void>` | 控制浏览器全屏 |
| `openCreateTask/openCreateMarker` | `void` | 打开内置新建编辑器 |
| `getEngine()` | `GanttEngine \| null` | 获取底层引擎 |
| `isDestroyed()` | `boolean` | 判断实例是否销毁 |
| `destroy()` | `void` | 卸载并清理资源，可重复调用 |

当前原生入口复用 Vue 渲染器。非 Vue 项目可以使用该 API，但仍需安装 Vue 3.5+；Vue 和 React 中应在组件挂载后创建实例，并在卸载回调中调用 `destroy()`。Vue 项目优先使用 `GanttChart` 组件，可省去生命周期和数据同步代码。

## 组件属性

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `tasks` | `GanttTask[]` | 必填 | 任务、阶段和任务型里程碑数据 |
| `links` | `GanttLink[]` | `[]` | 独立依赖关系数据 |
| `markers` | `GanttMarker[]` | `[]` | 固定在时间轴顶部的里程碑标识和竖线 |
| `config` | `Partial<GanttConfig>` | `{}` | 甘特图配置 |
| `width` | `string \| number` | `config.width` 或 `100%` | 组件宽度；数字按像素处理 |
| `height` | `string \| number` | `config.height` 或 `620px` | 组件高度；数字按像素处理，字符串支持 CSS 尺寸单位 |

也可以使用 `onTaskChange`、`onLinkChange` 等同名回调属性，效果与 Vue 事件监听一致。

### 宽高尺寸

`width` 和 `height` 可以传数字或 CSS 尺寸字符串。数字会自动转换为 `px`；字符串会原样应用，因此支持 `px`、`%`、`vh`、`vw` 等单位。组件属性的优先级高于 `config.width` / `config.height`，原生实例也遵循相同规则。

```vue
<GanttChart :height="620" />
<GanttChart height="620px" />
<GanttChart height="70vh" />
<GanttChart height="100%" />
```

使用百分比高度时，父级容器必须具有可计算的明确高度，否则浏览器无法确定 `100%` 对应的实际像素值：

```vue
<div style="height: 720px">
  <GanttChart height="100%" />
</div>
```

原生实例可以在创建时或运行中设置尺寸：

```ts
const gantt = createGantt(container, { width: "100%", height: 620 })
gantt.setSize("100%", "70vh")
```

## 任务数据

```ts
interface GanttTask {
  id: string
  name: string
  type: "task" | "milestone" | "summary"
  plan: {
    start: string | Date
    end: string | Date
    progress?: number
  }
  actual: {
    start: string | Date
    end: string | Date
    progress: number
  }
  dependencies?: Dependency[]
  parentId?: string | null
  color?: string
  planColor?: string
  calendarId?: string
  resources?: string[]
  segments?: Array<{ start: string | Date; end: string | Date }>
  constraint?: {
    type: "SNET" | "SNLT" | "MSO" | "MFO" | "ASAP" | "ALAP"
    date?: string | Date
  }
  schedulingMode?: "auto" | "manual"
  duration?: number
  custom?: Record<string, unknown>
}
```

注意事项：

- 推荐使用 `YYYY-MM-DD` 日期字符串，避免时区造成日期偏移。
- `summary` 表示阶段，子任务通过 `parentId` 归属阶段；有子任务时，阶段计划日期、实际日期和进度会实时汇总并在编辑器中只读，空阶段仍可手动编辑。
- `color` 控制实际条颜色，`planColor` 控制计划条内部进度颜色，两者互不跟随。
- 计划条外部底色统一使用 `config.taskColors.plan`；未设置 `planColor` 时，内部进度颜色使用 `config.taskColors.progress`。
- `resources` 是负责人数组，内置编辑器中使用逗号分隔录入多人。
- 用户自定义字段放在 `custom` 中。
- `constraint` 会参与 Core 的影响冲突检查；`segments` 已包含在数据类型中，但当前 Vue 组件尚未绘制分段任务条。

## 配置项

| 配置 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `viewMode` | `day \| week \| month \| quarter \| year` | `month` | 时间刻度 |
| `rowHeight` | `number` | `44` | 左右两侧统一行高 |
| `columnWidth` | `number` | `30` | 当前时间刻度单元宽度 |
| `columnWidths` | `Partial<Record<ViewMode, number>>` | — | 为不同刻度分别设置单元宽度 |
| `headerHeight` | `number` | `50` | 时间轴表头高度 |
| `taskListWidth` | `number` | `280` | 左侧表格初始宽度 |
| `width` / `height` | `string \| number` | — | 甘特图整体尺寸；数字按 `px`，字符串支持 `px`、`%`、`vh`、`vw` 等 CSS 单位 |
| `locale` | `string` | `zh-CN` | 区域标识，当前作为预留配置 |
| `firstDayOfWeek` | `0 \| 1` | `0` | 每周第一天，`0` 为周日、`1` 为周一 |
| `dateFormat` | `string` | `YYYY-MM-DD` | 日期格式标识；当前内置输入仍使用 `YYYY-MM-DD` |
| `theme` | `light \| dark \| string` | — | 主题名称预留项；当前主题通过 CSS 覆盖 |
| `visibleRange` | `{ start, end }` | 自动计算 | 初始时间轴范围；边缘拖拽可向两端扩展，重新传入配置时重置 |
| `columns` | `CustomColumn[]` | 内置列 | 完整替换左侧列；对应的内置编辑字段会同步显示或隐藏 |
| `customColumns` | `CustomColumn[]` | `[]` | 在默认列后追加自定义列 |
| `editorFields` | `GanttEditorField[]` | 内置字段 | 控制编辑器字段显示、编辑状态和输入类型；明确设置 `visible` 时优先于列配置 |
| `showPlanBar` | `boolean` | `true` | 是否展示计划条 |
| `showActualBar` | `boolean` | `true` | 是否展示实际条 |
| `editablePlan` | `boolean` | `false` | 是否允许拖曳和拉伸计划条 |
| `editableActual` | `boolean` | `true` | 是否允许拖曳和拉伸实际条 |
| `editable` | `boolean` | `true` | 全局编辑开关 |
| `enableLinkCreation` | `boolean` | `true` | 是否允许从计划条创建依赖 |
| `showLinkRejectionNotice` | `boolean` | `true` | 是否展示重复、循环或自连接提示 |
| `builtInTaskEditor` | `boolean` | `true` | 是否使用内置任务抽屉 |
| `builtInMarkerEditor` | `boolean` | `true` | 是否使用内置里程碑弹窗 |
| `virtualScroll` | `boolean` | `true` | 是否开启纵向虚拟滚动 |
| `autoSchedule` | `boolean` | `true` | 是否根据依赖自动排程 |
| `taskColors` | `object` | 见下方 | 全局任务条颜色 |

颜色默认值：

```ts
taskColors: {
  task: "#2563eb",
  summary: "#475467",
  milestone: "#d97706",
  plan: "#cbd5e1",
  progress: "#0f766e"
}
```

不同时间刻度使用不同格宽：

```ts
const config: Partial<GanttConfig> = {
  viewMode: "day",
  columnWidths: {
    day: 30,
    week: 16,
    month: 8,
    quarter: 5,
    year: 3
  }
}
```

## 左侧自定义列

`columns` 会完整替换默认列；`customColumns` 只会追加到默认列后方。自定义字段通常从 `task.custom[column.key]` 读取。任务名称、负责人、计划/实际日期和进度等内置列被隐藏或省略时，对应编辑字段也会隐藏；只有明确设置 `editorFields[].visible` 时才会覆盖列联动。

```ts
const config: Partial<GanttConfig> = {
  columns: [
    { key: "name", label: "任务名称", width: 220, editable: true },
    { key: "owner", label: "负责人", width: 90, editable: true },
    {
      key: "priority",
      label: "优先级",
      width: 90,
      align: "center",
      type: "select",
      editable: true,
      options: [
        { label: "高", value: "high" },
        { label: "中", value: "medium" },
        { label: "低", value: "low" }
      ],
      cellClass: (task) => `priority-${task.custom?.priority ?? "medium"}`
    },
    {
      key: "budget",
      label: "预算",
      width: 100,
      align: "right",
      type: "number",
      editable: false,
      formatter: (value) => `¥${Number(value ?? 0).toLocaleString()}`
    }
  ]
}
```

`editable` 控制该字段在内置任务编辑器中是否可修改；表格展示样式可以通过列配置或插槽定制。

列配置支持：

- `visible`：是否显示。
- `width`：列宽，最小按 48px 处理。
- `align`：左、中、右对齐。
- `formatter(value, task)`：格式化文本。
- `cellClass`：静态类名或根据任务计算类名。
- `cellStyle`：静态样式或根据任务计算样式。
- `render(task)`：返回 `{ text, className }`。
- `editor`：单独覆盖编辑器中的 `visible`、`editable`、`type`、`options` 等设置。

### 表格插槽

```vue
<GanttChart :tasks="tasks" :config="config">
  <template #header-priority="{ column }">
    <strong>{{ column.label }}</strong>
  </template>

  <template #cell-priority="{ value }">
    <span :class="`priority-tag priority-${value}`">
      {{ value }}
    </span>
  </template>

  <!-- 未提供 cell-{key} 时的通用后备插槽 -->
  <template #cell="{ task, column, value, rowIndex }">
    <span :title="`${task.name} / 第 ${rowIndex + 1} 行`">
      {{ value }}
    </span>
  </template>
</GanttChart>
```

可用表格插槽：

| 插槽 | 参数 |
| --- | --- |
| `header-{key}` | `{ column }` |
| `header` | `{ column }` |
| `cell-{key}` | `{ task, column, value, rowIndex }` |
| `cell` | `{ task, column, value, rowIndex }` |

点击左侧行或右侧时间轴行会同步高亮整行；计划条和实际条自身不会额外增加选中发光效果。

## 编辑器定制

### 配置内置任务编辑器

```ts
const config: Partial<GanttConfig> = {
  editorFields: [
    { key: "name", label: "任务名称", editable: true },
    { key: "resources", label: "负责人", visible: true, editable: true },
    { key: "progress", label: "进度", type: "number", editable: false }
  ]
}
```

内置字段包括：

`name`、`type`、`parentId`、`planStart`、`planEnd`、`actualStart`、`actualEnd`、`progress`、`resources`、`duration`、`calendarId`、`schedulingMode`、`color`、`planColor`。

默认编辑器只展示常用任务字段。`duration` 是依赖排程使用的持续天数，不等同于实际用时；通常直接由计划开始和计划完成日期推导，无需单独编辑。`calendarId` 使用 `standard`（周一至周五）或 `delivery`（包含周末）作为内部值，界面通过“工作日历”下拉框展示易懂名称；当前版本会保存该配置，但日期拖拽与依赖计算仍按自然日执行。`calendarId`、`schedulingMode`、`color` 和 `planColor` 属于高级字段，默认隐藏；需要时通过 `editorFields[].visible: true` 开启。`schedulingMode: "auto"` 会跟随依赖联动，`"manual"` 则保持手动日期。自定义表格列仅在 `editable: true` 时自动进入编辑器，只读展示列不会占用表单空间；若仍需在弹窗中只读展示，可额外设置对应 `editorFields` 的 `visible: true, editable: false`。

### 替换整个任务编辑器

保持 `builtInTaskEditor: true`，提供 `task-editor` 插槽即可替换内置抽屉：

```vue
<GanttChart :tasks="tasks" :config="config">
  <template #task-editor="{ mode, draft, fields, save, close, remove }">
    <MyTaskDrawer
      v-model:name="draft.name"
      v-model:progress="draft.progress"
      :mode="mode"
      :fields="fields"
      @save="save"
      @close="close"
      @delete="remove"
    />
  </template>
</GanttChart>
```

局部替换字段和底部按钮：

```vue
<template #editor-field-priority="{ draft, value }">
  <MyPrioritySelect
    :model-value="value"
    @update:model-value="draft.custom.priority = $event"
  />
</template>

<template #editor-footer="{ save, close }">
  <footer>
    <button @click="close">取消</button>
    <button @click="save">保存</button>
  </footer>
</template>
```

### 完全由业务端打开编辑器

```vue
<GanttChart
  :tasks="tasks"
  :config="{ builtInTaskEditor: false }"
  @task-edit-request="openBusinessTaskDrawer"
/>
```

`taskEditRequest` 提供：

```ts
interface GanttTaskEditRequest {
  mode: "create" | "edit"
  task?: GanttTask
  taskType: GanttTask["type"]
  draft: GanttTaskEditorDraft
  fields: GanttEditorField[]
}
```

外部编辑器保存后由业务端直接更新 `tasks`，不需要调用组件内部方法。

里程碑编辑同样支持两种方式：

- 使用 `marker-editor` 插槽替换内置弹窗。
- 设置 `builtInMarkerEditor: false`，监听 `marker-edit-request`。

## 计划条、实际条与拖曳

- 计划条固定展示在实际条上方。
- `showPlanBar` 和 `showActualBar` 可分别控制显示。
- `editablePlan` 和 `editableActual` 可分别控制拖曳/拉伸。
- 双击计划条或实际条都会触发任务编辑。
- 拖曳期间会在组件内实时预览左侧数据、阶段汇总和延期状态，松开鼠标后抛出任务变化。
- 计划条依赖约束只作用于计划排程；实际条拖曳不会连带移动依赖任务。
- 实际条延期部分使用红色覆盖层，并限制在任务条圆角范围内。

## 任务依赖

依赖连接只从计划条创建，实际条不提供连接点。

```ts
interface GanttLink {
  id: string
  sourceId: string
  targetId: string
  type: "FS" | "SS" | "FF" | "SF"
  lag?: number
  lagUnit?: "calendar" | "working"
}
```

依赖类型：

| 类型 | 含义 |
| --- | --- |
| `FS` | 前置任务完成后，后置任务才能开始 |
| `SS` | 前置任务开始后，后置任务才能开始 |
| `FF` | 前置任务完成后，后置任务才能完成 |
| `SF` | 前置任务开始后，后置任务才能完成 |

连接规则：

- 同一方向的任务 A → B 只允许一条依赖。
- 自连接、重复连接和循环连接会被拒绝。
- 拒绝时默认显示内置提示，并触发 `linkRejected`。
- 设置 `showLinkRejectionNotice: false` 后可只使用业务端 Toast。

```vue
<GanttChart
  :tasks="tasks"
  :links="links"
  :config="{ showLinkRejectionNotice: false }"
  @link-change="links = $event"
  @link-rejected="({ message }) => ElMessage.warning(message)"
/>
```

拒绝事件结构：

```ts
interface GanttLinkRejection {
  reason: "duplicate" | "cycle" | "self"
  sourceId: string
  targetId: string
  message: string
}
```

任务也可以通过自身的 `dependencies` 提供依赖，但建议一个项目统一使用独立的 `links` 数组，便于增删和持久化。

## 里程碑

时间轴标识使用 `markers`：

```ts
const markers: GanttMarker[] = [
  {
    id: "release",
    name: "版本发布",
    date: "2026-07-20",
    color: "#2563eb"
  }
]
```

标识线位于日期格中间，名称固定展示在时间轴可视区域顶部，纵向滚动任务表格时不会随任务行离开页面。同一天可以配置多个不同颜色的里程碑。

## 事件

| 事件 | 参数 | 触发场景 |
| --- | --- | --- |
| `task-change` | `(id, patch)` | 拖曳、拉伸、编辑任务；依赖排程也可能连续触发后续任务变化 |
| `task-create` | `(task)` | 内置编辑器创建任务 |
| `task-delete` | `(id)` | 删除任务 |
| `task-edit-request` | `(request)` | 请求创建或编辑任务 |
| `marker-create` | `(marker)` | 创建里程碑 |
| `marker-change` | `(id, marker)` | 编辑里程碑 |
| `marker-delete` | `(id)` | 删除里程碑 |
| `marker-edit-request` | `(request)` | 请求创建或编辑里程碑 |
| `link-change` | `(links)` | 创建、编辑或删除依赖 |
| `link-rejected` | `(rejection)` | 依赖因重复、循环或自连接被拒绝 |
| `view-mode-change` | `(mode)` | 切换时间刻度 |

## 仅使用 Core

`ct-gantt-core` 不包含 Vue 组件和弹窗，可以用于服务端、其他框架或自定义渲染器。

```ts
import {
  checkCyclicDependency,
  computeImpact,
  computeLayout,
  computeTimeScale,
  flattenTasks,
  normalizeLinks,
  scheduleByDependencies
} from "ct-gantt-core"

const normalized = normalizeLinks(tasks, links)
const cycle = checkCyclicDependency(normalized)
const scheduled = scheduleByDependencies(tasks, normalized)

if (!scheduled.ok) {
  console.error(scheduled.error.code, scheduled.error.message)
}
```

主要导出：

- `normalizeLinks(tasks, links)`：过滤无效任务引用、同向重复依赖和会形成循环的后续连接。
- `checkCyclicDependency(links)`：检查依赖图是否存在循环。
- `scheduleByDependencies(tasks, links)`：根据依赖关系计算任务日期。
- `computeLayout(tasks, links, config, collapsedIds?, viewport?)`：计算任务布局。
- `computeImpact(taskId, patch, tasks, links, config)`：计算一次修改影响的任务。
- `flattenTasks(tasks, collapsedIds?)`：将阶段树展开为可渲染行。
- `computeTimeScale(start, end, viewMode, columnWidth, firstDayOfWeek)`：生成时间刻度。
- 日期工具：`toDate`、`formatDate`、`addDays`、`diffDays`、`inclusiveDays`。

## 本地开发

```bash
pnpm install
pnpm dev
```

常用命令：

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm benchmark
```

工作区结构：

```text
packages/
  core/        # 数据类型、排程和布局逻辑
  vue-gantt/   # Vue 甘特图组件与样式
playground/    # 功能演示和大数据测试
docs/          # 开发阶段文档
```
