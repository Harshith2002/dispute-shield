import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, API calls go to the FastAPI server; in production FastAPI serves the built files.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8000" } },
});
