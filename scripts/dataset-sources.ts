import { readFile } from "node:fs/promises";
import path from "node:path";
import * as datasetSrj01 from "@tsci/0hmX.multi-component-dataset-srj01";
import * as datasetSrj13 from "@tsci/seveibar.dataset-srj13";
import * as datasetSrj16 from "@tsci/tscircuit.dataset-srj16-bga-breakouts";
import * as datasetSrj19 from "@tsci/tscircuit.dataset-srj19-bga-passive-overlays";
import * as datasetSrj20 from "@tsci/tscircuit.dataset-srj20-partial-bga-breakouts";
import * as datasetSrj23 from "@tsci/dataset-srj23-partially-routed-subcircuits";
import * as dataset01 from "@tscircuit/autorouting-dataset-01";
import * as datasetSrj05 from "@tscircuit/dataset-srj05";
import * as datasetSrj24 from "@tscircuit/dataset-srj24";
import * as datasetSrj27 from "@tscircuit/dataset-srj27-power-traces";
import * as datasetSrj28 from "@tscircuit/dataset-srj28-partially-prerouted";
import * as datasetSrj29 from "@tsci/tscircuit.dataset-srj29-bga-decoupling";
import * as datasetSrj18 from "dataset-srj18";
import type { SimpleRouteJson } from "@tscircuit/capacity-autorouter";

export interface DatasetScenario {
  dataset: string;
  packageName: string;
  scenarioName: string;
  sampleNumber: number;
  srj: SimpleRouteJson;
}

interface DatasetSource {
  name: string;
  packageName: string;
  load: () => Promise<Array<[string, SimpleRouteJson]>>;
}

const isSimpleRouteJson = (value: unknown): value is SimpleRouteJson => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SimpleRouteJson>;
  return (
    Boolean(candidate.bounds) &&
    Array.isArray(candidate.obstacles) &&
    Array.isArray(candidate.connections)
  );
};

const sortScenarios = (
  scenarios: Array<[string, SimpleRouteJson]>,
): Array<[string, SimpleRouteJson]> =>
  scenarios.sort(([left], [right]) => left.localeCompare(right));

const fromRecord = (
  value: unknown,
  namePattern: RegExp,
): Array<[string, SimpleRouteJson]> => {
  if (!value || typeof value !== "object") return [];
  return sortScenarios(
    Object.entries(value)
      .filter(([name]) => namePattern.test(name))
      .map(([name, value]) => {
        const wrapped = value as { simpleRouteJson?: unknown };
        const srj = isSimpleRouteJson(value) ? value : wrapped.simpleRouteJson;
        return isSimpleRouteJson(srj)
          ? ([name, srj] as [string, SimpleRouteJson])
          : null;
      })
      .filter(
        (scenario): scenario is [string, SimpleRouteJson] => scenario !== null,
      ),
  );
};

const fromSamples = (value: unknown): Array<[string, SimpleRouteJson]> => {
  if (!Array.isArray(value)) return [];
  return sortScenarios(
    value
      .filter(
        (sample): sample is { sampleName: string; srj: SimpleRouteJson } =>
          Boolean(sample) &&
          typeof sample.sampleName === "string" &&
          isSimpleRouteJson(sample.srj),
      )
      .map((sample) => [sample.sampleName, sample.srj]),
  );
};

const fromJsonFiles = async (
  directory: string,
  globPattern: string,
): Promise<Array<[string, SimpleRouteJson]>> => {
  const glob = new Bun.Glob(globPattern);
  const scenarios: Array<[string, SimpleRouteJson]> = [];
  for await (const relativePath of glob.scan({ cwd: directory })) {
    const value: unknown = JSON.parse(
      await readFile(path.join(directory, relativePath), "utf8"),
    );
    if (!isSimpleRouteJson(value)) continue;
    const match = relativePath.match(/sample(\d+)/);
    const scenarioName = match ? `sample${match[1]}` : relativePath;
    scenarios.push([scenarioName, value]);
  }
  return sortScenarios(scenarios);
};

const source = (
  name: string,
  packageName: string,
  load: DatasetSource["load"],
): DatasetSource => ({ name, packageName, load });

export const DATASET_SOURCES: DatasetSource[] = [
  source("dataset01", "@tscircuit/autorouting-dataset-01", async () =>
    fromRecord(dataset01, /^circuit\d+$/),
  ),
  source("srj05", "@tscircuit/dataset-srj05", async () =>
    fromRecord(datasetSrj05, /^sample\d+.*Circuit$/),
  ),
  source("srj11", "dataset-srj11-45-degree", async () =>
    fromJsonFiles(
      path.resolve("node_modules/dataset-srj11-45-degree/circuits"),
      "**/*.simple-route.json",
    ),
  ),
  source("srj12", "@tsci/tscircuit.dataset-srj12-bus-routing", async () =>
    fromJsonFiles(
      path.resolve(
        "node_modules/@tsci/tscircuit.dataset-srj12-bus-routing/circuits",
      ),
      "**/*.simple-route.json",
    ),
  ),
  source("srj13", "@tsci/seveibar.dataset-srj13", async () =>
    fromRecord(datasetSrj13.dataset, /^example-\d+$/),
  ),
  source("srj16", "@tsci/tscircuit.dataset-srj16-bga-breakouts", async () =>
    fromSamples(datasetSrj16.samples),
  ),
  source("srj18", "dataset-srj18", async () =>
    fromRecord(datasetSrj18.dataset, /^sample\d+$/),
  ),
  source(
    "srj19",
    "@tsci/tscircuit.dataset-srj19-bga-passive-overlays",
    async () => fromSamples(datasetSrj19.samples),
  ),
  source(
    "srj20",
    "@tsci/tscircuit.dataset-srj20-partial-bga-breakouts",
    async () => fromRecord(datasetSrj20, /^sample\d+Srj$/),
  ),
  source("srj21", "@tsci/0hmX.multi-component-dataset-srj01", async () =>
    fromRecord(datasetSrj01, /^circuit\d+$/),
  ),
  source(
    "srj23",
    "@tsci/dataset-srj23-partially-routed-subcircuits",
    async () => fromRecord(datasetSrj23, /^circuit\d+$/),
  ),
  source("srj24", "@tscircuit/dataset-srj24", async () =>
    fromRecord(datasetSrj24.dataset, /^sample\d+$/),
  ),
  source("srj27", "@tscircuit/dataset-srj27-power-traces", async () =>
    fromRecord(datasetSrj27.dataset, /^sample\d+$/),
  ),
  source("srj28", "@tscircuit/dataset-srj28-partially-prerouted", async () =>
    fromRecord(datasetSrj28, /^circuit\d+$/),
  ),
  source("srj29", "@tsci/tscircuit.dataset-srj29-bga-decoupling", async () =>
    fromSamples(datasetSrj29.samples),
  ),
];

export const loadDatasetScenarios = async (
  requestedDatasets: string[],
): Promise<DatasetScenario[]> => {
  const requested = new Set(requestedDatasets);
  const selectedSources = requested.has("all")
    ? DATASET_SOURCES
    : DATASET_SOURCES.filter(({ name }) => requested.has(name));
  const unknown = [...requested].filter(
    (name) =>
      name !== "all" && !DATASET_SOURCES.some((source) => source.name === name),
  );
  if (unknown.length > 0) {
    throw new Error(`Unknown dataset(s): ${unknown.join(", ")}`);
  }

  const scenarios: DatasetScenario[] = [];
  for (const datasetSource of selectedSources) {
    const loaded = await datasetSource.load();
    if (loaded.length === 0) {
      throw new Error(`No scenarios found for ${datasetSource.name}`);
    }
    loaded.forEach(([scenarioName, srj], index) => {
      scenarios.push({
        dataset: datasetSource.name,
        packageName: datasetSource.packageName,
        scenarioName,
        sampleNumber: index + 1,
        srj,
      });
    });
  }
  return scenarios;
};
