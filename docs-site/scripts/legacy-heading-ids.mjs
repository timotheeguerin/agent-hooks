// Copyright (c) Microsoft. All rights reserved.

import GithubSlugger from "github-slugger";

function textContent(node) {
  if (node.type === "text") return node.value;
  if (node.type === "raw") return node.value.replace(/<[^>]*>/g, "");
  return (node.children ?? []).map(textContent).join("");
}

function slugify(text) {
  return text
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

// Keep links to headings published by the former MkDocs site working.
export function legacyHeadingIds() {
  return (tree, file) => {
    const used = new Set();
    const githubSlugs = new GithubSlugger();
    const uniqueSlug = (text) => {
      let id = slugify(text);
      while (used.has(id)) {
        const suffix = /^(.*)_(\d+)$/.exec(id);
        id = suffix ? `${suffix[1]}_${Number(suffix[2]) + 1}` : `${id}_1`;
      }
      used.add(id);
      return id;
    };

    const title = file.data.astro?.frontmatter?.title;
    if (typeof title === "string") {
      tree.children.unshift({
        type: "element",
        tagName: "a",
        properties: { id: uniqueSlug(title), ariaHidden: "true" },
        children: [],
      });
    }

    function visit(node) {
      if (node.type === "element" && /^h[1-6]$/.test(node.tagName)) {
        const text = textContent(node);
        const id = uniqueSlug(text);
        const githubId = githubSlugs.slug(text);
        node.properties ??= {};
        node.properties.id ??= id;
        if (githubId !== node.properties.id) {
          node.children.unshift({
            type: "element",
            tagName: "a",
            properties: { id: githubId, ariaHidden: "true" },
            children: [],
          });
        }
      }
      for (const child of node.children ?? []) visit(child);
    }
    visit(tree);
  };
}
