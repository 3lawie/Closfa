// app.config.ts
import { defineConfig } from "@tanstack/start/config";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
var app_config_default = defineConfig({
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
