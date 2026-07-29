<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"

interface GanttSelectOption {
  label: string
  value: string | number
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  modelValue: string | number
  options: GanttSelectOption[]
  disabled?: boolean
  placeholder?: string
  ariaLabel?: string
}>(), {
  disabled: false,
  placeholder: "请选择",
  ariaLabel: "选择"
})

const emit = defineEmits<{
  "update:modelValue": [value: string | number]
}>()

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const selectedLabel = computed(() =>
  props.options.find((option) => option.value === props.modelValue)?.label ?? props.placeholder
)

function toggle() {
  if (!props.disabled) open.value = !open.value
}

function choose(option: GanttSelectOption) {
  if (option.disabled) return
  emit("update:modelValue", option.value)
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
  <div ref="root" class="gantt-ui-select" :class="{ open, disabled }">
    <button
      type="button"
      class="gantt-ui-select-trigger"
      :disabled="disabled"
      :aria-label="ariaLabel"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="toggle"
    >
      <span>{{ selectedLabel }}</span>
      <i></i>
    </button>
    <div v-if="open" class="gantt-ui-select-menu" role="listbox" :aria-label="ariaLabel">
      <button
        v-for="option in options"
        :key="String(option.value)"
        type="button"
        role="option"
        :aria-selected="option.value === modelValue"
        :disabled="option.disabled"
        :class="{ selected: option.value === modelValue }"
        @click="choose(option)"
      >
        <span>{{ option.label }}</span>
        <b>✓</b>
      </button>
    </div>
  </div>
</template>
