import "./styles/gantt.css"
import GanttChart from "./components/GanttChart.vue"
import GanttDialog from "./components/GanttDialog.vue"

export { GanttChart }
export { GanttDialog }
export { createGantt } from "./native"
export default GanttChart
export type {
  CustomColumn,
  GanttEditorField,
  GanttConfig,
  GanttLink,
  GanttMarker,
  GanttTask,
  PatchTask,
  ViewMode
} from "ct-gantt-core"
export type {
  CreateGanttOptions,
  GanttContainer,
  GanttInstance
} from "./native"
export type {
  GanttChartExpose,
  GanttExportImageOptions,
  GanttLinkRejection,
  GanttMarkerEditRequest,
  GanttMarkerEditorDraft,
  GanttTaskEditRequest,
  GanttTaskEditorDraft
} from "./types"
