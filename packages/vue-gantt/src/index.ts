import "./styles/gantt.css"
import GanttChart from "./components/GanttChart.vue"

export { GanttChart }
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
} from "@gantt/core"
export type {
  GanttLinkRejection,
  GanttMarkerEditRequest,
  GanttMarkerEditorDraft,
  GanttTaskEditRequest,
  GanttTaskEditorDraft
} from "./types"
