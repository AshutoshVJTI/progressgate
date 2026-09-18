// npm install progressgate
// export TYPESAFE_API_KEY=...
// npx tsx examples/quickstart.ts

import { ProgressGate } from "progressgate";

const gate = new ProgressGate({
  apiKey: process.env.TYPESAFE_API_KEY,
});

const run = gate.run({
  goal: "Fix the failing deployment",
});

const result = await run.observe({
  action: "changed deployment path",
  result: "permission denied again",
});

console.log(result.decision); // "WARN" | "REPLAN" | "HALT" | "CONTINUE"
console.log(result.reasonCode);
