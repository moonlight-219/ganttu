# ct-gantt-vue

基于 Vue 3.5+ 的甘特图组件，支持计划条、实际条、阶段汇总、任务依赖、里程碑、虚拟滚动、拖拽编辑、图片导出和原生实例接入。

## 安装

```bash
pnpm add vue@^3.5.0 ct-gantt-vue
```

## Vue 组件

```vue
<script setup lang="ts">
import { ref } from "vue"
import GanttChart, { type GanttTask, type PatchTask } from "ct-gantt-vue"
import "ct-gantt-vue/style.css"

const tasks = ref<GanttTask[]>([
  {
    id: "task-1",
    name: "需求分析",
    type: "task",
    plan: { start: "2026-07-01", end: "2026-07-05" },
    actual: { start: "2026-07-01", end: "2026-07-06", progress: 60 }
  }
])

function updateTask(id: string, patch: PatchTask) {
  tasks.value = tasks.value.map((task) => task.id !== id ? task : ({
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
    }
  }))
}
</script>

<template>
  <GanttChart
    :tasks="tasks"
    :config="{
      viewMode: 'day',
      height: 620,
      editablePlan: true,
      editableActual: true
    }"
    @task-change="updateTask"
  />
</template>
```

`GanttChart` 是受控组件：拖拽和编辑会触发事件，业务代码需要根据事件更新传入的 `tasks`、`links` 或 `markers`。

## 原生实例

Vue 以外的项目也可以通过 DOM 容器创建实例：

```ts
import { createGantt } from "ct-gantt-vue"
import "ct-gantt-vue/style.css"

const gantt = createGantt("#gantt", {
  tasks,
  height: 620,
  onTaskChange(id, patch) {
    console.log(id, patch)
  }
})

gantt.setTasks(nextTasks)
gantt.scrollToTask("task-1")

// 页面卸载时调用。
gantt.destroy()
```

## 常用属性

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `tasks` | `GanttTask[]` | 任务、阶段和任务型里程碑 |
| `links` | `GanttLink[]` | 独立依赖关系 |
| `markers` | `GanttMarker[]` | 时间轴顶部里程碑 |
| `config` | `Partial<GanttConfig>` | 视图、尺寸、列、编辑器和交互配置 |
| `width` / `height` | `string \| number` | 数字按像素处理，字符串支持 `%`、`px`、`vh` 等 CSS 单位 |

使用 `height="100%"` 时，父容器必须具有明确高度。

## 常用事件

- `task-change`、`task-create`、`task-delete`
- `link-change`、`link-rejected`
- `marker-create`、`marker-change`、`marker-delete`
- `task-edit-request`、`marker-edit-request`

## 组件方法

通过组件 `ref` 可以调用 `exportImage`、全屏控制、`openCreateTask`、`openCreateMarker` 和 `getEngine`。滚动及缩放命令通过引擎调用：

```ts
ganttRef.value?.getEngine()?.scrollToDate("2026-07-01")
ganttRef.value?.getEngine()?.scrollToTask("task-1")
ganttRef.value?.getEngine()?.zoomToFit()
```

阶段拥有子任务时，计划日期、实际日期和进度会根据子任务自动汇总，并在内置编辑器中只读；空阶段仍可手动设置这些字段。

`config.taskColors.plan` 控制计划条外部底色，任务的 `planColor` 控制计划条内部进度颜色；任务的 `color` 控制实际条颜色。

完整配置、自定义列、编辑器、插槽和 API 示例请查看[项目文档](https://github.com/moonlight-219/ganttu#readme)。
