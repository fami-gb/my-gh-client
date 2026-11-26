import { test } from "node:test";
import assert from "node:assert/strict";
import { PatAuthProvider } from "../src/lib/auth.ts";
import { MemoryStore } from "../src/lib/kv.ts";

test("PATを保存して読み出せる", async () => {
  const store = new MemoryStore();
  const auth = new PatAuthProvider(store);
  assert.equal(await auth.getToken(), null);
  await auth.signIn({ token: "  abc123  " });
  assert.equal(await auth.getToken(), "abc123");
  // 別インスタンス（アプリ再起動）でも残る
  assert.equal(await new PatAuthProvider(store).getToken(), "abc123");
});

test("空や空白入りのトークンは弾く", async () => {
  const auth = new PatAuthProvider(new MemoryStore());
  await assert.rejects(auth.signIn({ token: "   " }));
  await assert.rejects(auth.signIn({ token: "ab c" }));
});

test("ログアウトでトークンが消える", async () => {
  const store = new MemoryStore();
  const auth = new PatAuthProvider(store);
  await auth.signIn({ token: "abc" });
  await auth.signOut();
  assert.equal(await auth.getToken(), null);
  assert.equal(await store.get("auth.pat.token"), undefined);
});
