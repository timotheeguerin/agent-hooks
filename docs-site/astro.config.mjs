// Copyright (c) Microsoft. All rights reserved.

import { unified } from "@astrojs/markdown-remark";
import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";
import relativeMarkdownLinks from "astro-rehype-relative-markdown-links";
import { defineConfig } from "astro/config";
import { readFileSync, readdirSync } from "node:fs";
import { legacyHeadingIds } from "./scripts/legacy-heading-ids.mjs";

const base = "/agent-hooks";
const specFiles = new Set(readdirSync(new URL("./docs/spec/", import.meta.url)));
const versions = [...specFiles]
  .filter((name) => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.md$/.test(name))
  .map((name) => name.slice(0, -3))
  .sort((a, b) => {
    const [aMajor, aMinor] = a.split(".").map(Number);
    const [bMajor, bMinor] = b.split(".").map(Number);
    return bMajor - aMajor || bMinor - aMinor;
  });
const references = [];
for (const version of [...versions, "draft"]) {
  for (const [suffix, label] of [
    ["reference", "reference"],
    ["reference-tables", "reference (tables)"],
  ]) {
    if (specFiles.has(`${version}-${suffix}.md`)) {
      references.push({
        label: `${version === "draft" ? "Draft" : version} ${label}`,
        slug: `spec/${version}-${suffix}`,
      });
    }
  }
}

// Pinned TypeSpec TextMate grammar; see THIRD-PARTY-NOTICES.md.
const typeSpecGrammar = JSON.parse(
  readFileSync(new URL("./vendor/typespec.tmLanguage.json", import.meta.url), "utf8"),
);

export default defineConfig({
  site: process.env.DOCS_SITE_URL ?? "https://responsibleai.github.io",
  base,
  trailingSlash: "always",
  integrations: [
    mermaid({ enableLog: false }),
    starlight({
      title: "Agent Hooks",
      customCss: ["./src/custom.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/responsibleai/agent-hooks",
        },
      ],
      expressiveCode: {
        shiki: {
          langs: [{ ...typeSpecGrammar, id: "typespec", aliases: ["tsp"] }],
        },
      },
      sidebar: [
        { label: "Home", link: "/" },
        {
          label: "Concepts",
          items: [
            { label: "Interception points", slug: "concepts/interception-points" },
            { label: "Verdicts", slug: "concepts/verdicts" },
            { label: "Composition profiles", slug: "concepts/composition" },
            { label: "Approval seam", slug: "concepts/approval" },
            { label: "Identity providers", slug: "concepts/identity" },
            { label: "Interception records", slug: "concepts/records" },
          ],
        },
        {
          label: "Quickstarts",
          items: [
            { label: "Python", slug: "quickstart/python" },
            { label: "TypeScript", slug: "quickstart/typescript" },
            { label: "Rust", slug: "quickstart/rust" },
            { label: ".NET", slug: "quickstart/dotnet" },
            { label: "Go", slug: "quickstart/go" },
          ],
        },
        {
          label: "Examples",
          items: [
            { label: "Policy deny", slug: "examples/policy-deny" },
            { label: "Human approval", slug: "examples/approval-flow" },
            { label: "Redaction transform", slug: "examples/redaction" },
          ],
        },
        { label: "Conformance", slug: "conformance" },
        {
          label: "Specification",
          items: [
            ...versions.map((version) => ({
              label: version,
              slug: `spec/${version}`,
            })),
            { label: "Draft", slug: "spec/draft" },
            ...references,
          ],
        },
        { label: "FAQ", slug: "faq" },
      ],
    }),
  ],
  markdown: {
    processor: unified({
      rehypePlugins: [
        [relativeMarkdownLinks, { base, collectionBase: false, trailingSlash: "always" }],
        legacyHeadingIds,
      ],
    }),
  },
});
