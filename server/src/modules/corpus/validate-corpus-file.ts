/**
 * Read-only corpus package preflight. This module deliberately imports no
 * application database or environment configuration.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { inspectCorpusPackage } from "./corpus-package.js";

async function main(): Promise<void> {
  const [filename, ...extra] = process.argv.slice(2);
  if (!filename || extra.length > 0) {
    throw new Error("Usage: npm run corpus:validate -- <corpus-package.json>");
  }

  const absoluteFilename = path.resolve(filename);
  const input = JSON.parse(await readFile(absoluteFilename, "utf8")) as unknown;
  const report = inspectCorpusPackage(input);
  const safeReport = { ...report };
  delete safeReport.corpusPackage;

  process.stdout.write(`${JSON.stringify(safeReport, null, 2)}\n`);
  if (!report.readyForImport) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown validation error";
  process.stderr.write(`Corpus validation failed: ${message}\n`);
  process.exitCode = 1;
});
