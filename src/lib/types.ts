// REST APIの応答の型（使う項目だけ）

export interface GitHubUser {
  login: string;
  avatar_url: string;
  html_url: string;
  name?: string | null;
}

export interface PullRequest {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  draft?: boolean;
  body: string | null;
  user: GitHubUser | null;
  created_at: string;
  updated_at: string;
  head: { sha: string; ref: string };
  base: { ref: string };
  requested_reviewers?: GitHubUser[];
  assignees?: GitHubUser[];
}

export interface PullFile {
  sha: string;
  filename: string;
  previous_filename?: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  changes: number;
  /** 大きいファイルやバイナリでは無い */
  patch?: string;
  blob_url: string;
}

export type MergeMethod = "merge" | "squash" | "rebase";
export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";

export interface Deployment {
  id: number;
  sha: string;
  ref: string;
  environment: string;
  created_at: string;
  updated_at: string;
}

export type DeploymentState =
  | "error"
  | "failure"
  | "inactive"
  | "in_progress"
  | "queued"
  | "pending"
  | "success";

export interface DeploymentStatus {
  id: number;
  state: DeploymentState;
  environment_url?: string | null;
  log_url?: string | null;
  target_url?: string | null;
  created_at: string;
}

export interface IssueComment {
  id: number;
  body?: string;
  user: GitHubUser | null;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export type RunStatus = "queued" | "in_progress" | "completed" | "waiting" | "requested" | "pending";
export type RunConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "stale"
  | "startup_failure"
  | null;

export interface CheckRun {
  id: number;
  name: string;
  status: RunStatus;
  conclusion: RunConclusion;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
  details_url: string | null;
  app: { slug: string; name: string } | null;
  output?: { title: string | null; summary: string | null };
}

export interface CommitStatus {
  id: number;
  context: string;
  state: "error" | "failure" | "pending" | "success";
  description: string | null;
  target_url: string | null;
  updated_at: string;
}

export interface CombinedStatus {
  state: "failure" | "pending" | "success";
  statuses: CommitStatus[];
}

export interface Workflow {
  id: number;
  name: string;
  path: string;
  state: string;
}

export interface WorkflowRun {
  id: number;
  name: string | null;
  display_title: string;
  run_number: number;
  run_attempt: number;
  event: string;
  status: RunStatus | null;
  conclusion: RunConclusion;
  workflow_id: number;
  head_branch: string | null;
  head_sha: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at?: string;
  actor: GitHubUser | null;
  triggering_actor?: GitHubUser | null;
  pull_requests?: { number: number }[];
  path?: string;
}

export interface JobStep {
  name: string;
  status: RunStatus;
  conclusion: RunConclusion;
  number: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface Job {
  id: number;
  run_id: number;
  name: string;
  status: RunStatus;
  conclusion: RunConclusion;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
  steps?: JobStep[];
  run_attempt?: number;
}

export interface Notification {
  id: string;
  unread: boolean;
  reason: string;
  updated_at: string;
  last_read_at: string | null;
  subject: {
    title: string;
    url: string | null;
    latest_comment_url: string | null;
    type: string;
  };
  repository: {
    full_name: string;
    name: string;
    owner: { login: string; avatar_url: string };
    html_url: string;
  };
}
