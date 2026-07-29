<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"

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
const open = ref(false)
const viewDate = ref(parseDate(props.modelValue) ?? new Date())
const weekdays = ["一", "二", "三", "四", "五", "六", "日"]

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

function toggle() {
  if (props.disabled || props.readonly) return
  const selected = parseDate(props.modelValue)
  if (selected) viewDate.value = selected
  open.value = !open.value
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
  if (!root.value?.contains(event.target as Node)) open.value = false
}

function onDocumentKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") open.value = false
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown)
  document.addEventListener("keydown", onDocumentKeyDown)
})
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown)
  document.removeEventListener("keydown", onDocumentKeyDown)
})
</script>

<template>
  <div ref="root" class="gantt-date-picker" :class="{ open, disabled: disabled || readonly }">
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
    <div v-if="open" class="gantt-date-popover" role="dialog" :aria-label="ariaLabel">
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
  </div>
</template>
