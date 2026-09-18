// Real end-to-end test: a live LLM tool-calling agent loop (Claude, via the Anthropic
// SDK already used elsewhere in this repo), with ProgressGate gating live between
// every step against the real Jev API. Not hand-written fixtures -- an actual model
// choosing actions turn by turn inside a deterministic simulated environment.
//
// Run: npx tsx live-agent-test/run.ts
// Requires: TYPESAFE_API_KEY, ANTHROPIC_API_KEY (CLAUDE_MODEL optional, defaults below)

import { writeFileSync, mkdirSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { ProgressGate } from "../../src/sdk/index.js";
import type { Step, RunObserveResult } from "../../src/sdk/index.js";
import { callTool, resetEnvironment, FULL_TOOLS, RESTRICTED_TOOLS, type ToolDef } from "./environment.js";

const GOAL = "Fix the failing deployment";
const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";
const MAX_STEPS = 10;

const anthropic = new Anthropic();

function toAnthropicTools(tools: ToolDef[]) {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
}

interface TrajectoryEntry {
  step: number;
  action: string;
  result: string;
  gate: Pick<RunObserveResult, "decision" | "reasonCode" | "confidence" | "signals" | "consecutiveStagnation">;
}

async function runScenario(label: string, tools: ToolDef[]) {
  resetEnvironment();
  const gate = new ProgressGate({ apiKey: process.env.TYPESAFE_API_KEY });
  const run = gate.run({ goal: GOAL });

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        `Goal: ${GOAL}\n\n` +
        "You are an SRE agent. Call exactly one tool per turn to investigate or act. " +
        "Do not narrate -- just call the next tool that makes sense given what you've learned so far. " +
        "When you believe the goal is fully achieved, respond with plain text starting with 'DONE:' and no tool call.",
    },
  ];

  const trajectory: TrajectoryEntry[] = [];
  let haltedByGate = false;
  let finishedNaturally = false;

  for (let i = 0; i < MAX_STEPS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      tools: toAnthropicTools(tools),
      messages,
    });

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");

    if (!toolUse) {
      finishedNaturally = true;
      console.log(`[${label}] agent concluded: ${textBlock?.text ?? "(no text)"}`);
      break;
    }

    const toolInput = toolUse.input as Record<string, unknown>;
    const result = callTool(toolUse.name, toolInput);
    const action = `${toolUse.name}(${JSON.stringify(toolInput)})`;

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUse.id, content: result }],
    });

    const step: Step = { action, result };
    const gateResult = await run.observe(step);

    trajectory.push({
      step: i + 1,
      action,
      result,
      gate: {
        decision: gateResult.decision,
        reasonCode: gateResult.reasonCode,
        confidence: gateResult.confidence,
        signals: gateResult.signals,
        consecutiveStagnation: gateResult.consecutiveStagnation,
      },
    });

    console.log(`[${label}] step ${i + 1}: ${action} -> ${result}`);
    console.log(`[${label}]   gate: ${gateResult.decision} (${gateResult.reasonCode}) consecutive=${gateResult.consecutiveStagnation}`);

    if (gateResult.decision === "HALT") {
      haltedByGate = true;
      console.log(`[${label}] ProgressGate HALT -- stopping loop before another model call.`);
      break;
    }

    if (gateResult.decision === "REPLAN") {
      messages.push({
        role: "user",
        content:
          `[ProgressGate] Your last ${gateResult.consecutiveStagnation} steps have not materially changed the task ` +
          `state (${gateResult.reasonCode}). Stop retrying variations of the same approach -- reconsider the ` +
          "underlying assumption before your next tool call.",
      });
    }
  }

  return {
    label,
    goal: GOAL,
    toolsAvailable: tools.map((t) => t.name),
    trajectory,
    haltedByGate,
    finishedNaturally,
    stepsTaken: trajectory.length,
  };
}

async function main() {
  mkdirSync("experiments/results", { recursive: true });

  const productive = await runScenario("productive-exploration", FULL_TOOLS);
  console.log("");
  const spinning = await runScenario("semantic-spinning", RESTRICTED_TOOLS);

  const output = { generatedAt: new Date().toISOString(), model: MODEL, runs: [productive, spinning] };
  writeFileSync("experiments/results/live-agent-run.json", JSON.stringify(output, null, 2));

  const md = [
    "# ProgressGate live agent test",
    "",
    `Model: ${MODEL}. Generated ${output.generatedAt}.`,
    "",
    ...output.runs.map((r) => {
      const lines = [
        `## ${r.label}`,
        "",
        `Tools available: ${r.toolsAvailable.join(", ")}`,
        `Halted by gate: ${r.haltedByGate}. Finished naturally: ${r.finishedNaturally}. Steps taken: ${r.stepsTaken}.`,
        "",
        "| step | action | result | gate | reason | consecutive |",
        "|---|---|---|---|---|---|",
        ...r.trajectory.map(
          (t) => `| ${t.step} | ${t.action} | ${t.result} | ${t.gate.decision} | ${t.gate.reasonCode} | ${t.gate.consecutiveStagnation} |`,
        ),
        "",
      ];
      return lines.join("\n");
    }),
  ].join("\n");

  writeFileSync("experiments/results/live-agent-run.md", md);
  console.log("\nWrote experiments/results/live-agent-run.json and experiments/results/live-agent-run.md");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
