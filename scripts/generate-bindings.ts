import {
  createBindingsTempRoot,
  generateArtifacts,
  replaceCommittedArtifacts,
} from "./lib/bindings.js";
import { rm } from "node:fs/promises";

async function main(): Promise<void> {
  const tempRoot = await createBindingsTempRoot();

  try {
    await generateArtifacts(tempRoot);
    await replaceCommittedArtifacts(tempRoot);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

await main();
