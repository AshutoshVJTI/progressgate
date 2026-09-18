// A tiny, deterministic simulated environment: a "broken deployment" with one real
// root cause (the deploy service account was disabled). Tool outputs are canned and
// deterministic -- only the agent's choice of which tool to call, and when, is live
// model reasoning. This keeps the test repeatable while the trajectory itself is real.
//
// Two tool sets are exported:
// - FULL_TOOLS: includes diagnostic tools that can actually reach the root cause.
//   An agent with these available can genuinely explore and converge (productive).
// - RESTRICTED_TOOLS: only permission-variation tools, no path to the real cause.
//   An agent limited to these can only vary the surface of the same wrong assumption
//   (semantic spinning) -- this is a constraint on the agent's available actions, not
//   a scripted trajectory; what it tries, and in what order, is still live model
//   reasoning.

export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

let accountReenabled = false;

export function resetEnvironment() {
  accountReenabled = false;
}

export function callTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "check_logs":
      return "error: EACCES writing to /var/app/releases";
    case "change_deploy_path":
      return `permission denied on ${String(input.path ?? "the new path")} too`;
    case "try_sudo":
      return "sudo is unavailable on this host";
    case "switch_service_account":
      return `still permission denied, ${String(input.account ?? "the new account")} has the same restrictive group`;
    case "check_ownership_history":
      return "/var/app/releases is owned by root, deploy user is www-data; ownership changed 2 days ago during a manual server patch";
    case "check_account_status":
      return "found it: the deploy service account was disabled yesterday during an unrelated offboarding sweep";
    case "reenable_account":
      accountReenabled = true;
      return "deploy service account re-enabled successfully";
    case "redeploy":
      return accountReenabled
        ? "deploy succeeded, /health returns 200, new version live"
        : "permission denied writing to /var/app/releases";
    default:
      return `unknown tool: ${name}`;
  }
}

const PERMISSION_TOOLS: ToolDef[] = [
  { name: "check_logs", description: "Read the deploy logs for the most recent failed deploy attempt.", input_schema: { type: "object", properties: {} } },
  {
    name: "change_deploy_path",
    description: "Retry the deploy against a different target path.",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  { name: "try_sudo", description: "Retry the deploy command with sudo.", input_schema: { type: "object", properties: {} } },
  {
    name: "switch_service_account",
    description: "Retry the deploy running as a different service account.",
    input_schema: { type: "object", properties: { account: { type: "string" } }, required: ["account"] },
  },
  { name: "redeploy", description: "Run the deploy script.", input_schema: { type: "object", properties: {} } },
];

export const RESTRICTED_TOOLS: ToolDef[] = PERMISSION_TOOLS;

export const FULL_TOOLS: ToolDef[] = [
  ...PERMISSION_TOOLS,
  {
    name: "check_ownership_history",
    description: "Check the release directory's ownership and when it last changed.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "check_account_status",
    description: "Check the deploy service account's status with IT (enabled/disabled).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "reenable_account",
    description: "Re-enable the deploy service account.",
    input_schema: { type: "object", properties: {} },
  },
];
