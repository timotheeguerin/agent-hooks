// Copyright (c) Microsoft. All rights reserved.

import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const site = fileURLToPath(new URL("../", import.meta.url));
const source = join(site, "docs");
const content = join(site, "src/content/docs");
const schemas = join(site, "public/schema");

await rm(content, { recursive: true, force: true });
await rm(schemas, { recursive: true, force: true });
await mkdir(content, { recursive: true });
await mkdir(dirname(schemas), { recursive: true });
await cp(join(source, "schema"), schemas, { recursive: true });

async function stagePages(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (path === join(source, "schema")) continue;
    if (entry.isSymbolicLink()) {
      throw new Error(`Documentation source is a symbolic link: ${path}`);
    }
    if (entry.isDirectory()) {
      await stagePages(path);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      const page = relative(source, path).split(sep).join("/");
      let text = await readFile(path, "utf8");
      const heading = /^# ([^\r\n]+)\r?$/m.exec(text);
      if (!heading) throw new Error(`Documentation page has no title: ${path}`);
      const title = heading[1];
      const slug = page.startsWith("spec/")
        ? `slug: ${JSON.stringify(page.slice(0, -3))}\n`
        : "";
      text = (text.slice(0, heading.index) + text.slice(heading.index + heading[0].length))
        .trimStart();
      if (page === "spec/draft.md") {
        text = text.replace(
          "](../schema/draft/path-grammar.abnf)",
          "](../../schema/draft/path-grammar.abnf)",
        );
      }
      const target = join(content, page);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, `---\ntitle: ${JSON.stringify(title)}\n${slug}---\n\n${text}`);
    }
  }
}

await stagePages(source);
