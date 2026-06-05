// app.config.ts
import { defineConfig } from "@tanstack/start/config";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
var app_config_default = defineConfig({
  server: {
    preset: "cloudflare-pages"
  },
  vite: {
    plugins: [
      tsconfigPaths(),
      tailwindcss()
    ]
  }
});
export {
  app_config_default as default
};
