import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export const datasetFileUrl = new URL("./data/dataset.jsonl", import.meta.url);
export const manifest = JSON.parse(
  readFileSync(new URL("./manifest.json", import.meta.url), "utf8"),
);

export async function* streamDataset(options = {}) {
  const input = createReadStream(fileURLToPath(datasetFileUrl));
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });

  try {
    for await (const line of lines) {
      options.signal?.throwIfAborted();
      if (line.trim()) yield JSON.parse(line);
    }
  } finally {
    lines.close();
    input.destroy();
  }
}

export async function loadDataset(options = {}) {
  const records = [];
  for await (const record of streamDataset(options)) records.push(record);
  return records;
}
