import * as fs from "fs";
import * as path from "path";

/**
 * Copies compiled contract ABIs from artifacts/ to ../lib/contracts/
 * Run after `npx hardhat compile`:
 *   npx ts-node scripts/export-abis.ts
 */

const CONTRACTS = ["OperonNode", "NodeSale"];
const ARTIFACTS_DIR = path.join(__dirname, "..", "artifacts", "contracts");
const OUTPUT_DIR = path.join(__dirname, "..", "..", "lib", "contracts");

function main() {
  // Ensure output dir exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const name of CONTRACTS) {
    const artifactPath = path.join(ARTIFACTS_DIR, `${name}.sol`, `${name}.json`);
    if (!fs.existsSync(artifactPath)) {
      console.error(`Artifact not found: ${artifactPath}`);
      continue;
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
    const abi = artifact.abi;

    const outputPath = path.join(OUTPUT_DIR, `${name}.abi.json`);
    fs.writeFileSync(outputPath, JSON.stringify(abi, null, 2));
    console.log(`Exported ${name} ABI to ${outputPath}`);
  }

  // Also export a combined index file for easy imports
  const indexContent = CONTRACTS.map(
    (name) => `export { default as ${name}ABI } from "./${name}.abi.json";`
  ).join("\n") + "\n";

  fs.writeFileSync(path.join(OUTPUT_DIR, "index.ts"), indexContent);
  console.log(`Exported index.ts`);
}

main();
