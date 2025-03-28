import { execSync } from "child_process";
import { config } from "dotenv";
import esbuild from "esbuild";
import { appendFileSync, readFileSync, writeFileSync } from "fs";

// CSS files in order
const cssFiles: string[] = [
  "static/styles/rewards/pay.css",
  "static/styles/rewards/background.css",
  "static/styles/toast.css",
  "static/styles/rewards/claim-table.css",
  "static/styles/rewards/media-queries.css",
  "static/styles/rewards/light-mode.css",
];

// Output bundles file
const outputFilePath = "static/bundles/bundles.css";

const typescriptEntries = ["static/scripts/rewards/init.ts", "static/scripts/ubiquity-dollar/init.ts"];
export const entries = [...typescriptEntries];

export const esBuildContext: esbuild.BuildOptions = {
  sourcemap: true,
  entryPoints: entries,
  bundle: true,
  minify: false,
  platform: "browser",
  loader: {
    ".png": "dataurl",
    ".woff": "dataurl",
    ".woff2": "dataurl",
    ".eot": "dataurl",
    ".ttf": "dataurl",
    ".svg": "dataurl",
  },
  outdir: "static/bundles",
  define: createEnvDefines(["SUPABASE_URL", "SUPABASE_ANON_KEY"], {
    commitHash: execSync(`git rev-parse --short HEAD`).toString().trim(),
  }),
  plugins: [
    {
      name: "css-bundle",
      setup(build) {
        build.onEnd((result) => {
          // Clear the file first
          writeFileSync(outputFilePath, "", "utf8");

          // Concatenate each file into the bundles file
          cssFiles.forEach((file) => {
            const data = readFileSync(file, "utf8");
            appendFileSync(outputFilePath, data, "utf8");
          });
        });
      },
    },
  ],
  external: [
    "assert",
    "buffer",
    "console",
    "constants",
    "crypto",
    "domain",
    "events",
    "http",
    "https",
    "os",
    "path",
    "punycode",
    "process",
    "querystring",
    "stream",
    "string_decoder",
    "sys",
    "timers",
    "tty",
    "url",
    "util",
    "vm",
    "zlib",
    "fs",
    "net",
    "tls",
    "async_hooks",
    "diagnostics_channel",
    "worker_threads",
    "perf_hooks",
  ],
};

esbuild
  .build(esBuildContext)
  .then(() => {
    console.log("\tesbuild complete");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

function createEnvDefines(environmentVariables: string[], generatedAtBuild: Record<string, unknown>): Record<string, string> {
  const defines: Record<string, string> = {};
  config();
  for (const name of environmentVariables) {
    const envVar = process.env[name];
    if (envVar !== undefined) {
      defines[name] = JSON.stringify(envVar);
    } else {
      throw new Error(`Missing environment variable: ${name}`);
    }
  }
  for (const key in generatedAtBuild) {
    if (Object.prototype.hasOwnProperty.call(generatedAtBuild, key)) {
      defines[key] = JSON.stringify(generatedAtBuild[key]);
    }
  }
  return defines;
}
