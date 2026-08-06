// app/_lib/views-filters/run-contract-tests.postgres.ts
//
// Runs the EXACT SAME suite used against the file adapter — that's the
// actual proof the Postgres adapter is a safe drop-in, not just a hope.
// Requires DATABASE_URL pointed at a disposable Neon branch (Neon's
// instant branching is a good fit here: create a throwaway branch, run
// this, then delete it — never point this at a real data branch, since
// the suite creates and leaves behind test rows under synthetic
// project/dataset ids).

import { postgresFilterStore, postgresViewStore } from "./postgres-store";
import { runFilterStoreContractTests, runViewStoreContractTests } from "./contract-tests";

async function main() {
  await runFilterStoreContractTests(postgresFilterStore, "postgres-adapter");
  await runViewStoreContractTests(postgresViewStore, postgresFilterStore, "postgres-adapter");
  console.log("\nAll contract tests passed.");
}

main().catch((err) => {
  console.error("Contract test failure:", err);
  process.exit(1);
});
