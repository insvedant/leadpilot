import type { Request } from 'express';
import type { Types } from 'mongoose';
import { Activity, type ActivityType } from '../models/Activity';
import { Workspace } from '../models/Workspace';

type Id = string | Types.ObjectId;

/** Records an action. Never throws: activity logging must not break the action itself. */
export function logActivity(
  who: { userId?: Id | null; workspaceId?: Id | null },
  type: ActivityType,
  summary: string,
  meta?: Record<string, unknown>,
): void {
  Activity.create({ userId: who.userId ?? undefined, workspaceId: who.workspaceId ?? undefined, type, summary: summary.slice(0, 500), meta }).catch(
    (err) => console.error('Activity log failed', err),
  );
}

export function logFromRequest(req: Request, type: ActivityType, summary: string, meta?: Record<string, unknown>): void {
  logActivity({ userId: req.auth?.userId, workspaceId: req.auth?.workspaceId }, type, summary, meta);
}

/** For background jobs (sending, reply checks) that only know the workspace. */
export async function logForWorkspace(workspaceId: Id, type: ActivityType, summary: string, meta?: Record<string, unknown>): Promise<void> {
  const ws = await Workspace.findById(workspaceId, { ownerId: 1 }).lean().catch(() => null);
  logActivity({ userId: ws?.ownerId ?? undefined, workspaceId }, type, summary, meta);
}
