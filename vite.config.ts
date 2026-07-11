import { defineConfig } from "vite";

// Tauri expects a fixed, predictable dev server — see src-tauri/tauri.conf.json's
// devUrl. Ignoring src-tauri avoids a full Rust rebuild loop on every save.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
