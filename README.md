# dataset-srj32-trace-simplification

Streaming JSON-in/JSON-out examples for tscircuit's Pipeline 11 trace
simplification solver.

The source boards come from 15 pinned Simple Route JSON dataset families.
Pipeline 7 routes each board up to its stitched, unsimplified trace state. That
complete `SimpleRouteJson` becomes the example input. The corresponding output
is the complete `SimpleRouteJson` returned by
`AutoroutingPipelineSolver11_Simplification`.

The generator supports Dataset 01 plus SRJ05, SRJ11, SRJ12, SRJ13, SRJ16,
SRJ18, SRJ19, SRJ20, SRJ21, SRJ23, SRJ24, SRJ27, SRJ28, and SRJ29. The source
dataset is part of every `problemId`, so similarly named samples cannot collide.

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
bun run manifest
```

Generate one family with `bun run generate --dataset srj18`, or pass a
comma-separated selection. The default is `--dataset all`. Every board runs in
an isolated worker with a 60-second default timeout; use
`--problem-timeout <seconds>` to change it.

Generation is append-only. Each completed record is fsynced before an atomic
checkpoint update. Restarting the command scans the JSONL by `problemId`, skips
completed work, and truncates only an incomplete final line. Per-dataset
provenance checks prevent records produced by different pinned solver or source
revisions from being mixed. Failures are logged beside the dataset and retried
on the next run.

The committed corpus was generated on Linux with the revisions recorded in
`manifest.json` and in every record.

## Validation

```sh
bun run check
```

This checks formatting and types, verifies the committed SHA-256 and manifest
statistics, confirms every ID is unique, and runs Pipeline 11 successfully
against every stored input.
