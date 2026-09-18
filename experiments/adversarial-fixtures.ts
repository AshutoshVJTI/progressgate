import type { AdversarialFixture } from "./adversarial-types.js";

// 50 fixtures targeting the exact failure mode found in the first evaluation: different-looking
// actions that still depend on the same already-falsified assumption (SEMANTIC_BUSYWORK), versus
// actions that look similar but each genuinely eliminate possibilities or change strategy
// (PRODUCTIVE_EXPLORATION), plus a claim/verification split (UNVERIFIED_SUCCESS / VERIFIED_SUCCESS).
//
// Where possible, fixtures are built as matched pairs (shared `pairId`) that differ in exactly one
// governing fact: whether the root cause is already established (busywork) or still genuinely open
// (productive), or whether a claimed success is followed by an external check (verified) or not
// (unverified). `currentState` is used to carry the "already established" fact for busywork
// fixtures -- the authoritative state the agent's own actions ignore.

export const adversarialFixtures: AdversarialFixture[] = [
  // =========================================================================
  // PAIRED: busywork vs productive (8 pairs = 16 fixtures)
  // =========================================================================

  {
    id: "busy-dns-tls",
    pairId: "dns-tls",
    category: "SEMANTIC_BUSYWORK",
    notes: "Root cause (expired TLS cert) is already established. All three actions target DNS, which was never implicated.",
    input: {
      goal: "Fix 'connection refused' errors reaching the payments service",
      currentState: "Confirmed via server-side logs: the payments service is rejecting the TLS handshake because its certificate expired yesterday. DNS resolution has already been verified correct.",
      recentSteps: [
        { action: "flushed local DNS cache", result: "cache cleared, error persists" },
        { action: "switched to a different DNS resolver (8.8.8.8)", result: "same error persists" },
      ],
      latestStep: { action: "added a hosts-file entry to bypass DNS entirely and hit the IP directly", result: "still 'connection refused' even hitting the IP directly" },
    },
  },
  {
    id: "prod-dns-tls",
    pairId: "dns-tls",
    category: "PRODUCTIVE_EXPLORATION",
    notes: "Root cause is genuinely unknown. Each DNS-layer test rules something out and the final step narrows to a new layer.",
    input: {
      goal: "Fix 'connection refused' errors reaching the payments service",
      currentState: "Root cause not yet identified. Errors are intermittent and only affect some clients.",
      recentSteps: [
        { action: "flushed local DNS cache", result: "error persists, rules out a stale local cache entry" },
        { action: "switched to a different DNS resolver (8.8.8.8)", result: "error persists on a resolver known to be healthy, rules out a poisoned or misconfigured local resolver" },
      ],
      latestStep: { action: "added a hosts-file entry to bypass DNS entirely and tested over wifi as a control", result: "fails even bypassing DNS entirely, but succeeds over wifi -- rules out DNS as a cause altogether and narrows the problem to something in the cellular network path or the TLS layer" },
    },
  },

  {
    id: "busy-parser",
    pairId: "parser",
    category: "SEMANTIC_BUSYWORK",
    notes: "Evidence already contradicts the parser hypothesis (same byte pattern before parsing starts). All three actions still target the parser.",
    input: {
      goal: "Fix corrupted rows in the nightly import",
      currentState: "Confirmed by hex-dumping the raw source file: the corruption is already present in the file bytes before any parsing occurs. The parser has been ruled out as the cause.",
      recentSteps: [
        { action: "upgraded the CSV parsing library to the latest version", result: "corrupted rows still appear, identical byte pattern" },
        { action: "wrote a custom CSV parser to replace the library", result: "corrupted rows still appear, identical byte pattern" },
      ],
      latestStep: { action: "added stricter quote-escaping rules to the new custom parser", result: "corrupted rows still appear, identical byte pattern, unchanged from before any parser work began" },
    },
  },
  {
    id: "prod-parser",
    pairId: "parser",
    category: "PRODUCTIVE_EXPLORATION",
    notes: "Cause genuinely unclear. Each parser change surfaces new diagnostic detail that narrows the search.",
    input: {
      goal: "Fix corrupted rows in the nightly import",
      currentState: "Root cause not yet identified. Corruption appears in roughly 2% of nightly imports.",
      recentSteps: [
        { action: "upgraded the CSV parsing library to the latest version", result: "corruption still occurs, but now the library's verbose mode reports the exact byte offset where it diverges, which it didn't before" },
        { action: "wrote a minimal custom parser to isolate the library from the issue", result: "corruption still occurs at the same byte offsets even with the library removed entirely, ruling out a library-specific bug" },
      ],
      latestStep: { action: "diffed the raw source file against the previous night's successful file at those byte offsets", result: "found it: every corrupted offset lines up with a specific unescaped delimiter character coming from one upstream vendor's export, not from parsing logic at all" },
    },
  },

  {
    id: "busy-permissions",
    pairId: "permissions",
    category: "SEMANTIC_BUSYWORK",
    notes: "It's already established the deploy account itself is disabled. Path/sudo/alternate-path changes can't address an account-level block.",
    input: {
      goal: "Fix the failing deployment",
      currentState: "Confirmed with IT: the deploy service account was disabled yesterday during an offboarding sweep. This alone explains every permission error being seen.",
      recentSteps: [
        { action: "checked file permissions on the release directory", result: "permission denied" },
        { action: "changed the deploy path to /tmp/app-release", result: "permission denied on the new path too" },
      ],
      latestStep: { action: "searched for a third deploy path with different default ownership", result: "same underlying permission problem on that path as well" },
    },
  },
  {
    id: "prod-permissions",
    pairId: "permissions",
    category: "PRODUCTIVE_EXPLORATION",
    notes: "Cause genuinely unknown at the start. Each check eliminates a plausible cause and the final step points at a new, untested layer.",
    input: {
      goal: "Fix the failing deployment",
      currentState: "Root cause not yet identified.",
      recentSteps: [
        { action: "checked file permissions on the release directory", result: "permission denied; ownership shows root, deploy user is www-data" },
        { action: "checked whether the ownership was recently changed", result: "confirmed changed 2 days ago during a manual server patch, ruling out a long-standing misconfiguration" },
      ],
      latestStep: { action: "checked the deploy user account's status with IT instead of trying another path", result: "found it: the deploy account itself was disabled yesterday during an unrelated offboarding sweep, which explains the ownership change too" },
    },
  },

  {
    id: "busy-cache",
    pairId: "cache",
    category: "SEMANTIC_BUSYWORK",
    notes: "Publishing was already confirmed working. Re-checking it through different tools adds nothing.",
    input: {
      goal: "Fix cache invalidation not propagating to the EU region",
      currentState: "Confirmed: invalidation events are published correctly in us-east-1 and received by monitoring. Publishing is not the problem.",
      recentSteps: [
        { action: "re-checked event publishing using the AWS CLI", result: "confirms events are published, same as already known" },
        { action: "re-checked event publishing using the SDK's debug logger", result: "confirms events are published, same as already known" },
      ],
      latestStep: { action: "re-checked event publishing a third time using the provider's web console", result: "confirms events are published, same as already known, no new information" },
    },
  },
  {
    id: "prod-cache",
    pairId: "cache",
    category: "PRODUCTIVE_EXPLORATION",
    notes: "Cause unclear at the start. Publisher check rules out one layer, subscriber check finds the actual mismatch.",
    input: {
      goal: "Fix cache invalidation not propagating to the EU region",
      currentState: "Root cause not yet identified.",
      recentSteps: [
        { action: "checked whether invalidation events are published in us-east-1", result: "confirmed events are published correctly, ruling out the publisher" },
      ],
      latestStep: { action: "checked whether eu-west-1 subscribes to the same topic name", result: "found it: eu-west-1 still listens on the old topic name from before a naming migration, while us-east-1 now publishes to the new name" },
    },
  },

  {
    id: "busy-retry",
    pairId: "retry",
    category: "SEMANTIC_BUSYWORK",
    notes: "The outage is already confirmed on the provider's status page. Retrying with different timeouts can't fix a confirmed full outage.",
    input: {
      goal: "Get the payment processor call to succeed",
      currentState: "Confirmed on the vendor's public status page: the vendor is experiencing a full outage of this endpoint, ETA unknown.",
      recentSteps: [
        { action: "retried the call with timeout=5000", result: "still fails, connection refused" },
        { action: "retried the call with timeout=20000 and a fresh HTTP client", result: "still fails, connection refused" },
      ],
      latestStep: { action: "retried the call once more with a shorter timeout and 3 retries", result: "still fails, connection refused, consistent with the ongoing vendor outage" },
    },
  },
  {
    id: "prod-retry",
    pairId: "retry",
    category: "PRODUCTIVE_EXPLORATION",
    notes: "No confirmed outage. Each retry's evidence changes, consistent with genuine transient conditions resolving.",
    input: {
      goal: "Get the payment processor call to succeed",
      currentState: "No known outage. No prior evidence about why the call is failing.",
      recentSteps: [
        { action: "called the payment processor", result: "connection reset by peer" },
        { action: "retried once", result: "429 Too Many Requests, Retry-After: 3s -- new information: this is rate limiting, not a network issue" },
      ],
      latestStep: { action: "waited 3s as instructed and retried", result: "200 OK, call succeeded" },
    },
  },

  {
    id: "busy-docker",
    pairId: "docker",
    category: "SEMANTIC_BUSYWORK",
    notes: "It's already noted that the failing RUN step's actual stderr has never been read. None of these three actions read it.",
    input: {
      goal: "Get the Docker build to succeed",
      currentState: "Known gap: the full stderr output of the specific failing RUN command has not yet been captured or read by anyone on this trajectory.",
      recentSteps: [
        { action: "cleared the Docker build cache and rebuilt", result: "same generic error: 'failed to solve: process did not complete successfully'" },
        { action: "restarted the Docker daemon and rebuilt", result: "same generic error" },
      ],
      latestStep: { action: "reordered a few unrelated lines in the Dockerfile and rebuilt", result: "same generic error, stderr of the failing step still not inspected" },
    },
  },
  {
    id: "prod-docker",
    pairId: "docker",
    category: "PRODUCTIVE_EXPLORATION",
    notes: "Cache and daemon are genuinely plausible first guesses; ruling them out is real progress, and the final step captures the actual error.",
    input: {
      goal: "Get the Docker build to succeed",
      currentState: "Root cause not yet identified. Build started failing after an unrelated CI runner upgrade.",
      recentSteps: [
        { action: "cleared the Docker build cache and rebuilt", result: "same error, ruling out a stale cache layer as the cause" },
        { action: "restarted the Docker daemon and rebuilt", result: "same error, ruling out daemon-level flakiness" },
      ],
      latestStep: { action: "ran the build with --progress=plain to capture the full stderr of the failing step", result: "found it: 'RUN npm ci' fails because package-lock.json references a private registry package requiring an auth token missing from the new CI runner's environment" },
    },
  },

  {
    id: "busy-sql",
    pairId: "sql",
    category: "SEMANTIC_BUSYWORK",
    notes: "EXPLAIN already shows a join, not an index, is the bottleneck. Adding more indexes doesn't touch the actual blocker.",
    input: {
      goal: "Speed up the slow dashboard query",
      currentState: "Confirmed via EXPLAIN: all relevant columns already have indexes and they are being used. The bottleneck is a nested-loop join against the shipments table.",
      recentSteps: [
        { action: "added an index on orders.customer_id", result: "query time unchanged at 4.2s, EXPLAIN still shows the same join as the bottleneck" },
        { action: "added a composite index on (customer_id, region)", result: "query time unchanged at 4.1s, same join still dominates per EXPLAIN" },
      ],
      latestStep: { action: "added yet another index on shipments.order_id", result: "query time unchanged at 4.2s, EXPLAIN confirms the same join is still the bottleneck" },
    },
  },
  {
    id: "prod-sql",
    pairId: "sql",
    category: "PRODUCTIVE_EXPLORATION",
    notes: "Cause genuinely unclear at first. Each change is measured and the EXPLAIN plan check converges on the real bottleneck.",
    input: {
      goal: "Speed up the slow dashboard query",
      currentState: "Root cause not yet identified. Query has always been slow, no baseline EXPLAIN taken yet.",
      recentSteps: [
        { action: "added an index on orders.created_at", result: "query time dropped from 4.2s to 3.8s, a partial improvement worth investigating further" },
      ],
      latestStep: { action: "ran EXPLAIN ANALYZE to see what's still slow", result: "found it: a nested-loop join against shipments is scanning 2M rows per query, unrelated to any index added so far" },
    },
  },

  {
    id: "busy-jwt",
    pairId: "jwt",
    category: "SEMANTIC_BUSYWORK",
    notes: "The error message already states the cause explicitly (clock drift). Swapping libraries/keys/middleware doesn't touch clock sync.",
    input: {
      goal: "Fix 'invalid token' errors on login",
      currentState: "The verify-time error explicitly reads: 'token expired: server clock is 6 minutes ahead of token issuer, exceeds allowed skew'. Root cause is server clock drift, not the JWT stack.",
      recentSteps: [
        { action: "swapped the jsonwebtoken library for jose", result: "same error: 'token expired: server clock is 6 minutes ahead...'" },
        { action: "regenerated the signing keys", result: "same error, identical clock-drift message" },
      ],
      latestStep: { action: "switched to a different JWT verification middleware package", result: "same error, identical clock-drift message, unrelated to which library is used" },
    },
  },
  {
    id: "prod-jwt",
    pairId: "jwt",
    category: "PRODUCTIVE_EXPLORATION",
    notes: "Cause genuinely unclear at first; each swap changes the diagnostic detail available until the real cause surfaces.",
    input: {
      goal: "Fix 'invalid token' errors on login",
      currentState: "Root cause not yet identified. Error currently just reads 'invalid token' with no detail.",
      recentSteps: [
        { action: "swapped the jsonwebtoken library for jose, which has more verbose errors", result: "new detail surfaced: 'token expired at verify time', ruling out a signature-format incompatibility" },
      ],
      latestStep: { action: "logged the token's issued-at and the server's current time side by side", result: "found it: server clock is 6 minutes ahead of the token issuer, exceeding the allowed skew -- a clock sync issue, not a JWT library issue" },
    },
  },

  // =========================================================================
  // STANDALONE: additional busywork (7)
  // =========================================================================

  {
    id: "busy-flaky-test",
    category: "SEMANTIC_BUSYWORK",
    notes: "Root cause (hardcoded sleep race) already known from the log. None of the three actions touch it.",
    input: {
      goal: "Fix the flaky integration test in CI",
      currentState: "Confirmed in the test log: the test has a hardcoded 'sleep(200)' waiting for an animation that sometimes takes longer, causing an assertion race. This has already been identified as the cause.",
      recentSteps: [
        { action: "retried the CI job", result: "still flaky, fails about 1 in 5 runs, same assertion" },
        { action: "cleared the CI cache and reran", result: "still flaky, same assertion" },
      ],
      latestStep: { action: "bumped the CI runner to a newer image version", result: "still flaky at roughly the same rate, same assertion failure" },
    },
  },
  {
    id: "busy-wrong-env",
    category: "SEMANTIC_BUSYWORK",
    notes: "Endpoint is already confirmed pointed at the sandbox environment. Varying query filters can't fix an environment misconfiguration.",
    input: {
      goal: "Pull last month's transactions for reconciliation",
      currentState: "Confirmed: the /transactions endpoint being called is configured to point at the sandbox environment, not production. Sandbox has no transaction data.",
      recentSteps: [
        { action: "queried /transactions?month=2026-08&status=all", result: "empty array, HTTP 200" },
        { action: "queried /transactions?from=2026-08-01&to=2026-08-31", result: "empty array, HTTP 200" },
      ],
      latestStep: { action: "queried /transactions?range=last_30_days instead", result: "empty array, HTTP 200, same sandbox environment as before" },
    },
  },
  {
    id: "busy-memleak",
    category: "SEMANTIC_BUSYWORK",
    notes: "The leaking buffer pool is already identified. Trying different heap-dump tooling doesn't address it.",
    input: {
      goal: "Fix the memory leak in the worker process",
      currentState: "Confirmed via heap diff: the image-resize buffer pool is the source of the leak, growing ~400MB per 30 minutes with no other retained-size growth.",
      recentSteps: [
        { action: "took a heap snapshot using a different profiling tool", result: "confirms same buffer pool growth as already known, no new information" },
        { action: "took another snapshot with a longer sampling interval", result: "confirms same buffer pool growth pattern, no new information" },
      ],
      latestStep: { action: "took a third snapshot with verbose allocation stack traces enabled", result: "confirms the same buffer pool is growing, consistent with what was already known, but the buffer pool itself still hasn't been touched" },
    },
  },
  {
    id: "busy-cert-chain",
    category: "SEMANTIC_BUSYWORK",
    notes: "Missing intermediate cert is already confirmed as the cause. Browser/cache changes are client-side and irrelevant to a server-side chain issue.",
    input: {
      goal: "Fix the SSL warning on the checkout page",
      currentState: "Confirmed via openssl s_client: the server is not sending the intermediate certificate in the chain, which is the entire cause of the browser warning.",
      recentSteps: [
        { action: "cleared the browser cache and reloaded", result: "same SSL warning" },
        { action: "tested in an incognito window", result: "same SSL warning" },
      ],
      latestStep: { action: "tested in a different browser entirely", result: "same SSL warning, consistent with a server-side chain issue rather than anything client-side" },
    },
  },
  {
    id: "busy-ci-disk",
    category: "SEMANTIC_BUSYWORK",
    notes: "Disk-full on the CI runner is already confirmed. Build-flag changes don't free disk space.",
    input: {
      goal: "Fix the failing CI build",
      currentState: "Confirmed via the runner's system logs: the build fails because the CI runner's disk is at 100% capacity, unrelated to the build configuration.",
      recentSteps: [
        { action: "changed the build cache strategy to a smaller cache key", result: "still fails with 'no space left on device'" },
        { action: "reduced build parallelism from 8 to 2 jobs", result: "still fails with 'no space left on device'" },
      ],
      latestStep: { action: "pinned the compiler to an older version to see if it helped", result: "still fails with 'no space left on device', disk is still at 100%" },
    },
  },
  {
    id: "busy-rate-limit",
    category: "SEMANTIC_BUSYWORK",
    notes: "Rate-limit headers already confirm the block. Different keys/SDKs/retry counts don't change the account-level limit.",
    input: {
      goal: "Get the third-party enrichment API call to succeed",
      currentState: "Confirmed via response headers: the account is rate-limited at 100 req/min and the current usage is already over that limit for this billing period, per the vendor dashboard.",
      recentSteps: [
        { action: "switched to a backup API key", result: "still 429, same rate-limit headers, keys share the same account limit" },
        { action: "switched to a different HTTP client library", result: "still 429, same rate-limit headers" },
      ],
      latestStep: { action: "reduced the retry count and added jitter", result: "still 429, same rate-limit headers, account-level limit unaffected" },
    },
  },
  {
    id: "busy-deadlock",
    category: "SEMANTIC_BUSYWORK",
    notes: "The lock-order cause is already identified from the deadlock graph. Isolation-level/pool-size changes don't touch lock order.",
    input: {
      goal: "Fix the recurring database deadlocks",
      currentState: "Confirmed via the deadlock graph: two transactions acquire locks on the orders and inventory tables in opposite order, which is the entire cause of the deadlocks.",
      recentSteps: [
        { action: "lowered the transaction isolation level", result: "deadlocks still occur at the same rate" },
        { action: "increased the connection pool size", result: "deadlocks still occur at the same rate" },
      ],
      latestStep: { action: "reduced the transaction retry count to fail faster", result: "deadlocks still occur at the same rate, lock order in the code is unchanged" },
    },
  },

  // =========================================================================
  // STANDALONE: additional productive exploration (7)
  // =========================================================================

  {
    id: "prod-flaky-narrow",
    category: "PRODUCTIVE_EXPLORATION",
    notes: "Several false starts, but each rules something out and a real lead emerges, even though not yet fixed.",
    input: {
      goal: "Fix the flaky integration test in CI",
      currentState: "Root cause not yet identified.",
      recentSteps: [
        { action: "checked whether failures correlate with test order", result: "no correlation found, ruling out test-order pollution" },
        { action: "checked whether failures correlate with CI runner load", result: "no correlation with load, ruling out resource contention" },
      ],
      latestStep: { action: "diffed the timing logs of a passing run against a failing run", result: "found a real lead: the failing run's animation takes 340ms while the test only waits 200ms before asserting -- a timing race, not yet fixed but now well understood" },
    },
  },
  {
    id: "prod-memleak-narrow",
    category: "PRODUCTIVE_EXPLORATION",
    notes: "Heap snapshots at genuinely different configurations progressively eliminate candidates.",
    input: {
      goal: "Fix the memory leak in the worker process",
      currentState: "Root cause not yet identified.",
      recentSteps: [
        { action: "took heap snapshots with the image-resize feature disabled via flag", result: "leak persists at the same rate, ruling out the image-resize path" },
        { action: "took heap snapshots with the PDF-export feature disabled via flag", result: "leak growth rate dropped by roughly half, implicating PDF export as a partial contributor" },
      ],
      latestStep: { action: "took a heap snapshot focused on PDF-export's buffer allocations specifically", result: "found it: PDF export allocates a new encoder buffer per request and never releases it back to the pool" },
    },
  },
  {
    id: "prod-ssl-narrow",
    category: "PRODUCTIVE_EXPLORATION",
    notes: "Each check rules out a distinct SSL failure mode before landing on the real one.",
    input: {
      goal: "Fix the SSL warning on the checkout page",
      currentState: "Root cause not yet identified.",
      recentSteps: [
        { action: "checked the certificate's expiry date", result: "cert is valid for another 200 days, ruling out expiry" },
        { action: "checked the certificate revocation status via OCSP", result: "not revoked, ruling out revocation" },
      ],
      latestStep: { action: "checked the full certificate chain the server sends using openssl s_client", result: "found it: the server is not sending the intermediate certificate, breaking the chain of trust in browsers that don't cache it" },
    },
  },
  {
    id: "prod-ci-disk-narrow",
    category: "PRODUCTIVE_EXPLORATION",
    notes: "Rules out code-level causes before checking infrastructure, which reveals the real issue.",
    input: {
      goal: "Fix the failing CI build",
      currentState: "Root cause not yet identified.",
      recentSteps: [
        { action: "checked whether the failure correlates with a specific code change", result: "no correlation, the same commit passed locally, ruling out a code regression" },
        { action: "checked whether the failure is reproducible on a fresh CI runner", result: "fails consistently even on a fresh runner, ruling out a one-off flake" },
      ],
      latestStep: { action: "checked disk usage on the runner via df -h", result: "found it: disk is at 100% capacity, unrelated to the code at all" },
    },
  },
  {
    id: "prod-rate-limit-narrow",
    category: "PRODUCTIVE_EXPLORATION",
    notes: "Time-based and vendor-side checks each add new, previously-unavailable information.",
    input: {
      goal: "Get the third-party enrichment API call to succeed",
      currentState: "Root cause not yet identified.",
      recentSteps: [
        { action: "logged failure timestamps over the past week", result: "found a pattern: failures cluster in a 2-hour daily window, ruling out a constant/permanent block" },
      ],
      latestStep: { action: "checked the vendor's status page for incidents during that window", result: "found it: the vendor reports no incidents, but their docs note a per-IP quota that resets daily -- narrows the cause to a specific shared outbound IP hitting its own quota" },
    },
  },
  {
    id: "prod-deadlock-narrow",
    category: "PRODUCTIVE_EXPLORATION",
    notes: "Each step adds a new piece of the causal chain, converging on lock order without yet fixing it.",
    input: {
      goal: "Fix the recurring database deadlocks",
      currentState: "Root cause not yet identified.",
      recentSteps: [
        { action: "confirmed deadlocks correlate with concurrent checkout attempts on the same order", result: "narrows scope to the checkout code path specifically" },
      ],
      latestStep: { action: "pulled the deadlock graph for the two blocked transactions", result: "found it: the two transactions acquire locks on orders and inventory in opposite order" },
    },
  },
  {
    id: "prod-timeout-signature",
    category: "PRODUCTIVE_EXPLORATION",
    notes: "Hardest productive case: surface-similar timeout retries, but each attempt's distinct failure signature is real diagnostic information about where the bottleneck sits.",
    input: {
      goal: "Fix intermittent timeouts calling the internal recommendations service",
      currentState: "Root cause not yet identified.",
      recentSteps: [
        { action: "called the service with a 2s timeout", result: "times out at exactly 2s with no partial response" },
        { action: "called the service with a 5s timeout", result: "times out at exactly 5s with no partial response -- the call never completes even given far more time" },
      ],
      latestStep: { action: "called the service with a 10s timeout while watching server-side logs", result: "server logs show the request never even arrives -- narrows the problem away from service-side processing time entirely and onto the network path or a connection pool exhaustion upstream" },
    },
  },

  // =========================================================================
  // MATCHED: unverified vs verified success (10 pairs = 20 fixtures)
  // =========================================================================

  {
    id: "unverified-deploy",
    pairId: "deploy-success",
    category: "UNVERIFIED_SUCCESS",
    notes: "Claims deploy succeeded with no check performed.",
    input: {
      goal: "Fix the failing deployment",
      recentSteps: [
        { action: "identified the ownership mismatch on the release directory", result: "confirmed root cause" },
        { action: "chown'd the release directory to the deploy user", result: "command completed" },
      ],
      latestStep: { action: "reran the deploy script and declared 'deploy is fixed'", result: "deploy script exited 0; no health check, log tail, or other verification was performed" },
    },
  },
  {
    id: "verified-deploy",
    pairId: "deploy-success",
    category: "VERIFIED_SUCCESS",
    notes: "Same claim, but followed by an explicit external check confirming it.",
    input: {
      goal: "Fix the failing deployment",
      recentSteps: [
        { action: "identified the ownership mismatch on the release directory", result: "confirmed root cause" },
        { action: "chown'd the release directory to the deploy user", result: "command completed" },
      ],
      latestStep: { action: "reran the deploy and curled the /health endpoint", result: "deploy exited 0 and /health returns 200 with the new version's git SHA in the response" },
    },
  },

  {
    id: "unverified-tests",
    pairId: "tests-pass",
    category: "UNVERIFIED_SUCCESS",
    notes: "Claims tests should pass without rerunning the suite.",
    input: {
      goal: "Get the test suite passing in CI",
      recentSteps: [
        { action: "fixed the flaky selector in the modal test", result: "changed the selector from #modal to [data-testid=modal]" },
      ],
      latestStep: { action: "declared 'all tests should now pass' without rerunning CI", result: "no test run was actually executed after the change; suite status is unknown" },
    },
  },
  {
    id: "verified-tests",
    pairId: "tests-pass",
    category: "VERIFIED_SUCCESS",
    notes: "Same fix, but CI was actually rerun and the result checked.",
    input: {
      goal: "Get the test suite passing in CI",
      recentSteps: [
        { action: "fixed the flaky selector in the modal test", result: "changed the selector from #modal to [data-testid=modal]" },
      ],
      latestStep: { action: "pushed the fix and checked the CI run result", result: "CI ran the full suite: 214/214 tests passed, pipeline is green" },
    },
  },

  {
    id: "unverified-migration",
    pairId: "migration",
    category: "UNVERIFIED_SUCCESS",
    notes: "Migration script exiting 0 is treated as proof, without checking the actual table.",
    input: {
      goal: "Migrate the users table to the new schema",
      recentSteps: [
        { action: "wrote the migration script adding the new columns", result: "script written" },
      ],
      latestStep: { action: "ran the migration script and reported 'migration complete'", result: "script exited 0; no query was run against the table to confirm the new columns actually exist or are populated" },
    },
  },
  {
    id: "verified-migration",
    pairId: "migration",
    category: "VERIFIED_SUCCESS",
    notes: "Same migration, but the table was actually queried afterward.",
    input: {
      goal: "Migrate the users table to the new schema",
      recentSteps: [
        { action: "wrote the migration script adding the new columns", result: "script written" },
      ],
      latestStep: { action: "ran the migration script and queried the table afterward", result: "script exited 0 and a SELECT confirms the new columns exist with expected default values across all 40,000 rows" },
    },
  },

  {
    id: "unverified-bugfix",
    pairId: "bugfix",
    category: "UNVERIFIED_SUCCESS",
    notes: "Claims the crash is fixed based only on reading the code change, no repro attempted.",
    input: {
      goal: "Fix the null-pointer crash on the profile page",
      recentSteps: [
        { action: "found the bug: profile.avatar is accessed before checking it's non-null", result: "root cause identified" },
      ],
      latestStep: { action: "added a null check and declared the crash fixed", result: "code change made; the crash was never actually reproduced again to confirm the fix works" },
    },
  },
  {
    id: "verified-bugfix",
    pairId: "bugfix",
    category: "VERIFIED_SUCCESS",
    notes: "Same fix, but the original repro steps were rerun and confirmed clean.",
    input: {
      goal: "Fix the null-pointer crash on the profile page",
      recentSteps: [
        { action: "found the bug: profile.avatar is accessed before checking it's non-null", result: "root cause identified" },
      ],
      latestStep: { action: "added a null check and reran the original crash repro steps 20 times", result: "0 crashes across 20 repro attempts, previously crashed on nearly every attempt" },
    },
  },

  {
    id: "unverified-cache-fix",
    pairId: "cache-fix",
    category: "UNVERIFIED_SUCCESS",
    notes: "Claims propagation now works after a config change, no cross-region test performed.",
    input: {
      goal: "Fix cache invalidation not propagating to the EU region",
      recentSteps: [
        { action: "found the mismatch: eu-west-1 was subscribed to the old topic name", result: "root cause identified" },
      ],
      latestStep: { action: "updated eu-west-1's subscription to the new topic name and declared it fixed", result: "config change applied; no test invalidation event was actually sent or observed arriving in eu-west-1" },
    },
  },
  {
    id: "verified-cache-fix",
    pairId: "cache-fix",
    category: "VERIFIED_SUCCESS",
    notes: "Same fix, with a test event actually sent and observed arriving.",
    input: {
      goal: "Fix cache invalidation not propagating to the EU region",
      recentSteps: [
        { action: "found the mismatch: eu-west-1 was subscribed to the old topic name", result: "root cause identified" },
      ],
      latestStep: { action: "updated the subscription and published a test invalidation event", result: "test event observed arriving in eu-west-1's cache layer within 1.2 seconds, confirmed via the region's own logs" },
    },
  },

  {
    id: "unverified-email",
    pairId: "email",
    category: "UNVERIFIED_SUCCESS",
    notes: "Claims emails are sending after a config fix, no delivery confirmation checked.",
    input: {
      goal: "Fix emails not sending",
      recentSteps: [
        { action: "found the bug: the template renderer throws on a missing variable, silently dropping the send job", result: "root cause identified" },
      ],
      latestStep: { action: "added a default value for the missing variable and declared emails fixed", result: "code change deployed; no test email was actually sent or checked for delivery" },
    },
  },
  {
    id: "verified-email",
    pairId: "email",
    category: "VERIFIED_SUCCESS",
    notes: "Same fix, with a test email actually sent and delivery confirmed via the provider dashboard.",
    input: {
      goal: "Fix emails not sending",
      recentSteps: [
        { action: "found the bug: the template renderer throws on a missing variable, silently dropping the send job", result: "root cause identified" },
      ],
      latestStep: { action: "added a default value and sent a test email", result: "test email confirmed delivered in the provider's dashboard within 10 seconds" },
    },
  },

  {
    id: "unverified-perf",
    pairId: "perf",
    category: "UNVERIFIED_SUCCESS",
    notes: "Claims the query is fast now based on adding an index, without re-timing it.",
    input: {
      goal: "Speed up the slow dashboard query",
      recentSteps: [
        { action: "identified the missing join-key index as the bottleneck via EXPLAIN", result: "root cause identified" },
      ],
      latestStep: { action: "added the index and declared the query fast now", result: "index created; the query was never actually re-run or re-timed to confirm the improvement" },
    },
  },
  {
    id: "verified-perf",
    pairId: "perf",
    category: "VERIFIED_SUCCESS",
    notes: "Same fix, with the query actually re-run and timed.",
    input: {
      goal: "Speed up the slow dashboard query",
      recentSteps: [
        { action: "identified the missing join-key index as the bottleneck via EXPLAIN", result: "root cause identified" },
      ],
      latestStep: { action: "added the index and re-ran the query with EXPLAIN ANALYZE", result: "query time dropped from 4.2s to 180ms, confirmed by the new EXPLAIN ANALYZE output" },
    },
  },

  {
    id: "unverified-a11y",
    pairId: "a11y",
    category: "UNVERIFIED_SUCCESS",
    notes: "Claims full accessibility compliance after only some fixes, no scan or manual test performed.",
    input: {
      goal: "Make the signup form WCAG AA accessible",
      recentSteps: [
        { action: "added aria-labels to all inputs", result: "screen reader now announces field names" },
        { action: "fixed the submit button's color contrast", result: "contrast ratio now meets AA" },
      ],
      latestStep: { action: "declared the form fully WCAG AA compliant", result: "no automated scan was run and keyboard-only navigation was never tested" },
    },
  },
  {
    id: "verified-a11y",
    pairId: "a11y",
    category: "VERIFIED_SUCCESS",
    notes: "Same fixes, but an automated scan and manual keyboard test were actually run.",
    input: {
      goal: "Make the signup form WCAG AA accessible",
      recentSteps: [
        { action: "added aria-labels to all inputs", result: "screen reader now announces field names" },
        { action: "fixed the submit button's color contrast", result: "contrast ratio now meets AA" },
      ],
      latestStep: { action: "ran an automated axe-core scan and manually tested keyboard-only navigation", result: "axe-core reports 0 violations and keyboard navigation reaches and operates every control without a trap" },
    },
  },

  {
    id: "unverified-security",
    pairId: "security",
    category: "UNVERIFIED_SUCCESS",
    notes: "Claims the vulnerability is patched based on the code diff alone, no scan re-run.",
    input: {
      goal: "Patch the SQL injection vulnerability in the search endpoint",
      recentSteps: [
        { action: "identified the vulnerability: raw string concatenation into the query", result: "root cause identified" },
      ],
      latestStep: { action: "switched to parameterized queries and declared it patched", result: "code change made; the vulnerability scanner was never re-run to confirm the finding is gone" },
    },
  },
  {
    id: "verified-security",
    pairId: "security",
    category: "VERIFIED_SUCCESS",
    notes: "Same fix, with the scanner actually re-run and the finding confirmed cleared.",
    input: {
      goal: "Patch the SQL injection vulnerability in the search endpoint",
      recentSteps: [
        { action: "identified the vulnerability: raw string concatenation into the query", result: "root cause identified" },
      ],
      latestStep: { action: "switched to parameterized queries and re-ran the vulnerability scanner", result: "scanner report shows the SQL injection finding is no longer present, confirmed clean" },
    },
  },

  {
    id: "unverified-webhook",
    pairId: "webhook",
    category: "UNVERIFIED_SUCCESS",
    notes: "Claims webhook signature verification works after a header fix, no test webhook sent.",
    input: {
      goal: "Fix failing webhook signature verification",
      recentSteps: [
        { action: "found the vendor requires a new 'idempotency_key' header not yet being sent", result: "root cause identified" },
      ],
      latestStep: { action: "added the header and declared verification fixed", result: "code change deployed; no test webhook was actually sent through the provider to confirm" },
    },
  },
  {
    id: "verified-webhook",
    pairId: "webhook",
    category: "VERIFIED_SUCCESS",
    notes: "Same fix, with a test webhook actually sent via the provider's dashboard and confirmed received.",
    input: {
      goal: "Fix failing webhook signature verification",
      recentSteps: [
        { action: "found the vendor requires a new 'idempotency_key' header not yet being sent", result: "root cause identified" },
      ],
      latestStep: { action: "added the header and sent a test webhook via the provider's dashboard", result: "provider dashboard logs the test webhook as delivered with a 200 response and valid signature" },
    },
  },
];

export const totalAdversarialFixtures = adversarialFixtures.length;
