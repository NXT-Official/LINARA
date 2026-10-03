/**
 * Runs on `npm install` (the `prepare` script): points git at .githooks/, so
 * the pre-push QA check is on for everyone who clones. Does nothing where
 * there's no git checkout (Vercel and EAS builds), so it can't fail one.
 */
import { execSync } from "node:child_process";

try {
  execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" });
  execSync("git config core.hooksPath .githooks", { stdio: "ignore" });
} catch {
  // Not a git checkout: nothing to install.
}
