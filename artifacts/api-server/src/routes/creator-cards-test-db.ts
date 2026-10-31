import { creatorMotionOrdersTable } from "../../../../lib/db/src/schema/creator-motion-orders";
import { moveSubmissionsTable } from "../../../../lib/db/src/schema/move-submissions";
import { studioReelsTable } from "../../../../lib/db/src/schema/studio-reels";

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

export function seedCreatorMotionOrder(overrides: Partial<MotionOrderRow> = {}): void {
  orders = [{
    id: nextOrderId++,
    submissionId,
    checkoutConfigurationId: "checkout_test",
    checkoutUrl: null,
    paymentId: "pay_test",
    status: "paid",
    priceUsd: 9.99,
    generationStatus: "failed",
    generationPredictionId: null,
    generationObjectPath: null,
    generationError: "Generation failed.",
    generationStartedAt: null,
    generationRetryCount: 1,
    refundRequestStatus: "none",
    refundRequestedAt: null,
    refundProcessingAt: null,
    createdAt: new Date("2026-10-01T12:00:00.000Z"),
    paidAt: new Date("2026-10-01T12:00:00.000Z"),
    ...overrides,
  }];
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
            generationRetryCount: 0,
            refundRequestStatus: "none",
            refundRequestedAt: null,
            refundProcessingAt: null,
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
          const order = orders.find((candidate) => {
            if (changes.status === "creating") return candidate.status === "failed";
            if (changes.status === "pending") return candidate.status === "creating";
            if (changes.status === "failed") return candidate.status === "creating";
            if (changes.status === "paid") return candidate.status === "pending";
            if (changes.refundRequestStatus === "requested") {
              return candidate.refundRequestStatus === "none"
                && candidate.status === "paid"
                && candidate.generationStatus === "failed"
                && candidate.generationRetryCount >= 1;
            }
            if (changes.refundRequestStatus === "processing") return candidate.refundRequestStatus === "requested";
            if (changes.refundRequestStatus === "completed") return candidate.refundRequestStatus === "processing";
            if (changes.refundRequestStatus === "declined") return candidate.refundRequestStatus === "requested";
            if (changes.generationStatus === "starting") {
              return candidate.status === "paid"
                && candidate.generationStatus === "not_started";
            }
            if (changes.generationStatus === "not_started") {
              return candidate.status === "paid"
                && candidate.generationStatus === "failed"
                && candidate.refundRequestStatus === "none";
            }
            return true;
          });
          if (!order) return [];
          Object.assign(order, changes);
          return [{ ...order }];
        },
      }),
    }),
  }),
};

export { creatorMotionOrdersTable, moveSubmissionsTable, studioReelsTable };
