import { spawnSync } from "node:child_process";

const command = process.argv[2] === "test" ? "test" : "build";
const foundry = process.platform === "win32" ? "base-forge.cmd" : "base-forge";
const check = spawnSync(foundry, ["--version"], { stdio: "ignore" });

if (check.status !== 0) {
  console.warn(
    `[contracts] Skipping base-forge ${command}; install Base Foundry with base-foundryup to run contract checks.`
  );
  process.exit(0);
}

const args = command === "test" ? ["test", "-vvv"] : ["build"];
const result = spawnSync(foundry, args, { stdio: "inherit" });
process.exit(result.status ?? 1);
