import { describe, expect, it } from "vitest";

import { rewriteRelativeTsSpecifiers } from "../../scripts/lib/bindings.js";

describe("rewriteRelativeTsSpecifiers", () => {
  it("adds .js to extensionless relative imports and exports", () => {
    const input = [
      'import type { Foo } from "./Foo";',
      'export type { Bar } from "../Bar";',
      'import type { Baz } from "node:path";',
    ].join("\n");

    expect(rewriteRelativeTsSpecifiers(input)).toBe(
      [
        'import type { Foo } from "./Foo.js";',
        'export type { Bar } from "../Bar.js";',
        'import type { Baz } from "node:path";',
      ].join("\n"),
    );
  });

  it("maps directory exports to index.js when told the specifier is a directory", () => {
    const input = 'export * as v2 from "./v2";';

    expect(
      rewriteRelativeTsSpecifiers(input, {
        directorySpecifiers: new Set(["./v2"]),
      }),
    ).toBe('export * as v2 from "./v2/index.js";');
  });

  it("leaves existing extensions unchanged", () => {
    const input = [
      'import type { Foo } from "./Foo.js";',
      'export type { Bar } from "./Bar.json";',
    ].join("\n");

    expect(rewriteRelativeTsSpecifiers(input)).toBe(input);
  });
});
