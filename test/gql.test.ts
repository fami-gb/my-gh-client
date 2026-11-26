import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSchema, parse, validate } from "graphql";
import { ALL_DOCUMENTS } from "../src/lib/gql.ts";

// GitHubが公開しているGraphQLスキーマに対して、アプリのクエリが正しいかを確かめる
const schemaPath = new URL("../node_modules/@octokit/graphql-schema/schema.graphql", import.meta.url);
const schema = buildSchema(readFileSync(schemaPath, "utf8"), { assumeValidSDL: true, assumeValid: true });

for (const [name, doc] of Object.entries(ALL_DOCUMENTS)) {
  test(`GraphQL ${name} はスキーマに合っている`, () => {
    const errors = validate(schema, parse(doc));
    assert.deepEqual(errors.map((e) => e.message), []);
  });
}
