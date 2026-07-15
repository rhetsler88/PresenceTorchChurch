import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../src"),
      "@admin": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
