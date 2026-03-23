import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  external: [],
  noExternal: [/(.*)/],
  esbuildOptions(options) {
    options.alias = {
      "@web": "..",
    };
  },
});
