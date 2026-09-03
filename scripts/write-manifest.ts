#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";

const dataPath = path.resolve(process.argv[2] ?? "data/dataset.jsonl");
const manifestPath = path.resolve(process.argv[3] ?? "manifest.json");
const hash = createHash("sha256");
for await (const chunk of createReadStream(dataPath)) hash.update(chunk);

let recordCount = 0;
let inputTraceCount = 0;
let outputTraceCount = 0;
let inputRoutePointCount = 0;
let outputRoutePointCount = 0;
const sources = new Map<
  string,
  { packageSpecifier: string; recordCount: number }
>();
const lines = createInterface({
  input: createReadStream(dataPath),
  crlfDelay: Number.POSITIVE_INFINITY,
});

for await (const line of lines) {
  if (!line.trim()) continue;
  const record = JSON.parse(line);
  const inputTraces = record.input.traces ?? [];
  const outputTraces = record.output.traces ?? [];
  const existing = sources.get(record.source.dataset);
  if (
    existing &&
    existing.packageSpecifier !== record.source.datasetPackageSpecifier
  ) {
    throw new Error(`Mixed package revisions for ${record.source.dataset}`);
  }
  sources.set(record.source.dataset, {
    packageSpecifier: record.source.datasetPackageSpecifier,
    recordCount: (existing?.recordCount ?? 0) + 1,
  });
  recordCount++;
  inputTraceCount += inputTraces.length;
  outputTraceCount += outputTraces.length;
  inputRoutePointCount += inputTraces.reduce(
    (sum: number, trace: { route: unknown[] }) => sum + trace.route.length,
    0,
  );
  outputRoutePointCount += outputTraces.reduce(
    (sum: number, trace: { route: unknown[] }) => sum + trace.route.length,
    0,
  );
}

const previous = JSON.parse(await readFile(manifestPath, "utf8"));
const manifest = {
  ...previous,
  dataFileSha256: hash.digest("hex"),
  recordCount,
  inputTraceCount,
  outputTraceCount,
  inputRoutePointCount,
  outputRoutePointCount,
  sources: [...sources.entries()].map(([dataset, value]) => ({
    dataset,
    ...value,
  })),
  source: {
    autorouterGitRevision: "3dbbad3a8a420a6469b5537034c672517264d608",
    router: "AutoroutingPipelineSolver7_MultiGraph",
    simplifier: "AutoroutingPipelineSolver11_Simplification",
    simplificationOptions: {
      iterations: 2,
      enableCrossingViaReduction: true,
    },
  },
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${manifestPath} for ${recordCount} records`);
