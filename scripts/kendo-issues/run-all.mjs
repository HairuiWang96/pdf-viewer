import { spawn, spawnSync } from "child_process";
import { existsSync } from "fs";
import { HERE, PUBLIC_DIR, startHarness } from "./lib.mjs";

/**
 * Runs every Kendo issue check against the installed KendoReact version.
 * Each check runs in its own Node process, so a crashing tab or a frozen
 * page in one can't affect the next. Takes about 10 minutes, mostly the
 * crash and search-freeze waits.
 *
 *   node scripts/kendo-issues/run-all.mjs            all checks
 *   node scripts/kendo-issues/run-all.mjs print      only the checks named
 */
const CHECKS = ["large-file", "search", "scroll", "scrollbar", "print", "pan-select", "blur"];
const only = process.argv.slice(2);

if (!existsSync(PUBLIC_DIR + "text-60.pdf")) spawnSync(process.execPath, [HERE + "generate.mjs"], { stdio: "inherit" });

const version = (await import("@progress/kendo-react-pdf-viewer/package.json", { with: { type: "json" } })).default.version;
console.log(`KendoReact PDF Viewer ${version}\n`);

const server = await startHarness();
try {
  for (const check of CHECKS.filter((c) => !only.length || only.includes(c))) {
    console.log(`-- ${check}`);
    // Async on purpose: spawnSync would block this process, and with it the
    // harness server the check is about to request pages from.
    const status = await new Promise((r) => spawn(process.execPath, [HERE + check + ".mjs"], { stdio: "inherit" }).on("close", r));
    if (status !== 0) console.log(`[${check}] check failed to run (exit ${status})`);
  }
} finally {
  await server.close();
}
