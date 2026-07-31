import vue from "@vitejs/plugin-vue"
import { resolve } from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "VueGantt",
      fileName: "index"
    },
    rollupOptions: {
      external: ["vue", "ct-gantt-core"],
      output: {
        globals: {
          vue: "Vue"
        }
      }
    }
  }
})
