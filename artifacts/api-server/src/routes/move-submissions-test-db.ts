import { studioLoginAttemptsTable } from "../../../../lib/db/src/schema/studio-login-attempts";

const moveSubmissionsTable = {};
const moveCardsTable = { id: "id", moderationStatus: "moderation_status" };
const studioReelsTable = {};
let insertCalls = 0;
let lastInsertedSubmission: Record<string, unknown> | null = null;
let availableProfessionalCardId: number | null = 1;
let savedMoveCards: Array<Record<string, unknown>> = [];

export function resetMoveSubmissionPersistenceState(): void {
  insertCalls = 0;
  lastInsertedSubmission = null;
  availableProfessionalCardId = 1;
  savedMoveCards = [];
}

export function setAvailableProfessionalCardId(id: number | null): void {
  availableProfessionalCardId = id;
}

export function moveSubmissionPersistenceState() {
  return { insertCalls, lastInsertedSubmission };
}

export const db = {
  insert: (table: unknown) => ({
    values: (values: Record<string, unknown>) => ({
      onConflictDoNothing: async () => {
        if (table === moveCardsTable && Array.isArray(values)) {
          savedMoveCards.push(...values as Array<Record<string, unknown>>);
        }
      },
      returning: async () => {
        if (table === moveCardsTable) {
          const card = {
            ...values,
            id: savedMoveCards.length + 1,
            moderationStatus: values.moderationStatus ?? "draft",
            identityVerified: values.identityVerified ?? false,
            mediaPermissionConfirmed: values.mediaPermissionConfirmed ?? false,
            aiGenerated: values.aiGenerated ?? false,
            aiReviewed: values.aiReviewed ?? false,
            createdAt: new Date("2026-10-01T12:00:00.000Z"),
          };
          savedMoveCards.push(card);
          return [card];
        }
        insertCalls += 1;
        lastInsertedSubmission = values;
        return [{
          ...values,
          id: String(values.id),
          createdAt: new Date("2026-10-01T12:00:00.000Z"),
        }];
      },
    }),
  }),
  select: () => ({
    from: (table: unknown) => {
      const rows = table === moveCardsTable
        ? (savedMoveCards.length
          ? savedMoveCards
          : availableProfessionalCardId !== null
            ? [{ id: availableProfessionalCardId, moderationStatus: "published" }]
            : [])
        : [];
      return {
        where: async () => rows,
        orderBy: async () => rows,
      };
    },
  }),
  update: (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => ({
        returning: async () => {
          if (table !== moveCardsTable || !savedMoveCards[0]) return [];
          savedMoveCards[0] = { ...savedMoveCards[0], ...values };
          return [savedMoveCards[0]];
        },
      }),
    }),
  }),
};

export { moveCardsTable, moveSubmissionsTable, studioLoginAttemptsTable, studioReelsTable };
