import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { APIMessage } from "../agent/types.js";

const SESSIONS_DIR = path.join(os.homedir(), ".deepseek-cli", "sessions");
const MAX_SESSIONS = 20;

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  model: string;
  messageCount: number;
  preview: string;
  messages: APIMessage[];
}

export interface SessionMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  model: string;
  messageCount: number;
  preview: string;
}

function ensureDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true, mode: 0o700 });
  }
}

function sessionPath(id: string): string {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

function generateId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}-${rand}`;
}

function getPreview(messages: APIMessage[]): string {
  const first = messages.find((m) => m.role === "user" && typeof m.content === "string");
  if (!first || typeof first.content !== "string") return "(пустая сессия)";
  return first.content.slice(0, 60) + (first.content.length > 60 ? "…" : "");
}

export function saveSession(
  messages: APIMessage[],
  provider: string,
  model: string,
  existingId?: string,
): string {
  ensureDir();

  const id = existingId ?? generateId();
  const now = new Date().toISOString();
  const existing = existingId ? loadSession(existingId) : null;

  const session: Session = {
    id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    provider,
    model,
    messageCount: messages.length,
    preview: getPreview(messages),
    messages,
  };

  fs.writeFileSync(sessionPath(id), JSON.stringify(session, null, 2), { mode: 0o600 });

  // Prune old sessions
  pruneOldSessions();

  return id;
}

export function loadSession(id: string): Session | null {
  const p = sessionPath(id);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf-8");
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function listSessions(): SessionMeta[] {
  ensureDir();

  const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
  const sessions: SessionMeta[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8");
      const s = JSON.parse(raw) as Session;
      sessions.push({
        id: s.id,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        provider: s.provider,
        model: s.model,
        messageCount: s.messageCount,
        preview: s.preview,
      });
    } catch { /* skip corrupted */ }
  }

  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function pruneOldSessions(): void {
  const sessions = listSessions();
  if (sessions.length <= MAX_SESSIONS) return;
  const toDelete = sessions.slice(MAX_SESSIONS);
  for (const s of toDelete) {
    try { fs.unlinkSync(sessionPath(s.id)); } catch { /* ignore */ }
  }
}
