// Copyright (c) Microsoft. All rights reserved.

import { For, Output } from "@alloy-js/core";
import * as md from "@alloy-js/markdown";
import {
  getDoc,
  getEntityName,
  getExamples,
  getFormat,
  getMaxItemsAsNumeric,
  getMaxLengthAsNumeric,
  getMaxValueAsNumeric,
  getMinItemsAsNumeric,
  getMinLengthAsNumeric,
  getMinValueAsNumeric,
  getNamespaceFullName,
  getPattern,
  getSourceLocation,
  getTypeName,
  isArrayModelType,
  isTemplateInstance,
  isTemplateDeclaration,
  isType,
  serializeValueAsJson,
  walkPropertiesInherited,
  type Program,
  type Model,
  type Type,
} from "@typespec/compiler";
import { getExtensions, getUniqueItems, isOneOf } from "@typespec/json-schema";
import type { Declaration } from "./index.js";

interface ReferenceProps {
  program: Program;
  categories: { title: string; declarations: Declaration[] }[];
  declarations: Set<Declaration>;
}

function anchor(type: Declaration): string {
  const namespace = type.namespace && getNamespaceFullName(type.namespace);
  return [namespace, type.name]
    .filter(Boolean)
    .join(".")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .toLowerCase();
}

function inline(value: string): string {
  const fence = "`".repeat(
    Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length)) +
      1,
  );
  const padding = /^[` ]|[` ]$/.test(value) ? " " : "";
  return `${fence}${padding}${value}${padding}${fence}`;
}

function cell(value: string): string {
  // MkDocs preserves escaped pipes inside code spans; HTML code keeps their text intact.
  return value
    .replace(/(`+)([\s\S]*?)\1(?!`)/g, (span, _fence, content: string) => {
      if (!content.includes("|")) return span;
      let text = content.replace(/\r?\n/g, " ");
      if (text.startsWith(" ") && text.endsWith(" ") && text.trim()) {
        text = text.slice(1, -1);
      }
      return `<code>${text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("|", "&#124;")}</code>`;
    })
    .replaceAll("|", "&#124;")
    .replace(/\r?\n/g, "<br>");
}

function isTypeReference(value: unknown): value is Type {
  return (
    typeof value === "object" &&
    value !== null &&
    "entityKind" in value &&
    value.entityKind === "Type"
  );
}

function Table(props: { headings: string[]; rows: string[][] }) {
  return (
    <For
      each={[props.headings, props.headings.map(() => "---"), ...props.rows]}
    >
      {(row) => `| ${row.map(cell).join(" | ")} |`}
    </For>
  );
}

export function Reference(props: ReferenceProps) {
  const { program, declarations } = props;

  function doc(type: Type): string {
    const content = type.node?.docs
      ?.flatMap((doc) => doc.content.map((part) => part.text))
      .join("\n");
    return getDoc(program, type) ?? content ?? "";
  }

  function typeExpression(type: Type, active = new Set<Type>()): string {
    const name = getTypeName(type, { namespaceFilter: () => false });
    if (
      type.kind === "Model" ||
      type.kind === "Enum" ||
      type.kind === "Union" ||
      type.kind === "Scalar"
    ) {
      if (declarations.has(type)) return `[${inline(name)}](#${anchor(type)})`;
      if (active.has(type)) return inline(name);
      active = new Set(active).add(type);
    }
    switch (type.kind) {
      case "Model": {
        if (isArrayModelType(type)) {
          const element = type.indexer.value;
          const expression = typeExpression(element, active);
          return element.kind === "Union" && !element.name
            ? `(${expression})[]`
            : `${expression}[]`;
        }
        if (isTemplateInstance(type)) {
          const declaration = [...declarations].find(
            (item) =>
              item.kind === type.kind &&
              item.name === type.name &&
              item.namespace === type.namespace,
          );
          const label = declaration
            ? `[${inline(type.name)}](#${anchor(declaration)})`
            : inline(type.name);
          const args = type.templateMapper.args.map((arg) =>
            isType(arg)
              ? typeExpression(arg, active)
              : inline(getEntityName(arg)),
          );
          return `${label}&lt;${args.join(", ")}&gt;`;
        }
        if (type.name) return inline(name);
        const properties = [...walkPropertiesInherited(type)].map(
          (property) =>
            `${inline(property.name + (property.optional ? "?" : ""))}: ${typeExpression(property.type, active)}`,
        );
        if (type.indexer)
          properties.push(
            `[key: string]: ${typeExpression(type.indexer.value, active)}`,
          );
        return `{ ${properties.join("; ")} }`;
      }
      case "EnumMember":
        return declarations.has(type.enum)
          ? `[${inline(name)}](#${anchor(type.enum)})`
          : inline(name);
      case "Union":
        return [...type.variants.values()]
          .map((variant) => typeExpression(variant.type, active))
          .join(" | ");
      case "Tuple":
        return `[${type.values.map((value) => typeExpression(value, active)).join(", ")}]`;
      default:
        return inline(name);
    }
  }

  function constraints(type: Type): string {
    const values: string[] = [];
    const numeric = [
      ["minimum", getMinValueAsNumeric(program, type)],
      ["maximum", getMaxValueAsNumeric(program, type)],
      ["minLength", getMinLengthAsNumeric(program, type)],
      ["maxLength", getMaxLengthAsNumeric(program, type)],
      ["minItems", getMinItemsAsNumeric(program, type)],
      ["maxItems", getMaxItemsAsNumeric(program, type)],
    ] as const;
    for (const [name, value] of numeric) {
      if (value !== undefined)
        values.push(`${name}: ${inline(value.toString())}`);
    }
    const pattern = getPattern(program, type);
    if (pattern !== undefined) values.push(`pattern: ${inline(pattern)}`);
    const format = getFormat(program, type);
    if (format !== undefined) values.push(`format: ${inline(format)}`);
    if (getUniqueItems(program, type)) values.push("uniqueItems");
    if (type.kind === "Union" && isOneOf(program, type))
      values.push("exactly one variant");
    for (const extension of getExtensions(program, type)) {
      const value = isTypeReference(extension.value)
        ? getTypeName(extension.value)
        : JSON.stringify(extension.value);
      values.push(`${extension.key}: ${inline(value)}`);
    }
    return values.join("; ");
  }

  function DeclarationDoc({ type }: { type: Declaration }) {
    const examples = getExamples(program, type);
    const model = type.kind === "Model" ? type : undefined;
    const source = isTemplateDeclaration(type)
      ? getSourceLocation(type, { locateId: false })
      : undefined;
    return (
      <md.Section
        heading={inline(getTypeName(type, { namespaceFilter: () => false }))}
      >
        {`<a id="${anchor(type)}"></a>`}
        {doc(type)}
        {source && (
          <md.Code lang="typespec">
            {source.file.text.slice(source.pos, source.end).trim()}
          </md.Code>
        )}
        {constraints(type)}
        {model?.baseModel && <>Extends {typeExpression(model.baseModel)}.</>}
        {model?.indexer && (
          <>Additional entries: {typeExpression(model.indexer.value)}.</>
        )}
        {model &&
          model.properties.size === 0 &&
          !model.baseModel &&
          !model.indexer &&
          "An object with no declared properties."}
        {model && [...walkPropertiesInherited(model)].length > 0 && (
          <Table
            headings={["Property", "Type", "Description", "Constraints"]}
            rows={propertyRows(model)}
          />
        )}
        {type.kind === "Union" && (
          <md.List bullet="-">
            {[...type.variants.values()].map((variant) => (
              <>
                {typeExpression(variant.type)}
                {doc(variant) && `: ${doc(variant)}`}
              </>
            ))}
          </md.List>
        )}
        {type.kind === "Enum" && (
          <Table
            headings={["Member", "Value", "Description"]}
            rows={[...type.members.values()].map((member) => [
              inline(member.name),
              inline(JSON.stringify(member.value ?? member.name)),
              doc(member),
            ])}
          />
        )}
        {type.kind === "Scalar" && type.baseScalar && (
          <>Base type: {typeExpression(type.baseScalar)}.</>
        )}
        <For each={examples} doubleHardline>
          {(example) => (
            <md.Section heading={example.title ?? "Example"}>
              {example.description}
              <md.Code lang="json">
                {JSON.stringify(
                  serializeValueAsJson(program, example.value, type),
                  null,
                  2,
                )}
              </md.Code>
            </md.Section>
          )}
        </For>
      </md.Section>
    );
  }

  function propertyRows(
    model: Model,
    prefix = "",
    active = new Set<Model>(),
  ): string[][] {
    if (active.has(model)) return [];
    active = new Set(active).add(model);
    return [...walkPropertiesInherited(model)].flatMap((property) => {
      const path = `${prefix}${property.name}${property.optional ? "?" : ""}`;
      const row = [
        inline(path),
        typeExpression(property.type),
        doc(property),
        constraints(property),
      ];
      const nested =
        property.type.kind === "Model" && !property.type.name
          ? propertyRows(property.type, `${path}.`, active)
          : [];
      return [row, ...nested];
    });
  }

  return (
    <Output>
      <md.SourceFile path="REFERENCE.md">
        <md.Section heading="Agent Hooks schema reference">
          {
            "<!-- Generated by @agent-hooks/reference-docs. Do not edit by hand. -->"
          }
          {
            "Generated from the TypeSpec declarations. A `?` marks an optional property; `null` is a separate allowed value. The published JSON Schemas remain the normative validation artifacts; the specification defines the behavioral requirements."
          }
          <md.List bullet="-">
            {props.categories.map((category) => (
              <md.Link
                href={`#${category.title.toLowerCase().replaceAll(" ", "-")}`}
                title={category.title}
              />
            ))}
          </md.List>
          <For each={props.categories} doubleHardline>
            {(category) => (
              <md.Section heading={category.title}>
                <md.List bullet="-">
                  {category.declarations.map((type) => (
                    <md.Link
                      href={`#${anchor(type)}`}
                      title={inline(
                        getTypeName(type, { namespaceFilter: () => false }),
                      )}
                    />
                  ))}
                </md.List>
                <For each={category.declarations} doubleHardline>
                  {(type) => <DeclarationDoc type={type} />}
                </For>
              </md.Section>
            )}
          </For>
        </md.Section>
      </md.SourceFile>
    </Output>
  );
}
