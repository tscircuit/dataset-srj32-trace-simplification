#!/usr/bin/env bun

import {
  appendFile,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import {
  AutoroutingPipelineSolver11_Simplification,
  AutoroutingPipelineSolver7_MultiGraph,
  type SimpleRouteJson,
} from "@tscircuit/capacity-autorouter";
import {
  DATASET_SOURCES,
  loadDatasetScenarios,
  type DatasetScenario,
} from "./dataset-sources";

const SCHEMA_VERSION = 1;
const SIMPLIFICATION_PHASE = "traceSimplificationSolver";
const DEFAULT_OUTPUT = "data/dataset.jsonl";
const AUTOROUTER_GIT_REVISION = "3dbbad3a8a420a6469b5537034c672517264d608";

export type DatasetRecord = {
  schemaVersion: typeof SCHEMA_VERSION;
  problemId: string;
  source: {
    dataset: string;
    scenarioName: string;
    sampleNumber: number;
    autorouterGitRevision: string;
    datasetPackageSpecifier: string;
    effort: number;
    router: "AutoroutingPipelineSolver7_MultiGraph";
    simplifier: "AutoroutingPipelineSolver11_Simplification";
    simplificationOptions: {
      iterations: number;
      enableCrossingViaReduction: boolean;
    };
  };
  input: SimpleRouteJson;
  output: SimpleRouteJson;
};

type GeneratorOptions = {
  outputPath: string;
  start: number;
  limit?: number;
  effort: number;
  datasets: string[];
  problemTimeoutMs: number;
  concurrency: number;
};

type ExpectedProvenance = {
  autorouterGitRevision: string;
  datasetPackageSpecifiers: Record<string, string>;
  effort: number;
};

type Checkpoint = {
  schemaVersion: typeof SCHEMA_VERSION;
  datasets: string[];
  status: "running" | "complete" | "complete_with_errors" | "interrupted";
  totalProblems: number;
  selectedProblems: number;
  completedProblemIds: string[];
  failedProblemIds: string[];
  lastCompletedProblemId?: string;
  lastAttemptedProblemId?: string;
  updatedAt: string;
};

const parsePositiveInteger = (raw: string, flag: string): number => {
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return value;
};

const parsePositiveNumber = (raw: string, flag: string): number => {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flag} must be a positive number`);
  }
  return value;
};

const parseArgs = (args: string[]): GeneratorOptions => {
  const options: GeneratorOptions = {
    outputPath: path.resolve(DEFAULT_OUTPUT),
    start: 1,
    effort: 1,
    datasets: ["all"],
    problemTimeoutMs: 60_000,
    concurrency: 4,
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--output") {
      options.outputPath = path.resolve(
        args[++index] ??
          (() => {
            throw new Error("--output requires a path");
          })(),
      );
    } else if (arg === "--start") {
      options.start = parsePositiveInteger(
        args[++index] ??
          (() => {
            throw new Error("--start requires a value");
          })(),
        "--start",
      );
    } else if (arg === "--limit") {
      options.limit = parsePositiveInteger(
        args[++index] ??
          (() => {
            throw new Error("--limit requires a value");
          })(),
        "--limit",
      );
    } else if (arg === "--effort") {
      options.effort = parsePositiveNumber(
        args[++index] ??
          (() => {
            throw new Error("--effort requires a value");
          })(),
        "--effort",
      );
    } else if (arg === "--dataset") {
      const value = args[++index];
      if (!value) throw new Error("--dataset requires a value");
      options.datasets = value.split(",").map((name) => name.trim());
    } else if (arg === "--problem-timeout") {
      options.problemTimeoutMs =
        parsePositiveNumber(
          args[++index] ??
            (() => {
              throw new Error("--problem-timeout requires a value");
            })(),
          "--problem-timeout",
        ) * 1_000;
    } else if (arg === "--concurrency") {
      options.concurrency = parsePositiveInteger(
        args[++index] ??
          (() => {
            throw new Error("--concurrency requires a value");
          })(),
        "--concurrency",
      );
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Generate multi-source TraceSimplificationSolver JSON-in/JSON-out pairs.",
          "",
          `Usage: bun ${path.basename(import.meta.path)} [options]`,
          "",
          `  --output PATH  JSONL destination (default: ${DEFAULT_OUTPUT})`,
          "  --start N      First 1-based selected sample (default: 1)",
          "  --limit N      Process at most N samples",
          "  --effort N     Pipeline effort (default: 1)",
          "  --dataset LIST Comma-separated names or all (default: all)",
          `                 Available: ${DATASET_SOURCES.map(({ name }) => name).join(", ")}`,
          "  --problem-timeout N  Maximum seconds per problem (default: 60)",
          "  --concurrency N      Parallel problem workers (default: 4)",
          "",
          "Existing valid records are always resumed by problemId. A partial final",
          "line is truncated automatically. Upstream failures are logged separately",
          "and retried on the next invocation.",
        ].join("\n"),
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
};

const truncateIncompleteFinalLine = async (
  outputPath: string,
): Promise<number> => {
  let fileSize = 0;
  try {
    fileSize = (await stat(outputPath)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
  if (fileSize === 0) return 0;

  const file = await open(outputPath, "r+");
  try {
    const lastByte = new Uint8Array(1);
    await file.read(lastByte, 0, 1, fileSize - 1);
    if (lastByte[0] === 0x0a) return 0;

    const chunkSize = 64 * 1024;
    let cursor = fileSize;
    while (cursor > 0) {
      const start = Math.max(0, cursor - chunkSize);
      const chunk = new Uint8Array(cursor - start);
      await file.read(chunk, 0, chunk.length, start);
      const newlineIndex = chunk.lastIndexOf(0x0a);
      if (newlineIndex >= 0) {
        const validSize = start + newlineIndex + 1;
        await file.truncate(validSize);
        return fileSize - validSize;
      }
      cursor = start;
    }

    await file.truncate(0);
    return fileSize;
  } finally {
    await file.close();
  }
};

export const recoverCompletedProblemIds = async (
  outputPath: string,
  expectedProvenance?: ExpectedProvenance,
): Promise<Set<string>> => {
  const truncatedBytes = await truncateIncompleteFinalLine(outputPath);
  if (truncatedBytes > 0) {
    console.log(
      `Recovered ${outputPath} by truncating ${truncatedBytes} bytes`,
    );
  }

  const completed = new Set<string>();
  try {
    await stat(outputPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return completed;
    throw error;
  }

  const lines = createInterface({
    input: createReadStream(outputPath),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber++;
    if (!line.trim()) continue;
    let record: Partial<DatasetRecord>;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSON at ${outputPath}:${lineNumber}: ${error}`);
    }
    if (
      record.schemaVersion !== SCHEMA_VERSION ||
      typeof record.problemId !== "string" ||
      !record.input ||
      !record.output
    ) {
      throw new Error(`Invalid dataset record at ${outputPath}:${lineNumber}`);
    }
    if (
      expectedProvenance &&
      (record.source?.autorouterGitRevision !==
        expectedProvenance.autorouterGitRevision ||
        record.source?.datasetPackageSpecifier !==
          expectedProvenance.datasetPackageSpecifiers[
            record.source?.dataset ?? ""
          ] ||
        record.source?.effort !== expectedProvenance.effort ||
        record.source?.router !== "AutoroutingPipelineSolver7_MultiGraph" ||
        record.source?.simplifier !==
          "AutoroutingPipelineSolver11_Simplification" ||
        record.source?.simplificationOptions?.iterations !== 2 ||
        record.source?.simplificationOptions?.enableCrossingViaReduction !==
          true)
    ) {
      throw new Error(
        `Incompatible provenance at ${outputPath}:${lineNumber}; use a new output path`,
      );
    }
    if (completed.has(record.problemId)) {
      throw new Error(
        `Duplicate problemId ${record.problemId} at line ${lineNumber}`,
      );
    }
    completed.add(record.problemId);
  }
  return completed;
};

const writeCheckpoint = async (
  checkpointPath: string,
  checkpoint: Checkpoint,
): Promise<void> => {
  const temporaryPath = `${checkpointPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
  await rename(temporaryPath, checkpointPath);
};

const appendJsonLine = async (
  outputPath: string,
  value: unknown,
): Promise<void> => {
  const file = await open(outputPath, "a");
  try {
    await file.write(`${JSON.stringify(value)}\n`);
    await file.sync();
  } finally {
    await file.close();
  }
};

const runUntilPhase = (
  pipeline: AutoroutingPipelineSolver7_MultiGraph,
  phase: string,
): void => {
  while (
    !pipeline.failed &&
    !pipeline.solved &&
    pipeline.getCurrentPhase() !== phase
  ) {
    pipeline.step();
  }
  if (pipeline.failed) {
    throw new Error(pipeline.error ?? `Pipeline failed before ${phase}`);
  }
  if (pipeline.solved || pipeline.getCurrentPhase() !== phase) {
    throw new Error(`Pipeline ended before reaching ${phase}`);
  }
};

export const createRecord = (
  scenario: DatasetScenario,
  effort: number,
  autorouterGitRevision: string,
  datasetPackageSpecifier: string,
): DatasetRecord => {
  const pipeline = new AutoroutingPipelineSolver7_MultiGraph(
    structuredClone(scenario.srj),
    { cacheProvider: null, effort },
  );
  runUntilPhase(pipeline, SIMPLIFICATION_PHASE);

  const simplificationOptions = {
    iterations: 2,
    enableCrossingViaReduction: true,
  };
  const input: SimpleRouteJson = {
    ...structuredClone(pipeline.originalSrj),
    traces: pipeline.getPrePowerTraceOutputSimplifiedPcbTraces(),
  };
  const simplifier = new AutoroutingPipelineSolver11_Simplification(
    structuredClone(input),
    simplificationOptions,
  );
  simplifier.solve();
  if (simplifier.failed) {
    throw new Error(simplifier.error ?? "Pipeline 11 simplification failed");
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    problemId: `${scenario.dataset}:${scenario.scenarioName}`,
    source: {
      dataset: scenario.dataset,
      scenarioName: scenario.scenarioName,
      sampleNumber: scenario.sampleNumber,
      autorouterGitRevision,
      datasetPackageSpecifier,
      effort,
      router: "AutoroutingPipelineSolver7_MultiGraph",
      simplifier: "AutoroutingPipelineSolver11_Simplification",
      simplificationOptions,
    },
    input,
    output: simplifier.getOutputSimpleRouteJson(),
  };
};

const createRecordWithTimeout = (
  scenario: DatasetScenario,
  effort: number,
  autorouterGitRevision: string,
  datasetPackageSpecifier: string,
  timeoutMs: number,
): Promise<DatasetRecord> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./solve-record-worker.ts", import.meta.url).href,
      { type: "module" },
    );
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error(`Problem timed out after ${timeoutMs / 1_000}s`));
    }, timeoutMs);
    worker.onmessage = (event: MessageEvent) => {
      clearTimeout(timeout);
      worker.terminate();
      if (event.data.ok) resolve(event.data.record as DatasetRecord);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event: ErrorEvent) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(event.error ?? new Error(event.message));
    };
    worker.postMessage({
      scenario,
      effort,
      autorouterGitRevision,
      datasetPackageSpecifier,
    });
  });

const getSourceVersions = async (): Promise<{
  autorouterGitRevision: string;
  datasetPackageSpecifiers: Record<string, string>;
}> => {
  const packageJson = JSON.parse(
    await readFile(path.resolve("package.json"), "utf8"),
  ) as { devDependencies: Record<string, string> };
  if (
    packageJson.devDependencies["@tscircuit/capacity-autorouter"] !== "0.0.869"
  ) {
    throw new Error("Update the pinned autorouter revision before generating");
  }
  return {
    autorouterGitRevision: AUTOROUTER_GIT_REVISION,
    datasetPackageSpecifiers: Object.fromEntries(
      DATASET_SOURCES.map(({ name, packageName }) => {
        const specifier = packageJson.devDependencies[packageName];
        if (!specifier) {
          throw new Error(`Missing pinned dependency: ${packageName}`);
        }
        return [name, specifier];
      }),
    ),
  };
};

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));
  const checkpointPath = `${options.outputPath}.checkpoint.json`;
  const errorPath = `${options.outputPath}.errors.jsonl`;
  await mkdir(path.dirname(options.outputPath), { recursive: true });

  const versions = await getSourceVersions();
  const completed = await recoverCompletedProblemIds(options.outputPath, {
    ...versions,
    effort: options.effort,
  });
  const scenarios = await loadDatasetScenarios(options.datasets);
  const selected = scenarios.slice(
    options.start - 1,
    options.limit === undefined ? undefined : options.start - 1 + options.limit,
  );
  const failed = new Set<string>();
  let lastCompletedProblemId = [...completed].at(-1);
  let lastAttemptedProblemId: string | undefined;
  let interrupted = false;
  process.on("SIGINT", () => {
    interrupted = true;
  });
  process.on("SIGTERM", () => {
    interrupted = true;
  });

  const checkpoint = async (status: Checkpoint["status"]): Promise<void> =>
    writeCheckpoint(checkpointPath, {
      schemaVersion: SCHEMA_VERSION,
      datasets: [...new Set(selected.map(({ dataset }) => dataset))],
      status,
      totalProblems: scenarios.length,
      selectedProblems: selected.length,
      completedProblemIds: [...completed].sort(),
      failedProblemIds: [...failed].sort(),
      lastCompletedProblemId,
      lastAttemptedProblemId,
      updatedAt: new Date().toISOString(),
    });

  await checkpoint("running");
  console.log(
    `${options.datasets.join(",")}: ${completed.size} existing, ${selected.length} selected, ${scenarios.length} total`,
  );

  for (
    let batchStart = 0;
    batchStart < selected.length && !interrupted;
    batchStart += options.concurrency
  ) {
    const batch = selected.slice(batchStart, batchStart + options.concurrency);
    const results = await Promise.all(
      batch.map(async (scenario, batchIndex) => {
        const globalNumber = options.start + batchStart + batchIndex;
        const problemId = `${scenario.dataset}:${scenario.scenarioName}`;
        if (completed.has(problemId)) {
          console.log(
            `[${globalNumber}/${scenarios.length}] skip ${problemId}`,
          );
          return { scenario, globalNumber, problemId, skipped: true } as const;
        }
        lastAttemptedProblemId = problemId;
        console.log(`[${globalNumber}/${scenarios.length}] solve ${problemId}`);
        try {
          const record = await createRecordWithTimeout(
            scenario,
            options.effort,
            versions.autorouterGitRevision,
            versions.datasetPackageSpecifiers[scenario.dataset],
            options.problemTimeoutMs,
          );
          return { scenario, globalNumber, problemId, record } as const;
        } catch (error) {
          return { scenario, globalNumber, problemId, error } as const;
        }
      }),
    );

    for (const result of results) {
      if ("skipped" in result) continue;
      if ("record" in result && result.record) {
        const record = result.record;
        await appendJsonLine(options.outputPath, record);
        completed.add(result.problemId);
        lastCompletedProblemId = result.problemId;
        console.log(
          `[${result.globalNumber}/${scenarios.length}] wrote ${result.problemId} (${record.input.traces?.length ?? 0} traces)`,
        );
        continue;
      }
      failed.add(result.problemId);
      await appendFile(
        errorPath,
        `${JSON.stringify({
          problemId: result.problemId,
          dataset: result.scenario.dataset,
          sampleNumber: result.scenario.sampleNumber,
          error:
            result.error instanceof Error
              ? (result.error.stack ?? result.error.message)
              : String(result.error),
          occurredAt: new Date().toISOString(),
        })}\n`,
      );
      console.error(
        `[${result.globalNumber}/${scenarios.length}] failed ${result.problemId}: ${result.error}`,
      );
    }
    await checkpoint("running");
  }

  const status: Checkpoint["status"] = interrupted
    ? "interrupted"
    : failed.size > 0
      ? "complete_with_errors"
      : "complete";
  await checkpoint(status);
  console.log(
    `${status}: ${completed.size} records in ${options.outputPath}; ${failed.size} failures`,
  );
  if (interrupted || failed.size > 0) process.exitCode = 1;
};

if (import.meta.main) {
  await main();
}
