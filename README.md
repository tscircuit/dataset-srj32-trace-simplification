# dataset-srj32-trace-simplification

Streaming JSON-in/JSON-out examples for tscircuit's Pipeline 11 trace
simplification solver.

The 85 source boards come from Dataset 01. Pipeline 7 routes each board up to
its stitched, unsimplified trace state. That complete `SimpleRouteJson` becomes
the example input. The corresponding output is the complete
`SimpleRouteJson` returned by `AutoroutingPipelineSolver11_Simplification`.

## Usage

Install directly from GitHub:

```sh
bun add github:tscircuit/dataset-srj32-trace-simplification
```

Stream records without loading the 21 MB corpus into memory:

```js
import { streamDataset } from "@tscircuit/dataset-srj32-trace-simplification"

for await (const { problemId, input, output } of streamDataset()) {
  console.log(problemId, input.traces.length, output.traces.length)
}
```

Every line of `data/dataset.jsonl` is an independently parseable record with
`input` and `output` fields. Both fields are complete Simple Route JSON objects.

## Generation and recovery

```sh
bun install
bun run generate
```

Generation is append-only. Each completed record is fsynced before an atomic
checkpoint update. Restarting the command scans the JSONL by `problemId`, skips
completed work, and truncates only an incomplete final line. Provenance checks
prevent records produced by different pinned solver or source revisions from
being mixed. Failures are logged beside the dataset and retried on the next run.

The committed corpus was generated on Linux with the revisions recorded in
`manifest.json` and in every record.

## Validation

```sh
bun run check
```

This checks formatting and types, verifies the committed SHA-256 and manifest
statistics, confirms all 85 IDs are unique, and runs Pipeline 11 successfully
against every stored input.
