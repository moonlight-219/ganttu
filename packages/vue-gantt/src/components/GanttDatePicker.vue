<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

const props = withDefaults(defineProps<{
  modelValue: string
  disabled?: boolean
  readonly?: boolean
  ariaLabel?: string
}>(), {
  disabled: false,
  readonly: false,
  ariaLabel: "选择日期"
})

const emit = defineEmits<{
  "update:modelValue": [value: string]
}>()

const root = ref<HTMLElement | null>(null)
const popover = ref<HTMLElement | null>(null)
const open = ref(false)
const placement = ref<"bottom" | "top">("bottom")
const popoverStyle = ref<Record<string, string>>({})
const viewDate = ref(parseDate(props.modelValue) ?? new Date())
const weekdays = ["一", "二", "三", "四", "五", "六", "日"]
const popoverHeight = 360
const disableTeleport = typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom")

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function formatValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const displayValue = computed(() => props.modelValue.replaceAll("-", "/"))
const monthLabel = computed(() => `${viewDate.value.getFullYear()}年${viewDate.value.getMonth() + 1}月`)
const calendarDays = computed(() => {
  const year = viewDate.value.getFullYear()
  const month = viewDate.value.getMonth()
  const first = new Date(year, month, 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const value = formatValue(date)
    return {
      date,
      value,
      day: date.getDate(),
      currentMonth: date.getMonth() === month,
      selected: value === props.modelValue,
      today: value === formatValue(new Date())
    }
  })
})

watch(() => props.modelValue, (value) => {
  const parsed = parseDate(value)
  if (parsed) viewDate.value = parsed
})

async function toggle() {
  if (props.disabled || props.readonly) return
  const selected = parseDate(props.modelValue)
  if (selected) viewDate.value = selected
  open.value = !open.value
  if (open.value) {
    await nextTick()
    updatePlacement()
  }
}

function moveMonth(delta: number) {
  viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() + delta, 1)
}

function choose(value: string) {
  emit("update:modelValue", value)
  open.value = false
}

function chooseToday() {
  choose(formatValue(new Date()))
}

function clear() {
  emit("update:modelValue", "")
  open.value = false
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (!root.value?.contains(target) && !popover.value?.contains(target)) open.value = false
}

function onDocumentKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") open.value = false
}

function onDocumentScroll(event: Event) {
  if (!open.value) return
  const target = event.target as Node | null
  if (target && popover.value?.contains(target)) return
  open.value = false
}

function onWindowResize() {
  if (open.value) open.value = false
}

function updatePlacement() {
  const rect = root.value?.getBoundingClientRect()
  if (!rect) return

  const gap = 7
  const popoverWidth = Math.min(300, Math.max(260, window.innerWidth - 16))
  const bottomLimit = window.innerHeight
  const topLimit = 0
  const below = bottomLimit - rect.bottom
  const above = rect.top - topLimit
  const nextPlacement = below < popoverHeight && above > below ? "top" : "bottom"
  const top = nextPlacement === "top"
    ? Math.max(8, rect.top - popoverHeight - gap)
    : Math.min(rect.bottom + gap, window.innerHeight - popoverHeight - 8)
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - popoverWidth - 8))
  placement.value = nextPlacement
  popoverStyle.value = {
    position: "fixed",
    top: `${top}px`,
    left: `${left}px`,
    width: `${popoverWidth}px`
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown)
  document.addEventListener("keydown", onDocumentKeyDown)
  window.addEventListener("resize", onWindowResize)
  document.addEventListener("scroll", onDocumentScroll, true)
})
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown)
  document.removeEventListener("keydown", onDocumentKeyDown)
  window.removeEventListener("resize", onWindowResize)
  document.removeEventListener("scroll", onDocumentScroll, true)
})
</script>

<template>
  <div ref="root" class="gantt-date-picker" :class="[{ open, disabled: disabled || readonly }, `placement-${placement}`]">
    <button
      type="button"
      class="gantt-date-trigger"
      :disabled="disabled"
      :aria-label="ariaLabel"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="toggle"
    >
      <span>{{ displayValue || "请选择日期" }}</span>
      <i></i>
    </button>
    <Teleport to="body" :disabled="disableTeleport">
      <div
        v-if="open"
        ref="popover"
        class="gantt-date-popover"
        role="dialog"
        :aria-label="ariaLabel"
        :style="popoverStyle"
      >
        <header>
          <strong>{{ monthLabel }}</strong>
          <div>
            <button type="button" aria-label="上个月" @click="moveMonth(-1)">‹</button>
            <button type="button" aria-label="下个月" @click="moveMonth(1)">›</button>
          </div>
        </header>
        <div class="gantt-date-weekdays">
          <span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span>
        </div>
        <div class="gantt-date-days">
          <button
            v-for="item in calendarDays"
            :key="item.value"
            type="button"
            :class="{
              muted: !item.currentMonth,
              selected: item.selected,
              today: item.today
            }"
            :aria-label="item.value"
            :aria-pressed="item.selected"
            @click="choose(item.value)"
          >
            {{ item.day }}
          </button>
        </div>
        <footer>
          <button type="button" @click="clear">清除</button>
          <button type="button" @click="chooseToday">今天</button>
        </footer>
      </div>
    </Teleport>
  </div>
</template>
