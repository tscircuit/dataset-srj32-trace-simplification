#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { AutoroutingPipelineSolver11_Simplification } from "@tscircuit/capacity-autorouter";
import { datasetFileUrl, manifest, streamDataset } from "../index.js";

const hash = createHash("sha256");
for await (const chunk of createReadStream(fileURLToPath(datasetFileUrl))) {
  hash.update(chunk);
}
const digest = hash.digest("hex");
if (digest !== manifest.dataFileSha256) {
  throw new Error(`Dataset SHA-256 mismatch: ${digest}`);
}

const problemIds = new Set<string>();
let recordCount = 0;
let inputTraceCount = 0;
let outputTraceCount = 0;
let inputRoutePointCount = 0;
let outputRoutePointCount = 0;

for await (const record of streamDataset()) {
  if (problemIds.has(record.problemId)) {
    throw new Error(`Duplicate problemId: ${record.problemId}`);
  }
  problemIds.add(record.problemId);
  const inputTraces = record.input.traces ?? [];
  const outputTraces = record.output.traces ?? [];
  if (inputTraces.length !== outputTraces.length) {
    throw new Error(`${record.problemId} changed the trace count`);
  }

  const solver = new AutoroutingPipelineSolver11_Simplification(
    structuredClone(record.input) as never,
    record.source.simplificationOptions,
  );
  solver.solve();
  if (solver.failed) {
    throw new Error(`${record.problemId} failed replay: ${solver.error}`);
  }

  recordCount++;
  inputTraceCount += inputTraces.length;
  outputTraceCount += outputTraces.length;
  inputRoutePointCount += inputTraces.reduce(
    (sum, trace) => sum + trace.route.length,
    0,
  );
  outputRoutePointCount += outputTraces.reduce(
    (sum, trace) => sum + trace.route.length,
    0,
  );
}

const actual = {
  recordCount,
  inputTraceCount,
  outputTraceCount,
  inputRoutePointCount,
  outputRoutePointCount,
};
for (const [key, value] of Object.entries(actual)) {
  if (manifest[key] !== value) {
    throw new Error(`${key} mismatch: expected ${manifest[key]}, got ${value}`);
  }
}

console.log(`Validated ${recordCount} records (${digest})`);
