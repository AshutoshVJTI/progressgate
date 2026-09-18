import type { Step } from "../src/sdk/types.js";

export interface DemoScenario {
  id: "A" | "B";
  label: string;
  goal: string;
  steps: Step[];
}

// Scenario A: genuinely progressing trajectory. ProgressGate should CONTINUE throughout.
export const scenarioA: DemoScenario = {
  id: "A",
  label: "Productive exploration",
  goal: "Fix the failing deployment",
  steps: [
    { action: "checked deploy logs", result: "error: EACCES writing to /var/app/releases" },
    { action: "inspected directory ownership", result: "/var/app/releases is owned by root, deploy user is www-data" },
    { action: "checked deploy user permissions history", result: "ownership changed 2 days ago during a manual server patch" },
    { action: "chown -R www-data:www-data /var/app/releases", result: "ownership corrected on the release directory" },
    { action: "ran the deploy and checked the health endpoint", result: "deploy completed successfully, /health returns 200, new version live" },
  ],
};

// Scenario B: different-looking actions circling the same failed assumption (permissions).
// ProgressGate should trip: CONTINUE -> WARN -> REPLAN -> HALT.
export const scenarioB: DemoScenario = {
  id: "B",
  label: "Semantic busywork",
  goal: "Fix the failing deployment",
  steps: [
    { action: "checked deploy logs", result: "permission denied writing to /var/app/releases" },
    { action: "changed deploy path to /tmp/app-release", result: "permission denied on the new path too" },
    { action: "tried running the deploy with sudo", result: "sudo is unavailable on this host" },
    { action: "searched for an alternate deploy path with different default ownership", result: "same underlying permission problem on that path" },
    { action: "switched the deploy script to run as a different service account", result: "still permission denied, the new account has the same restrictive group" },
    { action: "rewrote the deploy script's variable names for clarity", result: "still permission denied, no functional change" },
  ],
};

export const demoScenarios = [scenarioA, scenarioB];
