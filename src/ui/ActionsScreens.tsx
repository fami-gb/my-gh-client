import { lazy, Suspense, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronRightIcon,
  GitPullRequestIcon,
  LinkExternalIcon,
  PlayIcon,
  StopIcon,
  SyncIcon,
  WorkflowIcon,
} from "@primer/octicons-react";
import { href, pullHref } from "../lib/routes.ts";
import { formatDuration, runTone, TONE_LABEL } from "../lib/status.ts";
import type { Job, WorkflowRun } from "../lib/types.ts";
import { Link } from "../router.tsx";
import { useServices } from "../services.tsx";
import { AppHeader, Avatar, Branch, ErrorBox, Loading, RelTime, Skeleton, ToneIcon } from "./components.tsx";
import { openExternal } from "./open.ts";
import { RepoHeader, RepoNav } from "./PullsScreen.tsx";
import { jobsQuery, keys, runQuery, useJobs, useRun, useRuns, useWorkflows } from "./queries.ts";
import { useAction } from "./useAction.ts";

const JobLog = lazy(() => import("./JobLog.tsx"));

const EVENT_LABEL: Record<string, string> = {
  push: "push",
  pull_request: "PR",
  pull_request_target: "PR",
  workflow_dispatch: "手動",
  schedule: "定期実行",
  release: "リリース",
  workflow_run: "ワークフロー連鎖",
  merge_group: "マージキュー",
};

export function ActionsScreen({ owner, repo, workflow }: { owner: string; repo: string; workflow?: number }) {
  const runs = useRuns(owner, repo, workflow);
  const workflows = useWorkflows(owner, repo);
  const qc = useQueryClient();
  const { client } = useServices();
  const list = runs.data?.pages.flatMap((p) => p.workflow_runs) ?? [];
  const wf = workflows.data?.find((w) => w.id === workflow);

  return (
    <>
      <RepoHeader owner={owner} repo={repo} />
      <RepoNav owner={owner} repo={repo} active="actions" />
      <main className="page">
        <div className="chips" role="tablist" aria-label="ワークフロー">
          <Link
            className={`chip ${!workflow ? "selected" : ""}`}
            href={href({ name: "actions", owner, repo })}
            replace
          >
            すべて
          </Link>
          {workflows.data
            ?.filter((w) => w.state === "active")
            .map((w) => (
              <Link
                key={w.id}
                className={`chip ${workflow === w.id ? "selected" : ""}`}
                href={href({ name: "actions", owner, repo, workflow: w.id })}
                replace
              >
                {w.name}
              </Link>
            ))}
        </div>
        {wf && <DispatchBox owner={owner} repo={repo} workflowId={wf.id} name={wf.name} />}
        <div className="box">
          <div className="box-header">
            <WorkflowIcon size={16} />
            <span className="text-bold">{wf ? wf.name : "すべてのワークフロー"}</span>
            {runs.data && <span className="fg-muted small">{runs.data.pages[0].total_count.toLocaleString()}件</span>}
          </div>
          {runs.isPending ? (
            <Skeleton rows={8} />
          ) : runs.isError ? (
            <div className="box-row">
              <ErrorBox error={runs.error} retry={() => runs.refetch()} />
            </div>
          ) : list.length === 0 ? (
            <div className="blankslate">
              <PlayIcon size={24} />
              <p>実行はまだありません</p>
            </div>
          ) : (
            list.map((r) => (
              <RunRow
                key={r.id}
                run={r}
                owner={owner}
                repo={repo}
                onIntent={() => {
                  void qc.prefetchQuery(runQuery(client, owner, repo, r.id));
                  void qc.prefetchQuery(jobsQuery(client, owner, repo, r.id));
                }}
                seed={() => qc.setQueryData(keys.run(owner, repo, r.id), (old: WorkflowRun | undefined) => old ?? r)}
              />
            ))
          )}
        </div>
        {runs.hasNextPage && (
          <button className="btn btn-block load-more" onClick={() => runs.fetchNextPage()} disabled={runs.isFetchingNextPage}>
            {runs.isFetchingNextPage ? "読み込み中…" : "さらに読み込む"}
          </button>
        )}
      </main>
    </>
  );
}

function RunRow({
  run,
  owner,
  repo,
  onIntent,
  seed,
}: {
  run: WorkflowRun;
  owner: string;
  repo: string;
  onIntent: () => void;
  seed: () => void;
}) {
  const tone = runTone(run.status, run.conclusion);
  return (
    <Link
      className="box-row box-row-button run-row"
      href={href({ name: "run", owner, repo, runId: run.id })}
      onIntent={onIntent}
      onClick={seed}
    >
      <ToneIcon tone={tone} />
      <div className="grow min0">
        <div className="text-bold ellipsis-2">{run.display_title}</div>
        <div className="fg-muted small">
          {run.name} #{run.run_number}: {EVENT_LABEL[run.event] ?? run.event}
          {run.actor && <> · {run.actor.login}</>}
        </div>
        <div className="fg-muted small row-meta">
          {run.head_branch && <Branch name={run.head_branch} />} <RelTime iso={run.run_started_at ?? run.created_at} /> ·{" "}
          {run.status === "completed" ? formatDuration(run.run_started_at ?? run.created_at, run.updated_at) : TONE_LABEL[tone]}
        </div>
      </div>
      <ChevronRightIcon size={16} />
    </Link>
  );
}

function DispatchBox({ owner, repo, workflowId, name }: { owner: string; repo: string; workflowId: number; name: string }) {
  const { client } = useServices();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState("");
  const act = useAction();
  const [done, setDone] = useState(false);
  if (!open) {
    return (
      <button className="btn btn-sm dispatch-toggle" onClick={() => setOpen(true)}>
        <PlayIcon size={14} /> 手動で実行（workflow_dispatch）
      </button>
    );
  }
  return (
    <div className="box dispatch-box">
      <div className="box-row column">
        <label className="form-field">
          ブランチ（空ならデフォルトブランチ）
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="main" autoCapitalize="off" />
        </label>
        <p className="fg-muted small">入力（inputs）が必要なワークフローはGitHubで実行してください。</p>
        <div className="row-gap">
          <button className="btn" onClick={() => setOpen(false)}>
            閉じる
          </button>
          <button
            className="btn btn-primary"
            disabled={!!act.busy}
            onClick={async () => {
              const ok = await act.run("dispatch", async () => {
                let target = ref.trim();
                if (!target) {
                  const repoInfo = await client.request<{ default_branch: string }>(`/repos/${owner}/${repo}`);
                  target = repoInfo.default_branch;
                }
                await client.dispatchWorkflow(owner, repo, workflowId, target);
              });
              if (ok) {
                setDone(true);
                setTimeout(() => void qc.invalidateQueries({ queryKey: ["runs", owner, repo] }), 2500);
              }
            }}
          >
            {act.busy ? "送信中…" : `${name} を実行`}
          </button>
        </div>
        {done && <p className="fg-success small">実行を依頼しました。数秒で一覧に出ます。</p>}
        {act.error && <p className="fg-danger small">{act.error}</p>}
      </div>
    </div>
  );
}

export function RunScreen({ owner, repo, runId }: { owner: string; repo: string; runId: number }) {
  const run = useRun(owner, repo, runId);
  const r = run.data;
  const running = !!r && r.status !== "completed";
  const jobs = useJobs(owner, repo, runId, running);
  const { client } = useServices();
  const qc = useQueryClient();
  const act = useAction();

  async function after() {
    await new Promise((res) => setTimeout(res, 1500));
    await Promise.all([
      qc.invalidateQueries({ queryKey: keys.run(owner, repo, runId) }),
      qc.invalidateQueries({ queryKey: keys.jobs(owner, repo, runId) }),
      qc.invalidateQueries({ queryKey: ["runs", owner, repo] }),
    ]);
  }

  const tone = r ? runTone(r.status, r.conclusion) : "pending";
  const hasFailed = r?.conclusion === "failure" || jobs.data?.some((j) => j.conclusion === "failure");

  return (
    <>
      <AppHeader
        context={`${owner}/${repo}`}
        title={r ? `${r.name ?? "Run"} #${r.run_number}` : `Run ${runId}`}
        right={
          <button
            className="header-btn"
            aria-label="GitHubで開く"
            onClick={() => openExternal(`https://github.com/${owner}/${repo}/actions/runs/${runId}`)}
          >
            <LinkExternalIcon size={18} />
          </button>
        }
      />
      <main className="page">
        {run.isError ? (
          <ErrorBox error={run.error} retry={() => run.refetch()} />
        ) : !r ? (
          <Skeleton rows={4} />
        ) : (
          <>
            <div className="run-summary">
              <h1 className="run-title">
                <ToneIcon tone={tone} size={20} /> {r.display_title}
              </h1>
              <div className="fg-muted small row-meta">
                {r.actor && (
                  <>
                    <Avatar src={r.actor.avatar_url} login={r.actor.login} size={16} /> {r.actor.login} ·{" "}
                  </>
                )}
                {EVENT_LABEL[r.event] ?? r.event} · <RelTime iso={r.run_started_at ?? r.created_at} />
                {r.run_attempt > 1 && <> · 試行 {r.run_attempt}</>}
              </div>
              <div className="run-facts">
                <div>
                  <span className="fg-muted small d-block">状態</span>
                  {TONE_LABEL[tone]}
                </div>
                <div>
                  <span className="fg-muted small d-block">所要時間</span>
                  {formatDuration(r.run_started_at ?? r.created_at, r.status === "completed" ? r.updated_at : null)}
                </div>
                <div className="min0">
                  <span className="fg-muted small d-block">ブランチ</span>
                  {r.head_branch ? <Branch name={r.head_branch} /> : "—"} <code className="sha">{r.head_sha.slice(0, 7)}</code>
                </div>
              </div>
              {r.pull_requests?.map((p) => (
                <Link key={p.number} className="btn btn-sm" href={pullHref(owner, repo, p.number)}>
                  <GitPullRequestIcon size={14} /> #{p.number}
                </Link>
              ))}
              <div className="row-gap run-actions">
                {running ? (
                  <button
                    className="btn btn-danger-outline"
                    disabled={!!act.busy}
                    onClick={() => act.run("cancel", async () => {
                      await client.cancelRun(owner, repo, runId);
                      await after();
                    })}
                  >
                    <StopIcon size={16} /> {act.busy === "cancel" ? "キャンセル中…" : "キャンセル"}
                  </button>
                ) : (
                  <>
                    {hasFailed && (
                      <button
                        className="btn btn-primary"
                        disabled={!!act.busy}
                        onClick={() => act.run("failed", async () => {
                          await client.rerunFailedJobs(owner, repo, runId);
                          await after();
                        })}
                      >
                        <SyncIcon size={16} /> {act.busy === "failed" ? "依頼中…" : "失敗したジョブを再実行"}
                      </button>
                    )}
                    <button
                      className="btn"
                      disabled={!!act.busy}
                      onClick={() => act.run("all", async () => {
                        await client.rerunRun(owner, repo, runId);
                        await after();
                      })}
                    >
                      <SyncIcon size={16} /> {act.busy === "all" ? "依頼中…" : "すべて再実行"}
                    </button>
                  </>
                )}
              </div>
              {act.error && <p className="fg-danger small">{act.error}</p>}
            </div>

            <div className="box">
              <div className="box-header">
                <span className="text-bold">ジョブ</span>
                {jobs.data && <span className="fg-muted small">{jobs.data.length}件</span>}
              </div>
              {jobs.isPending ? (
                <Loading />
              ) : jobs.isError ? (
                <div className="box-row">
                  <ErrorBox error={jobs.error} retry={() => jobs.refetch()} />
                </div>
              ) : (
                jobs.data.map((j) => <JobRow key={j.id} job={j} owner={owner} repo={repo} runId={runId} />)
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}

function JobRow({ job, owner, repo, runId }: { job: Job; owner: string; repo: string; runId: number }) {
  const qc = useQueryClient();
  const tone = runTone(job.status, job.conclusion);
  return (
    <Link
      className="box-row box-row-button"
      href={href({ name: "job", owner, repo, runId, jobId: job.id })}
      onClick={() => qc.setQueryData(keys.job(owner, repo, job.id), (old: Job | undefined) => old ?? job)}
      onIntent={() => void import("./JobLog.tsx")}
    >
      <ToneIcon tone={tone} />
      <div className="grow min0">
        <div className="text-bold ellipsis">{job.name}</div>
        <div className="fg-muted small">
          {job.started_at ? formatDuration(job.started_at, job.completed_at) : TONE_LABEL[tone]}
          {job.steps?.length ? ` · ${job.steps.length}ステップ` : ""}
        </div>
      </div>
      <ChevronRightIcon size={16} />
    </Link>
  );
}

export function JobScreen({ owner, repo, runId, jobId }: { owner: string; repo: string; runId: number; jobId: number }) {
  return (
    <Suspense
      fallback={
        <>
          <AppHeader context={`${owner}/${repo}`} title="ジョブ" />
          <main className="page">
            <Loading />
          </main>
        </>
      }
    >
      <JobLog owner={owner} repo={repo} runId={runId} jobId={jobId} />
    </Suspense>
  );
}
