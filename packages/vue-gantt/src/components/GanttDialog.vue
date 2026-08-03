<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue"

const props = defineProps<{
  open: boolean
  mode: "drawer" | "modal"
  title: string
  subtitle?: string
  showDelete?: boolean
  deleteLabel?: string
  ariaLabel?: string
  panelClass?: string
}>()

const emit = defineEmits<{
  close: []
  save: []
  delete: []
}>()

let bodyLocked = false

function onBackdropClick() {
  emit("close")
}

function setBodyLock(locked: boolean) {
  if (typeof document === "undefined" || bodyLocked === locked) return
  bodyLocked = locked
  document.body.classList.toggle("gantt-dialog-open", locked)
}

watch(() => props.open, setBodyLock, { immediate: true })

onBeforeUnmount(() => {
  setBodyLock(false)
})
</script>

<template>
  <template v-if="open">
    <div
      class="gantt-editor-backdrop"
      :class="{ 'gantt-task-drawer-backdrop': mode === 'drawer' }"
      @click="onBackdropClick"
    ></div>
    <aside
      class="gantt-editor"
      :class="[mode === 'drawer' ? 'gantt-task-drawer' : 'gantt-dialog-modal', panelClass]"
      :aria-label="ariaLabel || title"
    >
      <header>
        <div>
          <span v-if="subtitle">{{ subtitle }}</span>
          <strong>{{ title }}</strong>
        </div>
        <button type="button" aria-label="关闭" @click="emit('close')">&times;</button>
      </header>

      <slot />

      <footer v-if="$slots.footer !== undefined || showDelete !== undefined">
        <slot name="footer">
          <button v-if="showDelete" type="button" class="danger" @click="emit('delete')">
            {{ deleteLabel || "删除" }}
          </button>
          <span></span>
          <button type="button" @click="emit('close')">取消</button>
          <button type="button" class="primary" @click="emit('save')">保存</button>
        </slot>
      </footer>
    </aside>
  </template>
</template>
