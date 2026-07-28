import { performance } from "node:perf_hooks"

const counts = [1000, 3000]
for (const count of counts) {
  const start = performance.now()
  const tasks = Array.from({ length: count }, (_, index) => ({
    id: `task-${index}`,
    name: `任务 ${index}`,
    start: index % 90
  }))
  const elapsed = performance.now() - start
  console.log(`${count} tasks fixture generated in ${elapsed.toFixed(2)}ms`, tasks.length)
}
