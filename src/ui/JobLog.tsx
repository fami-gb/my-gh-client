import { memo, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FoldIcon,
  LinkExternalIcon,
  SearchIcon,
  SyncIcon,
  UnfoldIcon,
  WrapIcon,
} from "@primer/octicons-react";
import { parseLog, type LogLine, type LogNode } from "../lib/log.ts";
import { href } from "../lib/routes.ts";
import { formatDuration, runTone, TONE_LABEL } from "../lib/status.ts";
import { Link } from "../router.tsx";
import { useServices } from "../services.tsx";
import { AppHeader, ErrorBox, LazyRender, Loading, RelTime, ToneIcon } from "./components.tsx";
import { openExternal } from "./open.ts";
import { keys, useJob, useJobLog } from "./queries.ts";
import { useAction } from "./useAction.ts";

// ジョブの詳細とログ。ログは ##[group] ごとに折りたたみ、エラーのあるグループだけ最初から開く。

const CHUNK = 400;

export default function JobLog({ owner, repo, runId, jobId }: { owner: string; repo: string; runId: number; jobId: number }) {
  const job = useJob(owner, repo, jobId);
  const j = job.data;
  const running = !!j && j.status !== "completed";
  const log = useJobLog(owner, repo, jobId, running);
  const parsed = useMemo(() => (log.data ? parseLog(log.data) : null), [log.data]);
  const { client } = useServices();
  const qc = useQueryClient();
  const act = useAction();

  const [query, setQuery] = useState("");
  const [wrap, setWrap] = useState(true);
  const [openAll, setOpenAll] = useState<boolean | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [renderAll, setRenderAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const tone = j ? runTone(j.status, j.conclusion) : "pending";
  const q = query.trim().toLowerCase();
  const matchCount = useMemo(() => {
    if (!parsed || !q) return 0;
    let n = 0;
    for (const node of parsed.nodes) {
      const lines = node.type === "line" ? [node.line] : [node.title, ...node.lines];
      for (const l of lines) if (l.text.toLowerCase().includes(q)) n++;
    }
    return n;
  }, [parsed, q]);

  const chunks = useMemo(() => {
    if (!parsed) return [];
    const out: LogNode[][] = [];
    for (let i = 0; i < parsed.nodes.length; i += CHUNK) out.push(parsed.nodes.slice(i, i + CHUNK));
    return out;
  }, [parsed]);

  function jumpToError() {
    const first = parsed?.errors[0];
    if (!first) return;
    // まだ描いていない部分にあるかもしれないので全部描いてから飛ぶ（エラーのあるグループは開いている）
    setRenderAll(true);
    setTimeout(() => document.getElementById(`L${first.no}`)?.scrollIntoView({ block: "center" }), 50);
  }

  return (
    <>
      <AppHeader
        context={
          <Link href={href({ name: "run", owner, repo, runId })} className="header-context-link">
            {owner}/{repo} · Run
          </Link>
        }
        title={j?.name ?? "ジョブ"}
        right={
          <button
            className="header-btn"
            aria-label="GitHubで開く"
            onClick={() => openExternal(j?.html_url ?? `https://github.com/${owner}/${repo}/actions/runs/${runId}/job/${jobId}`)}
          >
            <LinkExternalIcon size={18} />
          </button>
        }
      />
      <main className="page job-page">
        {job.isError ? (
          <ErrorBox error={job.error} retry={() => job.refetch()} />
        ) : !j ? (
          <Loading />
        ) : (
          <>
            <div className="job-summary">
              <ToneIcon tone={tone} size={20} />
              <div className="grow min0">
                <div className="text-bold">{TONE_LABEL[tone]}</div>
                <div className="fg-muted small">
                  {j.started_at && (
                    <>
                      <RelTime iso={j.started_at} /> に開始 · {formatDuration(j.started_at, j.completed_at)}
                    </>
                  )}
                </div>
              </div>
              {!running && (
                <button
                  className="btn btn-sm"
                  disabled={!!act.busy}
                  onClick={() =>
                    act.run("rerun", async () => {
                      await client.rerunJob(owner, repo, jobId);
                      await new Promise((r) => setTimeout(r, 1500));
                      await qc.invalidateQueries({ queryKey: keys.job(owner, repo, jobId) });
                      await qc.invalidateQueries({ queryKey: keys.run(owner, repo, runId) });
                    })
                  }
                >
                  <SyncIcon size={14} /> {act.busy ? "依頼中…" : "このジョブを再実行"}
                </button>
              )}
            </div>
            {act.error && <p className="fg-danger small">{act.error}</p>}

            {j.steps && j.steps.length > 0 && (
              <div className="box steps-box">
                <button className="box-header box-row-button" onClick={() => setStepsOpen(!stepsOpen)}>
                  {stepsOpen ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
                  <span className="text-bold">ステップ</span>
                  <span className="fg-muted small">
                    {j.steps.filter((s) => s.conclusion === "failure").length > 0
                      ? `失敗: ${j.steps.filter((s) => s.conclusion === "failure").map((s) => s.name).join(", ")}`
                      : `${j.steps.length}件`}
                  </span>
                </button>
                {stepsOpen &&
                  j.steps.map((s) => (
                    <div className="box-row step-row" key={s.number}>
                      <ToneIcon tone={runTone(s.status, s.conclusion)} size={14} />
                      <span className="grow min0 ellipsis">{s.name}</span>
                      <span className="fg-muted small nowrap">{formatDuration(s.started_at, s.completed_at)}</span>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}

        <div className="log-toolbar">
          <label className="search-bar log-search">
            <SearchIcon size={14} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ログを検索" />
            {q && <span className="fg-muted small nowrap">{matchCount}件</span>}
          </label>
          {parsed && parsed.errors.length > 0 && (
            <button className="btn btn-sm btn-danger-outline" onClick={jumpToError}>
              <AlertIcon size={14} /> エラー {parsed.errors.length}
            </button>
          )}
          <button className={`btn btn-sm ${wrap ? "selected" : ""}`} onClick={() => setWrap(!wrap)} aria-pressed={wrap} title="折り返し">
            <WrapIcon size={14} />
          </button>
          <button className="btn btn-sm" onClick={() => setOpenAll(openAll ? false : true)} title={openAll ? "すべて閉じる" : "すべて開く"}>
            {openAll ? <FoldIcon size={14} /> : <UnfoldIcon size={14} />}
          </button>
        </div>

        {log.isPending ? (
          <Loading label={running ? "ログを待っています…" : "ログを読み込み中…"} />
        ) : log.isError ? (
          <div className="flash flash-warn">
            <AlertIcon size={16} />
            <div className="flash-body">
              <div>ログを読み込めませんでした。{running ? "実行中のジョブはログが少し遅れて出ます。" : "古いログは消えていることがあります。"}</div>
              <div className="fg-muted small">{log.error.message}</div>
              <div className="row-gap">
                <button className="btn btn-sm" onClick={() => log.refetch()}>
                  再試行
                </button>
                <button className="btn btn-sm" onClick={() => openExternal(j?.html_url ?? "")}>
                  GitHubで見る
                </button>
              </div>
            </div>
          </div>
        ) : parsed ? (
          <div className={`log ${wrap ? "wrap" : ""}`} ref={containerRef}>
            {chunks.map((nodes, i) => (
              <LazyRender key={i} estimate={nodes.length * 20} force={renderAll || !!q}>
                {() => <LogChunk nodes={nodes} query={q} openAll={openAll} />}
              </LazyRender>
            ))}
            {running && (
              <div className="log-line fg-muted">
                <span className="log-num" />
                <span className="log-text">
                  <SyncIcon size={12} className="spin" /> 実行中…（10秒ごとに更新）
                </span>
              </div>
            )}
          </div>
        ) : null}
      </main>
    </>
  );
}

const LogChunk = memo(function LogChunk({ nodes, query, openAll }: { nodes: LogNode[]; query: string; openAll: boolean | null }) {
  return (
    <>
      {nodes.map((n) =>
        n.type === "line" ? (
          <LogLineView key={n.line.no} line={n.line} query={query} />
        ) : (
          <LogGroup key={n.title.no} node={n} query={query} openAll={openAll} />
        ),
      )}
    </>
  );
});

function LogGroup({ node, query, openAll }: { node: Extract<LogNode, { type: "group" }>; query: string; openAll: boolean | null }) {
  const hasMatch = !!query && node.lines.some((l) => l.text.toLowerCase().includes(query));
  const [open, setOpen] = useState(node.hasError);
  useEffect(() => {
    if (openAll !== null) setOpen(openAll || node.hasError);
  }, [openAll, node.hasError]);
  const shown = open || hasMatch;
  return (
    <div className="log-group">
      <button className={`log-line log-group-title ${node.hasError ? "has-error" : ""}`} onClick={() => setOpen(!shown)} id={`L${node.title.no}`}>
        <span className="log-num">{node.title.no}</span>
        <span className="log-text">
          {shown ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />} {highlight(node.title.text, query)}
        </span>
      </button>
      {shown && node.lines.map((l) => <LogLineView key={l.no} line={l} query={query} />)}
    </div>
  );
}

const LogLineView = memo(function LogLineView({ line, query }: { line: LogLine; query: string }) {
  return (
    <div className={`log-line ${line.level ? `log-${line.level}` : ""}`} id={`L${line.no}`}>
      <span className="log-num">{line.no}</span>
      <span className="log-text">
        {line.level === "error" && <span className="log-tag">Error: </span>}
        {line.level === "warning" && <span className="log-tag">Warning: </span>}
        {highlight(line.text, query)}
      </span>
    </div>
  );
});

function highlight(text: string, query: string) {
  if (!query) return text || " ";
  const lower = text.toLowerCase();
  const parts: (string | ReactElement)[] = [];
  let i = 0;
  let k = 0;
  for (;;) {
    const j = lower.indexOf(query, i);
    if (j < 0) break;
    parts.push(text.slice(i, j));
    parts.push(<mark key={k++}>{text.slice(j, j + query.length)}</mark>);
    i = j + query.length;
  }
  parts.push(text.slice(i));
  return parts;
}
