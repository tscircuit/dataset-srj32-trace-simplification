import { expect, test } from "bun:test";
import { manifest, streamDataset } from "../index.js";

test("streams every unique JSON-in/JSON-out record", async () => {
  const ids = new Set<string>();
  let recordCount = 0;
  let inputRoutePointCount = 0;
  let outputRoutePointCount = 0;

  for await (const record of streamDataset()) {
    expect(ids.has(record.problemId)).toBe(false);
    ids.add(record.problemId);
    expect(record.input.traces?.length).toBe(record.output.traces?.length);
    inputRoutePointCount += record.input.traces!.reduce(
      (sum, trace) => sum + trace.route.length,
      0,
    );
    outputRoutePointCount += record.output.traces!.reduce(
      (sum, trace) => sum + trace.route.length,
      0,
    );
    recordCount++;
  }

  expect(recordCount).toBe(manifest.recordCount);
  expect(inputRoutePointCount).toBe(manifest.inputRoutePointCount);
  expect(outputRoutePointCount).toBe(manifest.outputRoutePointCount);
});
