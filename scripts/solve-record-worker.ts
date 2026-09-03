import type { DatasetScenario } from "./dataset-sources";
import { createRecord } from "./generate-dataset";

interface SolveRecordRequest {
  scenario: DatasetScenario;
  effort: number;
  autorouterGitRevision: string;
  datasetPackageSpecifier: string;
}

self.onmessage = (event: MessageEvent<SolveRecordRequest>): void => {
  try {
    const record = createRecord(
      event.data.scenario,
      event.data.effort,
      event.data.autorouterGitRevision,
      event.data.datasetPackageSpecifier,
    );
    self.postMessage({ ok: true, record });
  } catch (error) {
    self.postMessage({
      ok: false,
      error:
        error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
  }
};
