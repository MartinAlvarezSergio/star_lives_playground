import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/star_lives_playground/",
  plugins: [react()]
});
