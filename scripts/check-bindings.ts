import {
  createBindingsTempRoot,
  diffCommittedArtifacts,
  formatDifferences,
  generateArtifacts,
} from "./lib/bindings.js";
import { rm } from "node:fs/promises";

async function main(): Promise<void> {
  const tempRoot = await createBindingsTempRoot();

  try {
    await generateArtifacts(tempRoot);

    const differences = await diffCommittedArtifacts(tempRoot);

    if (differences.length > 0) {
      throw new Error(
        [
          "Generated bindings are out of date.",
          "Run `npm run bindings:generate` to refresh committed artifacts.",
          formatDifferences(differences),
        ].join("\n"),
      );
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

await main();
