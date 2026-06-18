import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Dev-only: serves the component gallery in dev/. The package itself ships
 *  as source (see package.json exports) and has no build step. */
export default defineConfig({
  root: "dev",
  plugins: [react()],
});
