import "./styles/gantt.css"
import GanttChart from "./components/GanttChart.vue"

export { GanttChart }
export default GanttChart
export type {
  GanttConfig,
  GanttLink,
  GanttMarker,
  GanttTask,
  PatchTask,
  ViewMode
} from "@gantt/core"
