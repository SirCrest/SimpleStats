import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const PLUGIN_UUID = "com.crest.simplestats";
const OUTPUT_FILE = `${PLUGIN_UUID}.sdPlugin/bin/plugin.js`;

export default {
  input: "src/index.ts",
  output: {
    file: OUTPUT_FILE,
    format: "cjs",
    sourcemap: true
  },
  external: ["@napi-rs/canvas"],
  plugins: [
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
    json(),
    typescript({ tsconfig: "./tsconfig.json" })
  ]
};
