# 正式开发一期

本目录已经按一期规格建立 pnpm workspace，正式包只包含：

- `packages/core`：纯 TypeScript 核心计算，不依赖 Vue。
- `packages/vue-gantt`：Vue 组件包，内部包含 Canvas 网格和依赖线绘制。

Playground 包含基础 demo、MZGantt adapter 示例、1000 条任务和 3000 条任务基准数据入口。

## 常用命令

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm dev
pnpm benchmark
```
