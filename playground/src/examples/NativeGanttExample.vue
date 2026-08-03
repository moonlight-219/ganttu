<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import {
  createGantt,
  type GanttInstance,
  type GanttTask
} from "ct-gantt-vue"
import "ct-gantt-vue/style.css"

// 原生实例需要一个已经挂载的 DOM 容器。
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

// Vue 完成 DOM 挂载后创建实例。
onMounted(() => {
  gantt = createGantt(containerRef.value!, {
    tasks: tasks.value,
    height: 620,
    onTaskChange(id, patch) {
      console.log("任务变更", id, patch)
    }
  })
})

// 外部业务数据变化时同步到原生实例。
watch(tasks, (value) => gantt?.setTasks(value), { deep: true })

// 组件卸载时清理实例持有的事件和观察器。
onBeforeUnmount(() => gantt?.destroy())
</script>

<template>
  <div ref="containerRef" class="gantt-container"></div>
</template>

<style scoped>
.gantt-container {
  width: 100%;
  height: 620px;
}
</style>
