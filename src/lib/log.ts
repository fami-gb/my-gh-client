// GitHub Actions のジョブログを表示用に分解する。
// 各行は「2026-11-26T01:02:03.1234567Z 本文」。##[group]〜##[endgroup] が折りたたみの単位。

export type LogLevel = "error" | "warning" | "notice" | "command" | "debug" | "section";

export interface LogLine {
  no: number;
  text: string;
  ts?: string;
  level?: LogLevel;
}

export type LogNode =
  | { type: "line"; line: LogLine }
  | { type: "group"; title: LogLine; lines: LogLine[]; hasError: boolean };

export interface ParsedLog {
  nodes: LogNode[];
  lineCount: number;
  errors: LogLine[];
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const TS = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) ?/;

function classify(text: string): { text: string; level?: LogLevel } {
  const m = text.match(/^##\[(error|warning|notice|debug|section)\](.*)$/);
  if (m) return { text: m[2], level: m[1] as LogLevel };
  // ::error file=…::message のようなワークフローコマンドがそのまま出ることもある
  const wc = text.match(/^::(error|warning|notice|debug)(?: [^:]*)?::(.*)$/);
  if (wc) return { text: wc[2], level: wc[1] as LogLevel };
  if (text.startsWith("[command]")) return { text: text.slice(9), level: "command" };
  return { text };
}

export function parseLog(raw: string): ParsedLog {
  const nodes: LogNode[] = [];
  const errors: LogLine[] = [];
  let group: Extract<LogNode, { type: "group" }> | null = null;
  let no = 0;
  const rows = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  if (rows.length && rows[rows.length - 1] === "") rows.pop();

  for (const row of rows) {
    const tsMatch = row.match(TS);
    const ts = tsMatch?.[1];
    const body = (tsMatch ? row.slice(tsMatch[0].length) : row).replace(ANSI, "").replace(/^﻿/, "");

    if (body.startsWith("##[group]")) {
      if (group) nodes.push(group);
      group = { type: "group", title: { no: ++no, text: body.slice(9), ts }, lines: [], hasError: false };
      continue;
    }
    if (body.startsWith("##[endgroup]")) {
      if (group) nodes.push(group);
      group = null;
      continue;
    }
    const { text, level } = classify(body);
    const line: LogLine = { no: ++no, text, ts, ...(level ? { level } : {}) };
    if (level === "error") errors.push(line);
    if (group) {
      group.lines.push(line);
      if (level === "error") group.hasError = true;
    } else {
      nodes.push({ type: "line", line });
    }
  }
  if (group) nodes.push(group);
  return { nodes, lineCount: no, errors };
}
