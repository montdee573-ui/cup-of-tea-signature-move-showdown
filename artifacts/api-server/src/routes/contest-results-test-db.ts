import { contestResultsTable } from "../../../../lib/db/src/schema/contest-results";
import { studioLoginAttemptsTable } from "../../../../lib/db/src/schema/studio-login-attempts";
import { studioReelsTable } from "../../../../lib/db/src/schema/studio-reels";

type ContestResultRow = typeof contestResultsTable.$inferSelect;
type StudioLoginAttemptRow = typeof studioLoginAttemptsTable.$inferSelect;

let rows: ContestResultRow[] = [];
let nextId = 1;
const studioLoginAttempts = new Map<string, StudioLoginAttemptRow>();
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

export function resetContestResultRows(seed: Array<Partial<ContestResultRow>> = []): void {
  nextId = 1;
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
}

export function getContestResultRowsForTest(): ContestResultRow[] {
  return rows.map((row) => ({ ...row }));
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
      orderBy: async () => [...rows],
      where: async (condition: unknown) => {
        if (table === studioLoginAttemptsTable) {
          const ipAddress = columnTextFilter(condition, "ip_address");
          const attempt = ipAddress ? studioLoginAttempts.get(ipAddress) : undefined;
          return attempt ? [{ ...attempt }] : [];
        }
        const providerId = providerIdFilter(condition);
        const matches = providerId === undefined
          ? rows
          : rows.filter((row) => row.emailProviderId === providerId);
        return matches.length ? [matches[0]] : [];
      },
    }),
  }),
  insert: (_table: unknown) => ({
    values: (values: Partial<ContestResultRow>) => ({
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
          const providerId = providerIdFilter(condition);
          if (providerId !== undefined && target.emailProviderId !== providerId) return [];
          if (changes.status === "cleared" && target.status !== "draft") return [];
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

export { contestResultsTable, studioLoginAttemptsTable, studioReelsTable };
