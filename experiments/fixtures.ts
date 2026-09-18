import type { Fixture } from "./types.js";

// 46 hand-labeled agent trajectories. Each fixture is a snapshot: goal + recent_steps +
// latest_step, with a human-assigned expected state and an "obvious" flag separating
// clear-cut cases from genuinely ambiguous ones.

export const fixtures: Fixture[] = [
  // ---------- meaningful-progress (5) ----------
  {
    id: "prog-01",
    category: "meaningful-progress",
    obvious: true,
    expected: "PROGRESSING",
    notes: "Each step narrows the root cause and the latest step fixes it.",
    input: {
      goal: "Fix the failing deployment",
      recentSteps: [
        { action: "checked deploy logs", result: "error: EACCES writing to /var/app/releases" },
        { action: "inspected directory ownership", result: "/var/app/releases owned by root, deploy user is www-data" },
        { action: "checked deploy user permissions history", result: "ownership changed 2 days ago during a manual server patch" },
      ],
      latestStep: { action: "chown -R www-data:www-data /var/app/releases and redeployed", result: "deploy completed successfully, health check passing" },
    },
  },
  {
    id: "prog-02",
    category: "meaningful-progress",
    obvious: true,
    expected: "PROGRESSING",
    notes: "Bug hunt narrowing scope step by step via bisection.",
    input: {
      goal: "Find why the checkout page crashes on Safari",
      recentSteps: [
        { action: "reproduced crash in Safari 17", result: "confirmed: TypeError on cart.total.toFixed" },
        { action: "added console logging around cart.total", result: "cart.total is undefined right before crash" },
        { action: "traced where cart.total is set", result: "set in reducer only when action.type === 'RECALC'; Safari fires a different event order" },
      ],
      latestStep: { action: "added a guard so total defaults to 0 until RECALC fires", result: "crash no longer reproduces in Safari 17, cart renders correctly" },
    },
  },
  {
    id: "prog-03",
    category: "meaningful-progress",
    obvious: true,
    expected: "PROGRESSING",
    notes: "Data pipeline debugging with concrete new evidence each step.",
    input: {
      goal: "Explain why yesterday's ETL job undercounted rows by 12%",
      recentSteps: [
        { action: "compared row counts per source table", result: "orders table matches, shipments table is short by ~12%" },
        { action: "checked shipments extraction query", result: "query filters WHERE updated_at > last_run_ts, using UTC" },
        { action: "checked source DB timezone", result: "source DB writes updated_at in server-local time (PST), not UTC" },
      ],
      latestStep: { action: "converted last_run_ts to PST before filtering and reran the count", result: "shipments count now matches source, discrepancy resolved" },
    },
  },
  {
    id: "prog-04",
    category: "meaningful-progress",
    obvious: false,
    expected: "PROGRESSING",
    notes: "Progress via elimination, not yet solved, but ruling things out is real progress.",
    input: {
      goal: "Identify the memory leak in the worker process",
      recentSteps: [
        { action: "took heap snapshot at t=0 and t=30min", result: "retained size grew 400MB, mostly in 'Buffer' instances" },
        { action: "grepped for Buffer.alloc call sites", result: "found 6 call sites; disabled 3 unrelated ones via feature flag, leak persisted" },
      ],
      latestStep: { action: "disabled the image-resize buffer pool call site", result: "leak growth rate dropped to near zero over the next 30min" },
    },
  },
  {
    id: "prog-05",
    category: "meaningful-progress",
    obvious: false,
    expected: "PROGRESSING",
    notes: "Slow but each round trip yields a new fact that changes the plan.",
    input: {
      goal: "Get the vendor API integration passing sandbox tests",
      recentSteps: [
        { action: "ran sandbox test suite", result: "3 of 40 tests fail, all related to refund endpoint" },
        { action: "read vendor changelog for refund endpoint", result: "vendor added a required 'idempotency_key' header in v2, docs not yet updated site-wide" },
      ],
      latestStep: { action: "added idempotency_key header to refund calls and reran suite", result: "refund tests now pass, 40/40 green" },
    },
  },

  // ---------- exact-loop (3) ----------
  {
    id: "loop-01",
    category: "exact-loop",
    obvious: true,
    expected: "STALLED",
    notes: "Literally the same command retried with the same failure.",
    input: {
      goal: "Fix the failing deployment",
      recentSteps: [
        { action: "ran deploy script", result: "permission denied writing to /var/app/releases" },
        { action: "ran deploy script again", result: "permission denied writing to /var/app/releases" },
        { action: "ran deploy script again", result: "permission denied writing to /var/app/releases" },
      ],
      latestStep: { action: "ran deploy script again", result: "permission denied writing to /var/app/releases" },
    },
  },
  {
    id: "loop-02",
    category: "exact-loop",
    obvious: true,
    expected: "STALLED",
    notes: "Restarting the same service repeatedly with no config change.",
    input: {
      goal: "Get the API server to stop crashing on startup",
      recentSteps: [
        { action: "restarted the api service", result: "crashed after 2s with 'ECONNREFUSED redis:6379'" },
        { action: "restarted the api service", result: "crashed after 2s with 'ECONNREFUSED redis:6379'" },
      ],
      latestStep: { action: "restarted the api service", result: "crashed after 2s with 'ECONNREFUSED redis:6379'" },
    },
  },
  {
    id: "loop-03",
    category: "exact-loop",
    obvious: true,
    expected: "STALLED",
    notes: "Re-running the identical test command hoping for a different outcome.",
    input: {
      goal: "Get the flaky integration test suite green",
      recentSteps: [
        { action: "ran `npm test`", result: "3 tests failed: timeout waiting for #modal" },
        { action: "ran `npm test`", result: "3 tests failed: timeout waiting for #modal" },
        { action: "ran `npm test`", result: "3 tests failed: timeout waiting for #modal" },
      ],
      latestStep: { action: "ran `npm test`", result: "3 tests failed: timeout waiting for #modal" },
    },
  },

  // ---------- same-assumption-different-actions (5) ----------
  {
    id: "assume-01",
    category: "same-assumption-different-actions",
    obvious: true,
    expected: "STALLED",
    notes: "The exact scenario from the prompt: syntactically different, semantically stuck on 'permissions'.",
    input: {
      goal: "Fix the failing deployment",
      recentSteps: [
        { action: "checked deploy logs", result: "permission denied" },
        { action: "changed deploy path to /tmp/app", result: "permission denied" },
        { action: "tried sudo before the deploy command", result: "sudo unavailable on this host" },
      ],
      latestStep: { action: "searched for an alternate deploy path with different ownership", result: "same underlying permission problem on the new path too" },
    },
  },
  {
    id: "assume-02",
    category: "same-assumption-different-actions",
    obvious: true,
    expected: "STALLED",
    notes: "Agent keeps assuming the bug is in the frontend despite no new evidence pointing there.",
    input: {
      goal: "Fix intermittent checkout failures",
      recentSteps: [
        { action: "added retry logic to the checkout button handler", result: "failures still occur at the same rate" },
        { action: "rewrote the checkout form validation to fire earlier", result: "failures still occur at the same rate" },
      ],
      latestStep: { action: "switched the checkout button from onClick to onPointerUp", result: "failures still occur at the same rate" },
    },
  },
  {
    id: "assume-03",
    category: "same-assumption-different-actions",
    obvious: false,
    expected: "STALLED",
    notes: "Different SQL tuning tactics, all premised on 'it's an index problem', which has already been ruled out.",
    input: {
      goal: "Speed up the slow dashboard query",
      recentSteps: [
        { action: "added an index on orders.created_at", result: "query time unchanged: 4.2s" },
        { action: "added a composite index on (created_at, status)", result: "query time unchanged: 4.1s, EXPLAIN shows index is used but a downstream join is the bottleneck" },
      ],
      latestStep: { action: "added yet another index on orders.customer_id", result: "query time unchanged: 4.2s, same join is still the bottleneck per EXPLAIN" },
    },
  },
  {
    id: "assume-04",
    category: "same-assumption-different-actions",
    obvious: false,
    expected: "STALLED",
    notes: "Different auth libraries tried, but the actual failure is a clock-skew issue never investigated.",
    input: {
      goal: "Fix 'invalid token' errors on login",
      recentSteps: [
        { action: "swapped jsonwebtoken for jose library", result: "still 'invalid token', error is 'token expired' at verify time" },
        { action: "regenerated signing keys", result: "still 'invalid token', error is 'token expired' at verify time" },
      ],
      latestStep: { action: "switched to a different JWT verification middleware package", result: "still 'invalid token', error is 'token expired' at verify time" },
    },
  },
  {
    id: "assume-05",
    category: "same-assumption-different-actions",
    obvious: false,
    expected: "STALLED",
    notes: "Different phrasing/tools, but every attempt still assumes the CSV parser is at fault, already contradicted by evidence.",
    input: {
      goal: "Fix corrupted rows in the nightly import",
      recentSteps: [
        { action: "upgraded the CSV parsing library to latest version", result: "corrupted rows still appear, same byte pattern as before" },
        { action: "wrote a custom CSV parser to replace the library", result: "corrupted rows still appear, same byte pattern as before" },
      ],
      latestStep: { action: "added stricter quote-escaping rules to the new custom parser", result: "corrupted rows still appear, same byte pattern; the source file itself is corrupted before parsing starts" },
    },
  },

  // ---------- broad-research-no-signal (3) ----------
  {
    id: "research-01",
    category: "broad-research-no-signal",
    obvious: false,
    expected: "STALLED",
    notes: "Reading lots of docs, all plausible-looking, none narrowing the actual cause.",
    input: {
      goal: "Understand why the Kubernetes pod keeps getting OOMKilled",
      recentSteps: [
        { action: "read Kubernetes docs on memory requests/limits", result: "general background on resource management, no specifics on this pod" },
        { action: "read a blog post on JVM heap tuning", result: "general background on heap sizing, not specific to this workload" },
        { action: "read another article on Kubernetes memory best practices", result: "general checklist, nothing pod-specific" },
      ],
      latestStep: { action: "read a third article comparing memory limit strategies", result: "general comparison of strategies, still nothing about the actual pod's memory profile" },
    },
  },
  {
    id: "research-02",
    category: "broad-research-no-signal",
    obvious: false,
    expected: "STALLED",
    notes: "Competitive research that keeps surfacing adjacent-but-irrelevant companies.",
    input: {
      goal: "Find direct competitors to our real-time grid curtailment tracker",
      recentSteps: [
        { action: "searched 'energy analytics startups'", result: "found 10 general energy-software companies, none doing curtailment tracking" },
        { action: "searched 'grid data platform companies'", result: "found broad grid-data vendors, none with a curtailment-specific product" },
      ],
      latestStep: { action: "searched 'renewable energy SaaS companies'", result: "found generic renewable-energy SaaS vendors, still none tracking curtailment specifically" },
    },
  },
  {
    id: "research-03",
    category: "broad-research-no-signal",
    obvious: false,
    expected: "STALLED",
    notes: "Reading many API docs pages that never address the actual error.",
    input: {
      goal: "Figure out why the payment webhook signature verification fails",
      recentSteps: [
        { action: "read the webhook overview docs page", result: "general description of webhook delivery, no mention of signature format" },
        { action: "read the API authentication docs page", result: "covers API key auth for outbound requests, not inbound webhook signatures" },
        { action: "read the SDK changelog", result: "lists unrelated SDK version bumps" },
      ],
      latestStep: { action: "read the rate-limiting docs page", result: "covers rate limits, still no information on webhook signature verification" },
    },
  },

  // ---------- repeated-calls-different-args-no-change (4) ----------
  {
    id: "argsloop-01",
    category: "repeated-calls-different-args-no-change",
    obvious: true,
    expected: "STALLED",
    notes: "Varying retry counts/timeouts on a call that fails for an unrelated reason.",
    input: {
      goal: "Get the third-party geocoding call to succeed",
      recentSteps: [
        { action: "called geocode API with timeout=5000", result: "401 Unauthorized" },
        { action: "called geocode API with timeout=15000 and retries=3", result: "401 Unauthorized" },
      ],
      latestStep: { action: "called geocode API with a fresh axios instance and timeout=30000", result: "401 Unauthorized" },
    },
  },
  {
    id: "argsloop-02",
    category: "repeated-calls-different-args-no-change",
    obvious: true,
    expected: "STALLED",
    notes: "Different query filters against the same broken endpoint, all return empty.",
    input: {
      goal: "Pull last month's transactions for reconciliation",
      recentSteps: [
        { action: "queried /transactions?month=2026-08&status=all", result: "empty array, HTTP 200" },
        { action: "queried /transactions?from=2026-08-01&to=2026-08-31", result: "empty array, HTTP 200" },
      ],
      latestStep: { action: "queried /transactions?range=last_30_days", result: "empty array, HTTP 200 (endpoint is pointed at the sandbox environment, not production)" },
    },
  },
  {
    id: "argsloop-03",
    category: "repeated-calls-different-args-no-change",
    obvious: false,
    expected: "STALLED",
    notes: "Different model prompts to an LLM classifier, same underlying miscalibration.",
    input: {
      goal: "Get the sentiment classifier to correctly label this batch of reviews",
      recentSteps: [
        { action: "reran classification with a more detailed prompt", result: "still mislabels the same 8 sarcastic reviews as positive" },
        { action: "reran classification with few-shot examples added", result: "still mislabels the same 8 sarcastic reviews as positive" },
      ],
      latestStep: { action: "reran classification with temperature lowered to 0", result: "still mislabels the same 8 sarcastic reviews as positive" },
    },
  },
  {
    id: "argsloop-04",
    category: "repeated-calls-different-args-no-change",
    obvious: false,
    expected: "STALLED",
    notes: "Different build flags tried against a linker error unrelated to flags.",
    input: {
      goal: "Fix the linker error in the release build",
      recentSteps: [
        { action: "rebuilt with -O2 instead of -O3", result: "same error: undefined reference to `libfoo_init`" },
        { action: "rebuilt with static linking flag added", result: "same error: undefined reference to `libfoo_init`" },
      ],
      latestStep: { action: "rebuilt with LTO disabled", result: "same error: undefined reference to `libfoo_init` (library simply isn't in the link path)" },
    },
  },

  // ---------- productive-exploration (failures that ARE progress) (4) ----------
  {
    id: "explore-01",
    category: "productive-exploration",
    obvious: false,
    expected: "PROGRESSING",
    notes: "Each failed hypothesis genuinely eliminates a branch, narrowing the search space.",
    input: {
      goal: "Diagnose intermittent 500 errors on the /search endpoint",
      recentSteps: [
        { action: "checked if errors correlate with request volume", result: "no correlation, errors happen at low volume too — ruled out load" },
        { action: "checked if errors correlate with a specific query param", result: "no correlation across params — ruled out malformed input" },
        { action: "checked if errors correlate with which search-node replica handled the request", result: "yes: 100% of errors are on replica-3" },
      ],
      latestStep: { action: "checked replica-3's disk usage", result: "replica-3 disk is 98% full, causing write failures to its local cache" },
    },
  },
  {
    id: "explore-02",
    category: "productive-exploration",
    obvious: false,
    expected: "PROGRESSING",
    notes: "Trying several unrelated plausible causes, each ruled out is real information gained.",
    input: {
      goal: "Find why emails aren't sending",
      recentSteps: [
        { action: "checked SMTP credentials", result: "valid, test connection succeeds" },
        { action: "checked email queue worker logs", result: "worker is running and picking up jobs" },
      ],
      latestStep: { action: "checked the email template renderer", result: "found the bug: template renderer throws on a missing variable, silently dropping the job before it reaches the SMTP step" },
    },
  },
  {
    id: "explore-03",
    category: "productive-exploration",
    obvious: false,
    expected: "PROGRESSING",
    notes: "Exploration where nothing is fixed yet but the mental model of the system is now correct and actionable.",
    input: {
      goal: "Understand why cache invalidation isn't propagating across regions",
      recentSteps: [
        { action: "checked whether invalidation events are published", result: "confirmed events are published in us-east-1" },
        { action: "checked whether eu-west-1 subscribes to the same topic", result: "confirmed eu-west-1 subscribes to a differently-named topic due to a naming migration" },
      ],
      latestStep: { action: "diffed the topic names across regions", result: "confirmed us-east-1 publishes to 'cache-invalidate-v2' but eu-west-1 still listens on 'cache-invalidate-v1' — root cause found" },
    },
  },
  {
    id: "explore-04",
    category: "productive-exploration",
    obvious: false,
    expected: "PROGRESSING",
    notes: "Multiple negative results, but they collectively point to a specific untried area.",
    input: {
      goal: "Figure out why nightly backups are silently failing",
      recentSteps: [
        { action: "checked backup script exit code", result: "exits 0, reports 'success' but the output file is 0 bytes" },
        { action: "checked disk space on the backup target", result: "plenty of space available" },
        { action: "checked backup script's database connection", result: "connects fine, runs a test query successfully" },
      ],
      latestStep: { action: "checked the dump command's actual permissions on the target tables", result: "found it: the backup DB user lost SELECT grant on 2 tables after last week's migration, dump silently skips them and still exits 0" },
    },
  },

  // ---------- temporary-failure-retry (should still retry) (3) ----------
  {
    id: "retry-01",
    category: "temporary-failure-retry",
    obvious: false,
    expected: "PROGRESSING",
    notes: "A single transient network blip; retrying immediately is the correct move, not stagnation.",
    input: {
      goal: "Upload the nightly report to the data warehouse",
      recentSteps: [
        { action: "uploaded report.csv", result: "connection reset by peer" },
      ],
      latestStep: { action: "retried upload of report.csv", result: "upload succeeded, 200 OK" },
    },
  },
  {
    id: "retry-02",
    category: "temporary-failure-retry",
    obvious: false,
    expected: "PROGRESSING",
    notes: "Rate-limited then backed off correctly and succeeded -- this is healthy retry behavior, not a loop.",
    input: {
      goal: "Sync inventory counts to the storefront",
      recentSteps: [
        { action: "called storefront API to push inventory update", result: "429 Too Many Requests, Retry-After: 2s" },
        { action: "waited 2s and retried the same call", result: "429 Too Many Requests, Retry-After: 5s" },
      ],
      latestStep: { action: "waited 5s and retried the same call", result: "200 OK, inventory synced" },
    },
  },
  {
    id: "retry-03",
    category: "temporary-failure-retry",
    obvious: false,
    expected: "PROGRESSING",
    notes: "Still mid-retry with backoff and no evidence yet that the cause is permanent -- reasonable to keep going, not yet stalled.",
    input: {
      goal: "Deploy the new container image",
      recentSteps: [
        { action: "pulled the image from the registry", result: "registry returned 503, transient" },
      ],
      latestStep: { action: "waited 10s and retried the pull", result: "registry returned 503 again, still transient per registry status page which shows an active incident" },
    },
  },

  // ---------- genuine-strategy-switch (4) ----------
  {
    id: "switch-01",
    category: "genuine-strategy-switch",
    obvious: true,
    expected: "PROGRESSING",
    notes: "Agent abandons the failed permissions theory and pivots to a genuinely new hypothesis, which pays off.",
    input: {
      goal: "Fix the failing deployment",
      recentSteps: [
        { action: "checked file permissions on release dir", result: "permission denied" },
        { action: "tried sudo", result: "sudo unavailable" },
        { action: "tried deploying to an alternate path", result: "same permission problem" },
      ],
      latestStep: { action: "abandoned the permissions theory and checked the deploy user's account status instead", result: "found it: deploy user's account was disabled by IT yesterday during an offboarding sweep; re-enabling it should fix all the permission errors at once" },
    },
  },
  {
    id: "switch-02",
    category: "genuine-strategy-switch",
    obvious: false,
    expected: "PROGRESSING",
    notes: "Switches from code-level debugging to infra-level, a legitimately different layer of the stack.",
    input: {
      goal: "Fix requests timing out under load",
      recentSteps: [
        { action: "profiled the request handler code", result: "handler itself completes in <50ms, no code-level bottleneck found" },
        { action: "added more logging inside the handler", result: "confirms handler is fast; timeouts happen before the handler is even invoked" },
      ],
      latestStep: { action: "checked the load balancer's connection queue metrics instead of app code", result: "found it: LB max connections is capped at 100, far below current traffic, causing queued requests to time out" },
    },
  },
  {
    id: "switch-03",
    category: "genuine-strategy-switch",
    obvious: false,
    expected: "PROGRESSING",
    notes: "Gives up on fixing the library and works around it entirely -- a real strategy change that unblocks the goal.",
    input: {
      goal: "Get PDF exports working again",
      recentSteps: [
        { action: "tried downgrading the PDF library to the last known-good version", result: "same rendering crash" },
        { action: "tried patching the library's font-loading code directly", result: "patch didn't resolve the crash, deeper bug in the library's native bindings" },
      ],
      latestStep: { action: "swapped to a different PDF-generation library entirely and wired up a minimal export path", result: "export works end-to-end with the new library, crash is gone" },
    },
  },
  {
    id: "switch-04",
    category: "genuine-strategy-switch",
    obvious: false,
    expected: "PROGRESSING",
    notes: "Switch happens but outcome of the switch is not yet known -- still counts as progress since it's a genuinely new, untested avenue.",
    input: {
      goal: "Get the ML model's validation accuracy above 90%",
      recentSteps: [
        { action: "tuned learning rate across 5 values", result: "best accuracy plateaued at 82%, no further gains from LR alone" },
        { action: "tried 3 different regularization strengths", result: "accuracy stayed at 82%, regularization wasn't the bottleneck" },
      ],
      latestStep: { action: "switched strategy: added 2 new engineered features derived from user session length", result: "first run with new features already at 87% accuracy, clear improvement" },
    },
  },

  // ---------- premature-done-claim (3) ----------
  {
    id: "premature-01",
    category: "premature-done-claim",
    obvious: true,
    expected: "STALLED",
    notes: "Agent claims done without actually verifying; evidence contradicts the claim.",
    input: {
      goal: "Fix the failing test suite",
      recentSteps: [
        { action: "changed the assertion in test_user_login.py", result: "modified the expected value to match actual output" },
      ],
      latestStep: { action: "declared 'All tests should now pass' without re-running the suite", result: "no test run was actually executed; suite status is unknown" },
    },
  },
  {
    id: "premature-02",
    category: "premature-done-claim",
    obvious: true,
    expected: "STALLED",
    notes: "Claims goal complete but the verification step itself failed/was skipped.",
    input: {
      goal: "Migrate the users table to the new schema",
      recentSteps: [
        { action: "wrote and ran the migration script", result: "script completed, exit code 0" },
      ],
      latestStep: { action: "reported 'Migration complete' without querying the table to confirm the new columns exist", result: "no verification query was run; migration success is unconfirmed" },
    },
  },
  {
    id: "premature-03",
    category: "premature-done-claim",
    obvious: false,
    expected: "STALLED",
    notes: "Partial fix claimed as full completion -- some evidence of progress but the stated goal is not actually met.",
    input: {
      goal: "Make the signup form accessible (WCAG AA)",
      recentSteps: [
        { action: "added aria-labels to all input fields", result: "screen reader now announces field names correctly" },
        { action: "fixed color contrast on the submit button", result: "contrast ratio now meets AA" },
      ],
      latestStep: { action: "declared the form 'fully WCAG AA compliant'", result: "keyboard-only navigation still traps focus inside the modal, never actually tested" },
    },
  },

  // ---------- successful-completion (4) ----------
  {
    id: "complete-01",
    category: "successful-completion",
    obvious: true,
    expected: "COMPLETE",
    notes: "Goal explicitly verified by evidence, not just claimed.",
    input: {
      goal: "Fix the failing deployment",
      recentSteps: [
        { action: "identified permission mismatch on release dir", result: "confirmed root cause" },
        { action: "chown'd the release dir to the deploy user", result: "ownership fixed" },
      ],
      latestStep: { action: "ran the deploy and checked the health endpoint", result: "deploy succeeded, /health returns 200, new version visible in the app footer" },
    },
  },
  {
    id: "complete-02",
    category: "successful-completion",
    obvious: true,
    expected: "COMPLETE",
    notes: "Test suite goal, verified green run.",
    input: {
      goal: "Get the test suite passing in CI",
      recentSteps: [
        { action: "fixed the flaky selector in the modal test", result: "modal test passes locally 10/10 runs" },
        { action: "pushed the fix and triggered CI", result: "CI pipeline started" },
      ],
      latestStep: { action: "checked CI results", result: "all 214 tests passed, pipeline is green" },
    },
  },
  {
    id: "complete-03",
    category: "successful-completion",
    obvious: false,
    expected: "COMPLETE",
    notes: "Completion confirmed via an indirect but valid verification signal.",
    input: {
      goal: "Stop the disk-full alerts on the log server",
      recentSteps: [
        { action: "set up log rotation with 7-day retention", result: "old logs beyond 7 days now get compressed and deleted nightly" },
        { action: "manually ran the rotation script once", result: "disk usage dropped from 96% to 61%" },
      ],
      latestStep: { action: "checked alerting dashboard 24 hours later", result: "no disk-full alerts fired overnight, disk usage stable at 63%" },
    },
  },
  {
    id: "complete-04",
    category: "successful-completion",
    obvious: false,
    expected: "COMPLETE",
    notes: "Narrow, well-scoped goal fully satisfied even though broader system has other unrelated issues.",
    input: {
      goal: "Make the /health endpoint return the current git SHA",
      recentSteps: [
        { action: "added GIT_SHA env var to the build pipeline", result: "env var now populated at build time" },
        { action: "wired /health handler to read GIT_SHA", result: "handler updated" },
      ],
      latestStep: { action: "curled /health after deploying", result: "response includes {\"sha\": \"a1b2c3d\"} matching the latest commit" },
    },
  },

  // ---------- regression (4) ----------
  {
    id: "regress-01",
    category: "regression",
    obvious: true,
    expected: "REGRESSING",
    notes: "Fix for one thing breaks a previously working thing.",
    input: {
      goal: "Speed up the product listing page",
      recentSteps: [
        { action: "added a cache layer in front of the listing query", result: "page load dropped from 1.2s to 300ms" },
        { action: "increased cache TTL to 1 hour to further reduce DB load", result: "page load stayed at 300ms" },
      ],
      latestStep: { action: "shipped the change to production", result: "listing page now shows stale, out-of-stock items as available; customers are ordering unavailable products" },
    },
  },
  {
    id: "regress-02",
    category: "regression",
    obvious: true,
    expected: "REGRESSING",
    notes: "Rollback attempt itself introduces a new break, undoing prior working state.",
    input: {
      goal: "Roll back the bad release",
      recentSteps: [
        { action: "identified release v42 as the cause of the outage", result: "confirmed via error rate spike timing" },
        { action: "ran rollback to v41", result: "rollback script reported success" },
      ],
      latestStep: { action: "checked service status after rollback", result: "service is now down entirely -- rollback script reverted the database migration too, and v41's code is incompatible with the reverted schema" },
    },
  },
  {
    id: "regress-03",
    category: "regression",
    obvious: false,
    expected: "REGRESSING",
    notes: "Config change silently disables something that was working, discovered by contrast with prior state.",
    input: {
      goal: "Reduce noisy alerts from the monitoring system",
      recentSteps: [
        { action: "raised the CPU alert threshold from 80% to 95%", result: "noisy CPU alerts stopped" },
        { action: "also raised the memory alert threshold from 85% to 98% for consistency", result: "noisy memory alerts stopped" },
      ],
      latestStep: { action: "checked alert history a week later", result: "a real memory leak incident last night went undetected for 6 hours because the new 98% threshold was too high -- previously it would have paged within 20 minutes" },
    },
  },
  {
    id: "regress-04",
    category: "regression",
    obvious: false,
    expected: "REGRESSING",
    notes: "Optimization undoes correctness that a previous step had established.",
    input: {
      goal: "Reduce API response payload size",
      recentSteps: [
        { action: "removed unused 'metadata' field from the user object response", result: "payload size reduced by 15%, no reported issues" },
        { action: "removed 'created_at' field as well, believed unused", result: "payload size reduced further" },
      ],
      latestStep: { action: "checked downstream mobile app logs after the change shipped", result: "mobile app crashes on the profile screen: it depends on 'created_at' to render 'member since' -- a field that previously worked is now broken" },
    },
  },

  // ---------- ambiguous / borderline (4) ----------
  {
    id: "ambig-01",
    category: "ambiguous-borderline",
    obvious: false,
    expected: "STALLED",
    notes: "Genuinely hard: looks like exploration, but all three probes tested the same 'it's the network' assumption without new information.",
    input: {
      goal: "Diagnose why the mobile app can't reach the API from cellular networks",
      recentSteps: [
        { action: "tested on carrier A's network", result: "connection fails" },
        { action: "tested on carrier B's network", result: "connection fails" },
      ],
      latestStep: { action: "tested on carrier C's network", result: "connection fails (all three tests only confirm it's not carrier-specific, which was already suspected after test 2; no new hypothesis is being formed)" },
    },
  },
  {
    id: "ambig-02",
    category: "ambiguous-borderline",
    obvious: false,
    expected: "PROGRESSING",
    notes: "Borderline the other way: the third carrier test is what actually confirms 'not carrier-specific' with statistical confidence, which is meaningfully new evidence for ruling out an entire class of causes.",
    input: {
      goal: "Diagnose why the mobile app can't reach the API from cellular networks",
      recentSteps: [
        { action: "hypothesized it might be carrier-specific DNS filtering and tested carrier A", result: "connection fails, consistent with hypothesis but not conclusive" },
        { action: "tested carrier B to check if the DNS filtering theory holds", result: "connection fails too" },
      ],
      latestStep: { action: "tested carrier C, the last major carrier, and also tested over wifi as a control", result: "fails on all 3 carriers but works over wifi -- narrows the cause to something in the cellular network path generally (e.g. a captive portal or MTU issue), ruling out any single carrier's DNS filtering" },
    },
  },
  {
    id: "ambig-03",
    category: "ambiguous-borderline",
    obvious: false,
    expected: "STALLED",
    notes: "Agent is technically taking new actions but they're increasingly desperate variations with no diagnostic value.",
    input: {
      goal: "Get the Docker build to succeed",
      recentSteps: [
        { action: "cleared Docker build cache and rebuilt", result: "same error: 'failed to solve: process did not complete successfully'" },
        { action: "restarted Docker daemon and rebuilt", result: "same error" },
        { action: "reordered a few unrelated lines in the Dockerfile and rebuilt", result: "same error, no actual diagnostic step was taken to read the full error output" },
      ],
      latestStep: { action: "rebuilt with --no-cache and -q flags", result: "same error (the actual failing RUN command's stderr has never been inspected)" },
    },
  },
  {
    id: "ambig-04",
    category: "ambiguous-borderline",
    obvious: false,
    expected: "PROGRESSING",
    notes: "Looks similar to ambig-03 on the surface, but this time the agent actually reads the error output on the latest step -- a real diagnostic step, not a variation.",
    input: {
      goal: "Get the Docker build to succeed",
      recentSteps: [
        { action: "cleared Docker build cache and rebuilt", result: "same error: 'failed to solve: process did not complete successfully'" },
        { action: "restarted Docker daemon and rebuilt", result: "same error" },
      ],
      latestStep: { action: "ran the build with --progress=plain to capture full stderr of the failing RUN step", result: "found it: 'RUN npm ci' fails because package-lock.json references a private registry package that requires an auth token not present in the build environment" },
    },
  },

  // ---------- a few extra hard cases to round out coverage ----------
  {
    id: "extra-01",
    category: "same-assumption-different-actions",
    obvious: false,
    expected: "STALLED",
    notes: "Different infra tools pointed at the same wrong layer (DNS) when the real issue is TLS.",
    input: {
      goal: "Fix intermittent 'connection refused' errors reaching the payments service",
      recentSteps: [
        { action: "flushed local DNS cache", result: "errors persist" },
        { action: "switched to a different DNS resolver (8.8.8.8)", result: "errors persist" },
      ],
      latestStep: { action: "added a hosts-file entry to bypass DNS entirely", result: "errors persist -- connection is refused even hitting the IP directly, the actual cause is the payments service rejecting TLS handshakes from an expired client cert" },
    },
  },
  {
    id: "extra-02",
    category: "productive-exploration",
    obvious: false,
    expected: "PROGRESSING",
    notes: "Negative result on the latest step, but it's the first real test of a specific, previously untested hypothesis -- informative, not a repeat.",
    input: {
      goal: "Find why nightly cron jobs stopped running",
      recentSteps: [
        { action: "confirmed cron daemon is running", result: "cron process is alive and healthy" },
        { action: "confirmed crontab entries are still present", result: "all expected entries present, unchanged" },
      ],
      latestStep: { action: "checked system clock/timezone for drift after a recent server migration", result: "no drift found -- rules out clock skew as the cause, leaving the cron user's shell environment as the next thing to check" },
    },
  },
  {
    id: "extra-03",
    category: "regression",
    obvious: true,
    expected: "REGRESSING",
    notes: "Clear undo of a previously-fixed bug.",
    input: {
      goal: "Keep the login page fast and working",
      recentSteps: [
        { action: "fixed a race condition in the login form's submit handler", result: "confirmed login works reliably across 20 manual attempts" },
        { action: "refactored the submit handler for readability", result: "refactor merged" },
      ],
      latestStep: { action: "tested login after the refactor", result: "race condition is back: double-clicking submit sends two requests again, exact bug that was fixed 2 steps ago" },
    },
  },
  {
    id: "extra-04",
    category: "premature-done-claim",
    obvious: false,
    expected: "STALLED",
    notes: "Claims success based on a proxy metric that doesn't actually confirm the goal.",
    input: {
      goal: "Reduce customer-reported checkout errors to zero",
      recentSteps: [
        { action: "fixed the null-pointer bug in the discount-code handler", result: "unit tests for discount codes now pass" },
      ],
      latestStep: { action: "declared 'checkout errors resolved' based on the passing unit tests alone", result: "no production error-rate data was checked; live checkout error rate is still unknown" },
    },
  },
  {
    id: "extra-05",
    category: "broad-research-no-signal",
    obvious: false,
    expected: "STALLED",
    notes: "Agent keeps consulting general references instead of the specific system in front of it.",
    input: {
      goal: "Find why this specific Terraform apply fails with a cryptic provider error",
      recentSteps: [
        { action: "read general Terraform provider documentation", result: "generic overview of how providers work" },
        { action: "read a Stack Overflow thread about a similarly-worded but unrelated error", result: "thread describes a different resource type, not applicable" },
      ],
      latestStep: { action: "read the provider's general changelog", result: "lists unrelated feature additions, nothing about the specific error string from this apply" },
    },
  },
  {
    id: "extra-06",
    category: "genuine-strategy-switch",
    obvious: true,
    expected: "PROGRESSING",
    notes: "Clear pivot away from a dead end into a working solution.",
    input: {
      goal: "Get large file uploads working reliably",
      recentSteps: [
        { action: "increased the server request body size limit", result: "still fails for files over 500MB, proxy times out first" },
        { action: "increased the proxy timeout", result: "still fails intermittently, single large request is fragile over unreliable client connections" },
      ],
      latestStep: { action: "switched to chunked multipart upload with resumable parts", result: "500MB+ files now upload reliably even over flaky connections, verified with 10 test uploads" },
    },
  },
  {
    id: "extra-07",
    category: "same-assumption-different-actions",
    obvious: false,
    expected: "STALLED",
    notes: "Agent tries several different wording variations of the same prompt to an LLM, assuming prompt phrasing is the issue when it's actually a missing tool permission.",
    input: {
      goal: "Get the coding agent to successfully run the project's test suite",
      recentSteps: [
        { action: "reworded the instruction to 'please run the tests now'", result: "agent reports it cannot execute shell commands" },
        { action: "reworded the instruction with more explicit step-by-step phrasing", result: "agent reports it cannot execute shell commands" },
      ],
      latestStep: { action: "reworded the instruction a third time, adding urgency ('this is critical, run the tests')", result: "agent still reports it cannot execute shell commands -- the shell tool was never actually enabled for this agent session" },
    },
  },
];

export const totalFixtures = fixtures.length;
