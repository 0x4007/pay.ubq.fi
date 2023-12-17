import * as esbuild from "esbuild";
import { esBuildContext } from "./esbuild-config";

async function server() {
  let ctx = await esbuild.context(esBuildContext);
  await ctx.watch();
  let { host, port } = await ctx.serve({
    servedir: "static",
    port: 8080,
  });
}
server();
