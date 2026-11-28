import { contestResultsTable } from "../../../../lib/db/src/schema/contest-results";
import { contestResultEmailSettingsTable } from "../../../../lib/db/src/schema/contest-result-email-settings";
import { contestResultHistoryTable } from "../../../../lib/db/src/schema/contest-result-history";
import { contestantsTable } from "../../../../lib/db/src/schema/contestants";
import { creatorMotionOrdersTable } from "../../../../lib/db/src/schema/creator-motion-orders";
import { moveCardsTable } from "../../../../lib/db/src/schema/move-cards";
import { moveSubmissionsTable } from "../../../../lib/db/src/schema/move-submissions";
import {
  promoterCommissionsTable,
  promotersTable,
  recruitmentOrganizationsTable,
  recruitmentStaffTable,
} from "../../../../lib/db/src/schema/promoters";
import { showdownVotesTable, showdownsTable } from "../../../../lib/db/src/schema/showdowns";
import { studioLoginAttemptsTable } from "../../../../lib/db/src/schema/studio-login-attempts";
import { studioReelsTable } from "../../../../lib/db/src/schema/studio-reels";
import { studioReferenceClipsTable } from "../../../../lib/db/src/schema/studio-reference-clips";

export {
  contestantsTable,
  creatorMotionOrdersTable,
  moveCardsTable,
  moveSubmissionsTable,
  promoterCommissionsTable,
  promotersTable,
  recruitmentOrganizationsTable,
  recruitmentStaffTable,
  showdownVotesTable,
  showdownsTable,
  studioReferenceClipsTable,
};

type ContestResultRow = typeof contestResultsTable.$inferSelect;
type ContestResultHistoryRow = typeof contestResultHistoryTable.$inferSelect;
type StudioLoginAttemptRow = typeof studioLoginAttemptsTable.$inferSelect;

let rows: ContestResultRow[] = [];
let historyRows: ContestResultHistoryRow[] = [];
let nextId = 1;
let nextHistoryId = 1;
const studioLoginAttempts = new Map<string, StudioLoginAttemptRow>();
type ContestResultEmailSetting = typeof contestResultEmailSettingsTable.$inferSelect;
let contestResultEmailSetting: ContestResultEmailSetting | undefined;
let transactionQueue = Promise.resolve();

export function resetStudioLoginAttempts(): void {
  studioLoginAttempts.clear();
}

export function setStudioLoginAttempt(ipAddress: string, failedCount: number, windowExpiresAt: Date): void {
  studioLoginAttempts.set(ipAddress, { ipAddress, failedCount, windowExpiresAt });
}

function columnTextFilter(condition: unknown, columnName: string): string | undefined {
  const visit = (value: unknown): string | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const chunks = (value as { queryChunks?: unknown[] }).queryChunks;
    if (!Array.isArray(chunks)) return undefined;
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index] as {
        name?: string;
        queryChunks?: unknown[];
        constructor?: { name?: string };
      };
      if (chunk?.name === columnName) {
        const parameter = chunks.slice(index + 1).find((next) =>
          (next as { constructor?: { name?: string } })?.constructor?.name === "Param") as
            { value?: unknown } | undefined;
        return typeof parameter?.value === "string" ? parameter.value : undefined;
      }
      const nested = visit(chunk);
      if (nested) return nested;
    }
    return undefined;
  };
  return visit(condition);
}

function columnValueFilter(condition: unknown, columnName: string): unknown {
  const visit = (value: unknown): unknown => {
    if (!value || typeof value !== "object") return undefined;
    const chunks = (value as { queryChunks?: unknown[] }).queryChunks;
    if (!Array.isArray(chunks)) return undefined;
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index] as {
        name?: string;
        queryChunks?: unknown[];
        constructor?: { name?: string };
      };
      if (chunk?.name === columnName) {
        const parameter = chunks.slice(index + 1).find((next) =>
          (next as { constructor?: { name?: string } })?.constructor?.name === "Param") as
            { value?: unknown } | undefined;
        return parameter?.value;
      }
      const nested = visit(chunk);
      if (nested !== undefined) return nested;
    }
    return undefined;
  };
  return visit(condition);
}

export function resetContestResultRows(seed: Array<Partial<ContestResultRow>> = []): void {
  nextId = 1;
  nextHistoryId = 1;
  rows = seed.map((row) => ({
    id: nextId++,
    eventTitle: "Test event",
    division: "Open",
    winnerName: "Winner",
    winnerHandle: "@winner",
    runnerUpName: "Runner-up",
    winnerVotes: 10,
    runnerUpVotes: 5,
    coreScore: null,
    base44Summary: "Verified in the original contest app.",
    viralReelSummary: "Verified in Viral Reel.",
    status: "draft",
    clearanceNote: null,
    createdAt: new Date("2026-10-01T12:00:00.000Z"),
    clearedAt: null,
    emailDeliveryStatus: "not_sent",
    emailSentAt: null,
    emailDeliveryError: null,
    emailProviderId: null,
    emailLastWebhookEventId: null,
    emailLastWebhookAt: null,
    ...row,
  }));
  historyRows = [];
  contestResultEmailSetting = undefined;
}

export function getContestResultRowsForTest(): ContestResultRow[] {
  return rows.map((row) => ({ ...row }));
}

export function getContestResultHistoryForTest(): ContestResultHistoryRow[] {
  return historyRows.map((row) => ({ ...row }));
}

function providerIdFilter(condition: unknown): string | undefined {
  const visit = (value: unknown): string | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const chunks = (value as { queryChunks?: unknown[] }).queryChunks;
    if (!Array.isArray(chunks)) return undefined;
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index] as {
        name?: string;
        queryChunks?: unknown[];
        value?: unknown;
        constructor?: { name?: string };
      };
      if (chunk?.name === "email_provider_id") {
        const parameter = chunks.slice(index + 1).find((next) =>
          (next as { constructor?: { name?: string } })?.constructor?.name === "Param") as
            { value?: unknown } | undefined;
        return typeof parameter?.value === "string" ? parameter.value : undefined;
      }
      const nested = visit(chunk);
      if (nested) return nested;
    }
    return undefined;
  };
  return visit(condition);
}

const testDbOperations = {
  select: () => ({
    from: (table: unknown) => ({
      orderBy: async () => table === studioReelsTable
        ? []
        : table === contestResultHistoryTable
          ? historyRows.map((row) => ({ ...row }))
          : rows.map((row) => ({ ...row })),
      where: (condition: unknown) => {
        let matches: unknown[];
        if (table === studioLoginAttemptsTable) {
          const ipAddress = columnTextFilter(condition, "ip_address");
          const attempt = ipAddress ? studioLoginAttempts.get(ipAddress) : undefined;
          matches = attempt ? [{ ...attempt }] : [];
        } else if (table === contestResultEmailSettingsTable) {
          const id = columnValueFilter(condition, "id");
          matches = contestResultEmailSetting &&
            (id === undefined || contestResultEmailSetting.id === id)
            ? [{ ...contestResultEmailSetting }]
            : [];
        } else if (table === contestResultHistoryTable) {
          const resultId = columnValueFilter(condition, "result_id");
          matches = historyRows
            .filter((row) => resultId === undefined || row.resultId === resultId)
            .map((row) => ({ ...row }));
        } else {
          const providerId = providerIdFilter(condition);
          matches = providerId === undefined
            ? rows.map((row) => ({ ...row }))
            : rows.filter((row) => row.emailProviderId === providerId).map((row) => ({ ...row }));
        }
        const result = matches.length > 1 && table === contestResultsTable
          ? [matches[0]]
          : matches;
        return Object.assign(result, { orderBy: async () => result });
      },
    }),
  }),
  insert: (_table: unknown) => ({
    values: (values: Partial<ContestResultRow> | Partial<ContestResultHistoryRow>) => ({
      onConflictDoUpdate: () => ({
        returning: async () => {
          if (_table !== contestResultEmailSettingsTable) return [];
          contestResultEmailSetting = {
            id: 1,
            recipient: "",
            updatedAt: new Date(),
            ...values,
          } as ContestResultEmailSetting;
          return [{ ...contestResultEmailSetting }];
        },
      }),
      returning: async () => {
        if (_table === studioLoginAttemptsTable) {
          const attempt = values as Partial<StudioLoginAttemptRow>;
          const row = {
            ipAddress: attempt.ipAddress ?? "",
            failedCount: attempt.failedCount ?? 0,
            windowExpiresAt: attempt.windowExpiresAt ?? new Date(),
          };
          studioLoginAttempts.set(row.ipAddress, row);
          return [row];
        }
        if (_table === contestResultHistoryTable) {
          const historyRow = {
            id: nextHistoryId++,
            resultId: 0,
            changeType: "clearance",
            snapshot: {
              eventTitle: "",
              division: "",
              winnerName: "",
              winnerHandle: "",
              runnerUpName: "",
              winnerVotes: 0,
              runnerUpVotes: 0,
              coreScore: null,
              base44Summary: "",
              viralReelSummary: "",
            },
            reason: "",
            changedAt: new Date(),
            ...values,
          } as ContestResultHistoryRow;
          historyRows.push(historyRow);
          return [historyRow];
        }
        const row = {
          id: nextId++,
          eventTitle: "",
          division: "",
          winnerName: "",
          winnerHandle: "",
          runnerUpName: "",
          winnerVotes: 0,
          runnerUpVotes: 0,
          coreScore: null,
          base44Summary: "",
          viralReelSummary: "",
          status: "draft",
          clearanceNote: null,
          createdAt: new Date(),
          clearedAt: null,
          emailDeliveryStatus: "not_sent",
          emailSentAt: null,
          emailDeliveryError: null,
          emailProviderId: null,
          emailLastWebhookEventId: null,
          emailLastWebhookAt: null,
          ...values,
        } as ContestResultRow;
        rows.push(row);
        return [row];
      },
    }),
  }),
  update: (table: unknown) => ({
    set: (changes: Partial<ContestResultRow>) => ({
      where: (condition: unknown) => ({
        returning: async () => {
          if (table === studioLoginAttemptsTable) {
            const ipAddress = columnTextFilter(condition, "ip_address");
            const attempt = ipAddress ? studioLoginAttempts.get(ipAddress) : undefined;
            if (!attempt) return [];
            Object.assign(attempt, changes);
            return [attempt];
          }
          const target = rows[0];
          if (!target) return [];
          const targetId = columnValueFilter(condition, "id");
          if (typeof targetId === "number" && target.id !== targetId) return [];
          const providerId = providerIdFilter(condition);
          if (providerId !== undefined && target.emailProviderId !== providerId) return [];
          const requiredStatus = columnTextFilter(condition, "status");
          if (requiredStatus && target.status !== requiredStatus) return [];
          const requiredClearedAt = columnValueFilter(condition, "cleared_at");
          if (requiredClearedAt !== undefined &&
            (!(requiredClearedAt instanceof Date) || target.clearedAt?.getTime() !== requiredClearedAt.getTime())) return [];
          if (changes.status === "cleared" && target.status !== "draft") return [];
          if (changes.clearedAt instanceof Date && target.emailDeliveryStatus === "sending") return [];
          if (changes.emailDeliveryStatus === "sending" &&
            (target.status !== "cleared" || !["not_sent", "failed"].includes(target.emailDeliveryStatus))) return [];
          if (changes.emailDeliveryStatus === "sent" && target.emailDeliveryStatus !== "sending") return [];
          if (changes.emailDeliveryStatus === "failed" &&
            (target.status !== "cleared" || !["not_sent", "failed", "sending"].includes(target.emailDeliveryStatus))) return [];
          if (changes.emailLastWebhookAt instanceof Date &&
            target.emailLastWebhookAt instanceof Date &&
            target.emailLastWebhookAt.getTime() >= changes.emailLastWebhookAt.getTime()) return [];
          Object.assign(target, changes);
          return [target];
        },
      }),
    }),
  }),
  delete: (table: unknown) => {
    return {
      where: (condition: unknown) => {
        return {
          returning: async () => {
            if (table === studioLoginAttemptsTable) {
              const ipAddress = columnTextFilter(condition, "ip_address");
              if (ipAddress) studioLoginAttempts.delete(ipAddress);
            }
            return [];
          },
        };
      },
    };
  },
  execute: async () => undefined,
};

export const db = Object.assign(testDbOperations, {
  transaction: async <T>(callback: (transaction: any) => Promise<T>): Promise<T> => {
    const previousTransaction = transactionQueue;
    let releaseTransaction!: () => void;
    transactionQueue = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });
    await previousTransaction;
    try {
      return await callback(testDbOperations);
    } finally {
      releaseTransaction();
    }
  },
});

export {
  contestResultEmailSettingsTable,
  contestResultHistoryTable,
  contestResultsTable,
  studioLoginAttemptsTable,
  studioReelsTable,
};
