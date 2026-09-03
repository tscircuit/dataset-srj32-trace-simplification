export interface SimpleRouteJson {
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  obstacles: unknown[];
  connections: unknown[];
  traces?: Array<{ route: unknown[]; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface TraceSimplificationDatasetRecord {
  schemaVersion: 1;
  problemId: string;
  source: {
    dataset: "dataset01";
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
}

export interface DatasetManifest {
  schemaVersion: 1;
  recordCount: number;
  inputTraceCount: number;
  outputTraceCount: number;
  inputRoutePointCount: number;
  outputRoutePointCount: number;
  dataFile: string;
  dataFileSha256: string;
  [key: string]: unknown;
}

export declare const datasetFileUrl: URL;
export declare const manifest: Readonly<DatasetManifest>;
export declare function streamDataset(options?: {
  signal?: AbortSignal;
}): AsyncGenerator<TraceSimplificationDatasetRecord>;
export declare function loadDataset(options?: {
  signal?: AbortSignal;
}): Promise<TraceSimplificationDatasetRecord[]>;
