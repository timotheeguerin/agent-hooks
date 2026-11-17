// Copyright (c) Microsoft. All rights reserved.

import { render, traverseOutput } from "@alloy-js/core";
import {
  createTypeSpecLibrary,
  emitFile,
  getTypeName,
  isTemplateInstance,
  isType,
  navigateProgram,
  resolvePath,
  type DecoratorContext,
  type EmitContext,
  type Enum,
  type EnumMember,
  type Model,
  type Scalar,
  type Union,
} from "@typespec/compiler";
import { Reference } from "./reference.js";

export type Declaration = Model | Enum | Union | Scalar;

export const $lib = createTypeSpecLibrary({
  name: "@agent-hooks/reference-docs",
  diagnostics: {
    "no-categories": {
      severity: "error",
      messages: {
        default:
          "No categorized declarations found. Add @category(Categories.<member>).",
      },
    },
  },
  state: {
    category: { description: "The reference category of a declaration." },
  },
});

function $category(
  context: DecoratorContext,
  target: Declaration,
  value: EnumMember,
): void {
  context.program.stateMap($lib.stateKeys.category).set(target, value);
}

export const $decorators = {
  "AgentHooks.Docs": { category: $category },
};

export async function $onEmit(context: EmitContext): Promise<void> {
  const { program } = context;
  const declarations = new Map<Declaration, EnumMember>();
  function collect(type: Declaration): void {
    if (!type.name || isTemplateInstance(type)) return;
    const application = type.decorators.find(
      (application) => application.decorator === $category,
    );
    const argument = application?.args[0]?.value;
    // Template declarations retain their decorators without executing them.
    const category: EnumMember | undefined =
      program.stateMap($lib.stateKeys.category).get(type) ??
      (argument && isType(argument) && argument.kind === "EnumMember"
        ? argument
        : undefined);
    if (category) declarations.set(type, category);
  }
  navigateProgram(
    program,
    { model: collect, enum: collect, union: collect, scalar: collect },
    { includeTemplateDeclaration: true },
  );
  const firstCategory = declarations.values().next().value;
  if (!firstCategory) {
    $lib.reportDiagnostic(program, {
      code: "no-categories",
      target: program.getGlobalNamespaceType(),
    });
    return;
  }
  const categories = [...firstCategory.enum.members.values()]
    .map((category) => ({
      title: String(category.value ?? category.name),
      declarations: [...declarations]
        .filter(([, member]) => member === category)
        .map(([type]) => type)
        .sort((a, b) => getTypeName(a).localeCompare(getTypeName(b), "en")),
    }))
    .filter((category) => category.declarations.length > 0);

  const output = render(
    Reference({
      program,
      categories,
      declarations: new Set(declarations.keys()),
    }),
  );
  await traverseOutput(output, {
    visitDirectory: () => {},
    visitFile: async (file) => {
      if (!("contents" in file))
        throw new Error(`Unexpected copied reference file: ${file.path}`);
      await emitFile(program, {
        path: resolvePath(context.emitterOutputDir, file.path),
        content: file.contents,
      });
    },
  });
}
