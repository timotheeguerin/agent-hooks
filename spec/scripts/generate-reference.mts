// Copyright (c) Microsoft. All rights reserved.

import { compile, formatDiagnostic, NodeHost } from "@typespec/compiler";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const target = join(directory, "../draft/REFERENCE.md");
const output = new Map<string, string>();
const program = await compile(
  {
    ...NodeHost,
    mkdirp: async () => {},
    writeFile: async (path, content) => {
      output.set(path, content);
    },
  },
  join(directory, "schema-emitter.tsp"),
  {
    additionalImports: [join(directory, "../draft/schema/src/main.tsp")],
    emit: ["@agent-hooks/reference-docs"],
    outputDir: join(directory, "tsp-output"),
  },
);
if (program.diagnostics.length > 0) {
  throw new Error(
    program.diagnostics
      .map((diagnostic) => formatDiagnostic(diagnostic))
      .join("\n"),
  );
}
if (output.size !== 1)
  throw new Error(`expected one reference page, got ${output.size}`);
const content = [...output.values()][0];
if (process.argv.includes("--check")) {
  const committed = await readFile(target, "utf8");
  if (committed !== content)
    throw new Error(
      "Reference docs are out of date. Run npm run generate:reference.",
    );
  console.log("Reference docs are up to date.");
} else {
  await writeFile(target, content);
  console.log("Wrote spec/draft/REFERENCE.md");
}
