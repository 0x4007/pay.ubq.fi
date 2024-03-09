import { generateERC20Permit } from "./generate-permit2-url";
import { log, verifyEnvironmentVariables } from "./utils";

(async function generateMultiERC20Permits() {
  for (let i = 0; i < 5; i++) {
    const url = await generateERC20Permit();
    log.ok("Testing URL:");
    console.log(url);
  }
})().catch((error) => {
  console.error(error);
  verifyEnvironmentVariables();
  process.exitCode = 1;
});
