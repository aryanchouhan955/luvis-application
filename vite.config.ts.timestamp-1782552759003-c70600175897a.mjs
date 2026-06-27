// vite.config.ts
import { defineConfig } from "file:///C:/Users/COMPUTER%20WORLD/Desktop/LUVIS_LATEST/luvis-application/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/COMPUTER%20WORLD/Desktop/LUVIS_LATEST/luvis-application/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
var __vite_injected_original_dirname = "C:\\Users\\COMPUTER WORLD\\Desktop\\LUVIS_LATEST\\luvis-application";
var vite_config_default = defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false
    }
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"]
  }
}));
export {
  vite_config_default as default
};
