import { useCallback, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { keys } from "./queries.ts";

/** ボタン操作（マージ、再実行など）の実行中表示とエラー表示をまとめる */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, error, run, clearError: () => setError(null) };
}

export async function refreshPull(qc: QueryClient, owner: string, repo: string, number: number) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: keys.pull(owner, repo, number) }),
    qc.invalidateQueries({ queryKey: ["pulls", owner, repo] }),
    qc.invalidateQueries({ queryKey: keys.myWork }),
  ]);
}
