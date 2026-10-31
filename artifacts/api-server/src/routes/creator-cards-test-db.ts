import { creatorMotionOrdersTable } from "../../../../lib/db/src/schema/creator-motion-orders";
import { moveSubmissionsTable } from "../../../../lib/db/src/schema/move-submissions";

type SubmissionRow = typeof moveSubmissionsTable.$inferSelect;
type MotionOrderRow = typeof creatorMotionOrdersTable.$inferSelect;

const submissionId = "6dbec5fa-e3f8-4b1c-b245-1371b2ef51ae";
let submission: SubmissionRow;
let orders: MotionOrderRow[] = [];
let nextOrderId = 1;
let writes: string[] = [];

function recordWrite(table: unknown): void {
  const tableName = table === creatorMotionOrdersTable
    ? "creator_motion_orders"
    : table === moveSubmissionsTable
      ? "move_submissions"
      : "unexpected_table";
  if (!writes.includes(tableName)) writes.push(tableName);
}

export function resetCreatorCardState(row: Partial<SubmissionRow> = {}): void {
  submission = {
    id: submissionId,
    sport: "Basketball",
    category: "Open",
    moveName: "Spin move",
    displayName: "Creator",
    handle: "creator",
    team: null,
    design: "holo",
    merchProductId: null,
    merchProductName: null,
    videoObjectPath: "private/submission/video",
    videoFileName: "move.mp4",
    videoContentType: "video/mp4",
    videoSizeBytes: 1024,
    consentAt: new Date("2026-10-01T12:00:00.000Z"),
    status: "approved",
    creatorTokenHash: null,
    createdAt: new Date("2026-10-01T12:00:00.000Z"),
    reviewedAt: new Date("2026-10-01T12:00:00.000Z"),
    ...row,
  } as SubmissionRow;
  orders = [];
  nextOrderId = 1;
  writes = [];
}

export function creatorCardState() {
  return {
    submission: { ...submission },
    orders: orders.map((order) => ({ ...order })),
    writes: [...writes],
  };
}

export const db: any = {
  select: () => ({
    from: (table: unknown) => ({
      where: async () => table === moveSubmissionsTable
        ? [{ ...submission }]
        : table === creatorMotionOrdersTable
          ? orders.map((order) => ({ ...order }))
          : [],
    }),
  }),
  insert: (table: unknown) => ({
    values: (values: Partial<MotionOrderRow>) => ({
      onConflictDoNothing: () => ({
        returning: async () => {
          recordWrite(table);
          if (table !== creatorMotionOrdersTable || orders.length) return [];
          const order = {
            id: nextOrderId++,
            submissionId,
            checkoutConfigurationId: null,
            checkoutUrl: null,
            paymentId: null,
            status: "creating",
            priceUsd: null,
            generationStatus: "not_started",
            generationPredictionId: null,
            generationObjectPath: null,
            generationError: null,
            generationStartedAt: null,
            createdAt: new Date(),
            paidAt: null,
            ...values,
          } as MotionOrderRow;
          orders.push(order);
          return [{ ...order }];
        },
      }),
    }),
  }),
  update: (table: unknown) => ({
    set: (changes: Partial<MotionOrderRow>) => ({
      where: () => ({
        returning: async () => {
          recordWrite(table);
          if (table !== creatorMotionOrdersTable) return [];
          const order = orders.find((candidate) =>
            changes.status !== "creating" || candidate.status === "failed",
          );
          if (!order) return [];
          Object.assign(order, changes);
          return [{ ...order }];
        },
      }),
    }),
  }),
};

export { creatorMotionOrdersTable, moveSubmissionsTable };
