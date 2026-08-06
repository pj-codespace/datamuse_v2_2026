// app/_lib/views-filters/run-contract-tests.file.ts
//
// Runs the contract suite against the file-based adapter, using an isolated
// temp directory so this never touches the real project's data/ folder.
// Later, an equivalent run-contract-tests.postgres.ts will exist and should
// pass the exact same imported suite unchanged.

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { fileFilterStore, fileViewStore } from "./file-store";
import { runFilterStoreContractTests, runViewStoreContractTests } from "./contract-tests";

async function main() {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "views-filters-test-"));
  process.env.VIEWS_FILTERS_DATA_ROOT = tmpRoot;

  try {
    await runFilterStoreContractTests(fileFilterStore, "file-adapter");
    await runViewStoreContractTests(fileViewStore, fileFilterStore, "file-adapter");
    console.log("\nAll contract tests passed.");
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("Contract test failure:", err);
  process.exit(1);
});
