const moveSubmissionsTable = {};
const studioReelsTable = {};
let insertCalls = 0;

export function resetMoveSubmissionPersistenceState(): void {
  insertCalls = 0;
}

export function moveSubmissionPersistenceState() {
  return { insertCalls };
}

export const db = {
  insert: () => ({
    values: (values: Record<string, unknown>) => ({
      returning: async () => {
        insertCalls += 1;
        return [{
          ...values,
          id: "test-submission-id",
          createdAt: new Date("2026-10-01T12:00:00.000Z"),
        }];
      },
    }),
  }),
  select: () => ({
    from: () => ({
      where: async () => [],
    }),
  }),
};

export { moveSubmissionsTable, studioReelsTable };
