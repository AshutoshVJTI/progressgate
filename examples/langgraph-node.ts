// Pattern reference for LangGraph (or any similar graph/node-based JS agent framework).
// LangGraph is NOT a dependency of this package -- adding it would be exactly the kind
// of framework coupling ProgressGate avoids. This file shows the shape of the
// integration; adapt the types to whatever your graph state actually looks like.
//
// The pattern is the same as the generic loop: call gate.run(...).observe(...) as a
// node (or as a pre-hook before your "call the model" node), then branch the graph's
// conditional edge on the decision.

import { ProgressGate } from "../src/sdk/index.js";
import type { Step } from "../src/sdk/index.js";

// Whatever your graph's shared state type is -- this is illustrative, not a real
// LangGraph import.
interface GraphState {
  /** Stable per-session identifier; do not use goal as an identity. */
  runId: string;
  goal: string;
  steps: Step[];
  progressGateDecision?: "CONTINUE" | "WARN" | "REPLAN" | "HALT";
  progressGateFeedback?: string;
}

const gate = new ProgressGate({ apiKey: process.env.TYPESAFE_API_KEY });
const runsById = new Map<string, ReturnType<ProgressGate["run"]>>();

/**
 * Add this as a node immediately after your tool-execution node, before the node that
 * calls the model again. In LangGraph terms: `graph.addNode("progressGate", progressGateNode)`
 * then a conditional edge from it back to your agent node (CONTINUE/WARN), to a
 * replanning node (REPLAN), or to an end/human-handoff node (HALT).
 */
async function progressGateNode(state: GraphState): Promise<GraphState> {
  let run = runsById.get(state.runId);
  if (!run) {
    run = gate.run({ goal: state.goal });
    runsById.set(state.runId, run);
  }

  const latestStep = state.steps[state.steps.length - 1];
  const result = await run.observe(latestStep);

  if (result.decision === "HALT") runsById.delete(state.runId);

  return {
    ...state,
    progressGateDecision: result.decision,
    progressGateFeedback:
      result.decision === "REPLAN"
        ? `Stop repeating the same approach (${result.reasonCode}). Try a genuinely different hypothesis.`
        : undefined,
  };
}

/** Call this when a graph run completes successfully or is cancelled. */
function clearProgressGateRun(runId: string): void {
  runsById.delete(runId);
}

// Conditional edge function: graph.addConditionalEdges("progressGate", routeOnDecision, {...})
function routeOnDecision(state: GraphState): "agent" | "replan" | "halt" {
  if (state.progressGateDecision === "HALT") return "halt";
  if (state.progressGateDecision === "REPLAN") return "replan";
  return "agent"; // CONTINUE or WARN both loop back to the normal agent node
}

export { clearProgressGateRun, progressGateNode, routeOnDecision };
