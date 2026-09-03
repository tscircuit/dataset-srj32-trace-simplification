import { expect, test } from "bun:test";
import { loadDatasetScenarios } from "../scripts/dataset-sources";

test("loads every configured dataset with globally unique problem IDs", async () => {
  const scenarios = await loadDatasetScenarios(["all"]);
  const ids = scenarios.map(
    ({ dataset, scenarioName }) => `${dataset}:${scenarioName}`,
  );

  expect(scenarios.length).toBe(1261);
  expect(new Set(ids).size).toBe(ids.length);
  expect(scenarios.filter(({ dataset }) => dataset === "srj18").length).toBe(
    16,
  );
});
