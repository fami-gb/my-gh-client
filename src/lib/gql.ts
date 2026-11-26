// GraphQLのクエリと結果の型。表示に要る項目を1往復でまとめて取る。

export interface Actor {
  login: string;
  avatarUrl: string;
}

export interface Label {
  name: string;
  color: string;
}

export type PrState = "OPEN" | "CLOSED" | "MERGED";
export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
export type RollupState = "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED" | null;

export interface PrRow {
  id: string;
  number: number;
  title: string;
  state: PrState;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  url: string;
  author: Actor | null;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  reviewDecision: ReviewDecision;
  comments: { totalCount: number };
  labels: { nodes: Label[] };
  commits: { nodes: { commit: { statusCheckRollup: { state: RollupState } | null } }[] };
  repository: { nameWithOwner: string };
}

const PR_ROW = /* GraphQL */ `
fragment PrRow on PullRequest {
  id number title state isDraft createdAt updatedAt url
  author { login avatarUrl }
  headRefName headRefOid baseRefName
  reviewDecision
  comments { totalCount }
  labels(first: 6) { nodes { name color } }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
  repository { nameWithOwner }
}`;

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface PullListResult {
  repository: {
    pullRequests: { totalCount: number; pageInfo: PageInfo; nodes: PrRow[] };
    open: { totalCount: number };
    closed: { totalCount: number };
  } | null;
}

export const PULL_LIST = /* GraphQL */ `
query PullList($owner: String!, $name: String!, $states: [PullRequestState!], $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: $states, first: 25, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { ...PrRow }
    }
    open: pullRequests(states: OPEN) { totalCount }
    closed: pullRequests(states: [CLOSED, MERGED]) { totalCount }
  }
}
${PR_ROW}`;

export interface SearchResult {
  search: { issueCount: number; pageInfo: PageInfo; nodes: (PrRow | { __typename?: string })[] };
}

export const PULL_SEARCH = /* GraphQL */ `
query PullSearch($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 25, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { ...PrRow }
  }
}
${PR_ROW}`;

export interface MyWorkResult {
  reviewRequested: { issueCount: number; nodes: (PrRow | Record<string, never>)[] };
  mine: { issueCount: number; nodes: (PrRow | Record<string, never>)[] };
}

export const MY_WORK = /* GraphQL */ `
query MyWork($review: String!, $mine: String!) {
  reviewRequested: search(query: $review, type: ISSUE, first: 20) { issueCount nodes { ...PrRow } }
  mine: search(query: $mine, type: ISSUE, first: 20) { issueCount nodes { ...PrRow } }
}
${PR_ROW}`;

export interface RepoInfo {
  nameWithOwner: string;
  description: string | null;
  isPrivate: boolean;
  url: string;
  viewerPermission: string | null;
  defaultBranchRef: { name: string } | null;
}

export const REPO_INFO = /* GraphQL */ `
query RepoInfo($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner description isPrivate url viewerPermission
    defaultBranchRef { name }
  }
}`;

// ---- PR詳細 ----

export type CheckContext =
  | {
      __typename: "CheckRun";
      name: string;
      status: string;
      conclusion: string | null;
      detailsUrl: string | null;
      databaseId: number | null;
      startedAt: string | null;
      completedAt: string | null;
      checkSuite: { workflowRun: { databaseId: number; workflow: { name: string } } | null; app: { name: string } | null } | null;
    }
  | {
      __typename: "StatusContext";
      context: string;
      state: string;
      targetUrl: string | null;
      description: string | null;
      createdAt: string;
    };

export interface ReviewComment {
  id: string;
  databaseId: number;
  author: Actor | null;
  bodyHTML: string;
  body: string;
  createdAt: string;
  diffHunk: string;
  url: string;
  pullRequestReview: { id: string } | null;
}

export interface ReviewThread {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number | null;
  originalLine: number | null;
  diffSide: "LEFT" | "RIGHT";
  viewerCanResolve: boolean;
  viewerCanUnresolve: boolean;
  viewerCanReply: boolean;
  comments: { nodes: ReviewComment[] };
}

interface EventBase {
  id: string;
  createdAt: string;
  actor: Actor | null;
}

export type TimelineItem =
  | {
      __typename: "IssueComment";
      id: string;
      databaseId: number;
      author: Actor | null;
      bodyHTML: string;
      body: string;
      createdAt: string;
      lastEditedAt: string | null;
      viewerCanUpdate: boolean;
      viewerCanDelete: boolean;
      url: string;
    }
  | {
      __typename: "PullRequestReview";
      id: string;
      author: Actor | null;
      state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";
      bodyHTML: string;
      body: string;
      submittedAt: string | null;
      createdAt: string;
      url: string;
    }
  | {
      __typename: "PullRequestCommit";
      id: string;
      commit: {
        oid: string;
        abbreviatedOid: string;
        messageHeadline: string;
        committedDate: string;
        author: { name: string | null; user: Actor | null } | null;
        statusCheckRollup: { state: RollupState } | null;
      };
    }
  | (EventBase & { __typename: "HeadRefForcePushedEvent"; beforeCommit: { abbreviatedOid: string } | null; afterCommit: { abbreviatedOid: string } | null })
  | (EventBase & { __typename: "MergedEvent"; mergeCommit: { abbreviatedOid: string } | null; mergeRefName: string })
  | (EventBase & { __typename: "ClosedEvent" })
  | (EventBase & { __typename: "ReopenedEvent" })
  | (EventBase & { __typename: "LabeledEvent"; label: Label })
  | (EventBase & { __typename: "UnlabeledEvent"; label: Label })
  | (EventBase & { __typename: "ReviewRequestedEvent"; requestedReviewer: { login?: string; name?: string } | null })
  | (EventBase & { __typename: "ReadyForReviewEvent" })
  | (EventBase & { __typename: "ConvertToDraftEvent" })
  | (EventBase & { __typename: "AssignedEvent"; assignee: { login?: string } | null })
  | (EventBase & { __typename: "HeadRefDeletedEvent"; headRefName: string })
  | (EventBase & { __typename: "RenamedTitleEvent"; previousTitle: string; currentTitle: string });

export interface PullDetail {
  id: string;
  number: number;
  title: string;
  state: PrState;
  isDraft: boolean;
  merged: boolean;
  mergedAt: string | null;
  mergedBy: Actor | null;
  closed: boolean;
  url: string;
  body: string;
  bodyHTML: string;
  createdAt: string;
  updatedAt: string;
  author: Actor | null;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  headRepository: { nameWithOwner: string } | null;
  isCrossRepository: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  mergeStateStatus: "BEHIND" | "BLOCKED" | "CLEAN" | "DIRTY" | "DRAFT" | "HAS_HOOKS" | "UNKNOWN" | "UNSTABLE";
  reviewDecision: ReviewDecision;
  viewerCanUpdate: boolean;
  viewerDidAuthor: boolean;
  totalCommentsCount: number | null;
  commits: { totalCount: number };
  labels: { nodes: Label[] };
  assignees: { nodes: Actor[] };
  reviewRequests: { nodes: { requestedReviewer: { login?: string; avatarUrl?: string; name?: string } | null }[] };
  latestReviews: { nodes: { author: Actor | null; state: string }[] };
  lastCommit: {
    nodes: {
      commit: {
        oid: string;
        statusCheckRollup: { state: RollupState; contexts: { totalCount: number; nodes: CheckContext[] } } | null;
      };
    }[];
  };
  timelineItems: { totalCount: number; nodes: TimelineItem[] };
  reviewThreads: { totalCount: number; nodes: ReviewThread[] };
  baseRepository: {
    mergeCommitAllowed: boolean;
    squashMergeAllowed: boolean;
    rebaseMergeAllowed: boolean;
    viewerDefaultMergeMethod: "MERGE" | "SQUASH" | "REBASE";
    deleteBranchOnMerge: boolean;
    viewerPermission: string | null;
  } | null;
}

export interface PullDetailResult {
  repository: { pullRequest: PullDetail | null } | null;
}

const ACTOR = "actor { login avatarUrl }";

export const PULL_DETAIL = /* GraphQL */ `
query PullDetail($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id number title state isDraft merged mergedAt closed url body bodyHTML createdAt updatedAt
      mergedBy { login avatarUrl }
      author { login avatarUrl }
      headRefName headRefOid baseRefName isCrossRepository
      headRepository { nameWithOwner }
      additions deletions changedFiles
      mergeable mergeStateStatus reviewDecision
      viewerCanUpdate viewerDidAuthor totalCommentsCount
      commits { totalCount }
      labels(first: 20) { nodes { name color } }
      assignees(first: 10) { nodes { login avatarUrl } }
      reviewRequests(first: 10) {
        nodes { requestedReviewer { ... on User { login avatarUrl } ... on Team { name } ... on Bot { login avatarUrl } } }
      }
      latestReviews(first: 10) { nodes { author { login avatarUrl } state } }
      lastCommit: commits(last: 1) {
        nodes {
          commit {
            oid
            statusCheckRollup {
              state
              contexts(first: 100) {
                totalCount
                nodes {
                  __typename
                  ... on CheckRun {
                    name status conclusion detailsUrl databaseId startedAt completedAt
                    checkSuite { workflowRun { databaseId workflow { name } } app { name } }
                  }
                  ... on StatusContext { context state targetUrl description createdAt }
                }
              }
            }
          }
        }
      }
      timelineItems(last: 100, itemTypes: [
        ISSUE_COMMENT, PULL_REQUEST_REVIEW, PULL_REQUEST_COMMIT, HEAD_REF_FORCE_PUSHED_EVENT,
        MERGED_EVENT, CLOSED_EVENT, REOPENED_EVENT, LABELED_EVENT, UNLABELED_EVENT,
        REVIEW_REQUESTED_EVENT, READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT, ASSIGNED_EVENT,
        HEAD_REF_DELETED_EVENT, RENAMED_TITLE_EVENT
      ]) {
        totalCount
        nodes {
          __typename
          ... on IssueComment {
            id databaseId author { login avatarUrl } bodyHTML body createdAt lastEditedAt
            viewerCanUpdate viewerCanDelete url
          }
          ... on PullRequestReview {
            id author { login avatarUrl } state bodyHTML body submittedAt createdAt url
          }
          ... on PullRequestCommit {
            id
            commit {
              oid abbreviatedOid messageHeadline committedDate
              author { name user { login avatarUrl } }
              statusCheckRollup { state }
            }
          }
          ... on HeadRefForcePushedEvent { id createdAt ${ACTOR} beforeCommit { abbreviatedOid } afterCommit { abbreviatedOid } }
          ... on MergedEvent { id createdAt ${ACTOR} mergeCommit: commit { abbreviatedOid } mergeRefName }
          ... on ClosedEvent { id createdAt ${ACTOR} }
          ... on ReopenedEvent { id createdAt ${ACTOR} }
          ... on LabeledEvent { id createdAt ${ACTOR} label { name color } }
          ... on UnlabeledEvent { id createdAt ${ACTOR} label { name color } }
          ... on ReviewRequestedEvent {
            id createdAt ${ACTOR}
            requestedReviewer { ... on User { login } ... on Team { name } ... on Bot { login } }
          }
          ... on ReadyForReviewEvent { id createdAt ${ACTOR} }
          ... on ConvertToDraftEvent { id createdAt ${ACTOR} }
          ... on AssignedEvent { id createdAt ${ACTOR} assignee { ... on User { login } ... on Bot { login } } }
          ... on HeadRefDeletedEvent { id createdAt ${ACTOR} headRefName }
          ... on RenamedTitleEvent { id createdAt ${ACTOR} previousTitle currentTitle }
        }
      }
      reviewThreads(first: 100) {
        totalCount
        nodes {
          id isResolved isOutdated path line originalLine diffSide
          viewerCanResolve viewerCanUnresolve viewerCanReply
          comments(first: 50) {
            nodes {
              id databaseId author { login avatarUrl } bodyHTML body createdAt diffHunk url
              pullRequestReview { id }
            }
          }
        }
      }
      baseRepository {
        mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed viewerDefaultMergeMethod
        deleteBranchOnMerge viewerPermission
      }
    }
  }
}`;

export interface PullCommit {
  commit: {
    oid: string;
    abbreviatedOid: string;
    messageHeadline: string;
    messageBody: string;
    committedDate: string;
    url: string;
    author: { name: string | null; user: Actor | null } | null;
    statusCheckRollup: { state: RollupState } | null;
  };
}

export interface PullCommitsResult {
  repository: { pullRequest: { commits: { totalCount: number; nodes: PullCommit[] } } | null } | null;
}

export const PULL_COMMITS = /* GraphQL */ `
query PullCommits($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      commits(first: 250) {
        totalCount
        nodes {
          commit {
            oid abbreviatedOid messageHeadline messageBody committedDate url
            author { name user { login avatarUrl } }
            statusCheckRollup { state }
          }
        }
      }
    }
  }
}`;

// ---- Issue ----

export interface IssueDetail {
  id: string;
  number: number;
  title: string;
  state: "OPEN" | "CLOSED";
  stateReason: string | null;
  url: string;
  bodyHTML: string;
  createdAt: string;
  author: Actor | null;
  viewerCanUpdate: boolean;
  labels: { nodes: Label[] };
  assignees: { nodes: Actor[] };
  comments: {
    totalCount: number;
    nodes: Extract<TimelineItem, { __typename: "IssueComment" }>[];
  };
}

export const ISSUE_DETAIL = /* GraphQL */ `
query IssueDetail($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      id number title state stateReason url bodyHTML createdAt viewerCanUpdate
      author { login avatarUrl }
      labels(first: 20) { nodes { name color } }
      assignees(first: 10) { nodes { login avatarUrl } }
      comments(last: 100) {
        totalCount
        nodes {
          __typename id databaseId author { login avatarUrl } bodyHTML body createdAt lastEditedAt
          viewerCanUpdate viewerCanDelete url
        }
      }
    }
  }
}`;

// ---- 書き込み ----

export const RESOLVE_THREAD = /* GraphQL */ `
mutation Resolve($id: ID!) { resolveReviewThread(input: { threadId: $id }) { thread { id isResolved } } }`;

export const UNRESOLVE_THREAD = /* GraphQL */ `
mutation Unresolve($id: ID!) { unresolveReviewThread(input: { threadId: $id }) { thread { id isResolved } } }`;

export const READY_FOR_REVIEW = /* GraphQL */ `
mutation Ready($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { id isDraft } } }`;

export const CONVERT_TO_DRAFT = /* GraphQL */ `
mutation Draft($id: ID!) { convertPullRequestToDraft(input: { pullRequestId: $id }) { pullRequest { id isDraft } } }`;

/** すべてのクエリ（スキーマ検証のテスト用） */
export const ALL_DOCUMENTS = {
  PULL_LIST,
  PULL_SEARCH,
  MY_WORK,
  REPO_INFO,
  PULL_DETAIL,
  PULL_COMMITS,
  ISSUE_DETAIL,
  RESOLVE_THREAD,
  UNRESOLVE_THREAD,
  READY_FOR_REVIEW,
  CONVERT_TO_DRAFT,
};
