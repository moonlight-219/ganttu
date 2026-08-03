# ct-gantt-core

框架无关的甘特图数据、布局、依赖排程和命令式引擎。该包不包含界面，可用于 Vue、React、原生 JavaScript、服务端计算或自定义渲染器。

## 安装

```bash
pnpm add ct-gantt-core
```

也可以使用 `npm install ct-gantt-core` 或 `yarn add ct-gantt-core`。

## 最小示例

```ts
import { GanttEngine, type GanttTask } from "ct-gantt-core"

const tasks: GanttTask[] = [
  {
    id: "task-1",
    name: "需求分析",
    type: "task",
    plan: { start: "2026-07-01", end: "2026-07-05" },
    actual: { start: "2026-07-01", end: "2026-07-06", progress: 60 }
  }
]

const engine = new GanttEngine({
  tasks,
  config: { viewMode: "day", columnWidth: 30 }
})

const layout = engine.getLayout()
if (layout.ok) {
  console.log(layout.data)
}

engine.setTask("task-1", { progress: 80 })
engine.destroy()
```

## 依赖排程

```ts
import { scheduleByDependencies, type GanttLink } from "ct-gantt-core"

const links: GanttLink[] = [
  { id: "design-to-dev", sourceId: "design", targetId: "dev", type: "FS" }
]

const result = scheduleByDependencies(tasks, links)
if (result.ok) {
  console.log(result.data)
}
```

支持 `FS`、`SS`、`FF`、`SF` 四种依赖类型，以及自然日或工作日间隔。

## 主要导出

| API | 用途 |
| --- | --- |
| `GanttEngine` | 管理任务、依赖、折叠、预览、布局和视口命令 |
| `computeLayout` | 计算任务条位置和尺寸 |
| `computeTimeScale` | 计算时间刻度 |
| `scheduleByDependencies` | 按依赖关系调整任务日期 |
| `computeImpact` | 分析任务变更的影响和约束冲突 |
| `checkCyclicDependency` | 检查循环依赖 |
| `normalizeLinks` | 统一任务内依赖与独立依赖数据 |
| `flattenTasks` | 将阶段树转换为可渲染行 |
| `toDate`、`addDays`、`diffDays` | 日期工具 |

## 数据说明

- `plan` 表示计划日期。
- `actual` 表示实际日期和完成进度。
- `summary` 表示阶段，`task` 表示普通任务，`milestone` 表示任务型里程碑。
- Core 不负责绘制界面；需要现成 Vue 界面时请安装 `ct-gantt-vue`。

完整类型、配置和示例请查看[项目文档](https://github.com/moonlight-219/ganttu#readme)。
