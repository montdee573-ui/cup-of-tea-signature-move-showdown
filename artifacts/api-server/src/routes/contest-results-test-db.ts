import { contestResultsTable } from "../../../../lib/db/src/schema/contest-results";
import { studioReelsTable } from "../../../../lib/db/src/schema/studio-reels";

type ContestResultRow = typeof contestResultsTable.$inferSelect;

let rows: ContestResultRow[] = [];
let nextId = 1;

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
    ...row,
  }));
}

export const db = {
  select: () => ({
    from: (_table: unknown) => ({
      orderBy: async () => [...rows],
      where: async () => rows.length ? [rows[0]] : [],
    }),
  }),
  insert: (_table: unknown) => ({
    values: (values: Partial<ContestResultRow>) => ({
      returning: async () => {
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
          ...values,
        } as ContestResultRow;
        rows.push(row);
        return [row];
      },
    }),
  }),
  update: (_table: unknown) => ({
    set: (changes: Partial<ContestResultRow>) => ({
      where: () => ({
        returning: async () => {
          const target = rows[0];
          if (!target) return [];
          if (changes.status === "cleared" && target.status !== "draft") return [];
          if (changes.emailDeliveryStatus === "sending" &&
            (target.status !== "cleared" || !["not_sent", "failed"].includes(target.emailDeliveryStatus))) return [];
          if (changes.emailDeliveryStatus === "sent" && target.emailDeliveryStatus !== "sending") return [];
          if (changes.emailDeliveryStatus === "failed" &&
            (target.status !== "cleared" || !["not_sent", "failed", "sending"].includes(target.emailDeliveryStatus))) return [];
          Object.assign(target, changes);
          return [target];
        },
      }),
    }),
  }),
};

export { contestResultsTable, studioReelsTable };
