import { Router, type IRouter } from "express";
import { count, desc, eq } from "drizzle-orm";
import { db, contestantsTable } from "@workspace/db";
import {
  CreateContestantBody,
  CreateContestantResponse,
  GetContestantParams,
  GetContestantResponse,
  GetContestSummaryResponse,
  ListContestantsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const seedContestants = [
  {
    group: "Benchmark Entries",
    handle: "Lil Darrl (AI Benchmark)",
    signatureMove: "The Kobe Move",
    category: "Open",
    verificationStatus: "Verified Clean",
    coreVerdict: "Top Leaderboard",
    overallFidelity: 99,
    referenceClipUrl: null,
    visualProofName: "lil-darrl-benchmark.mp4",
  },
  {
    group: "Official Leaderboard",
    handle: "@MarcusHoops",
    signatureMove: "The Kobe Move",
    category: "Male",
    verificationStatus: "Verified Clean",
    coreVerdict: "Top Leaderboard",
    overallFidelity: 96,
    referenceClipUrl: null,
    visualProofName: "marcus-hoops-kobe-move.mp4",
  },
  {
    group: "Official Leaderboard",
    handle: "@Elena_Moves",
    signatureMove: "The Kobe Move",
    category: "Female",
    verificationStatus: "Verified Clean",
    coreVerdict: "Top Leaderboard",
    overallFidelity: 94,
    referenceClipUrl: null,
    visualProofName: "elena-moves-kobe-move.mp4",
  },
  {
    group: "Active Submissions",
    handle: "@JordanV_99",
    signatureMove: "The Iverson Cross",
    category: "Male",
    verificationStatus: "Pending Check",
    coreVerdict: "Under Review",
    overallFidelity: 88,
    referenceClipUrl: null,
    visualProofName: "jordan-v-iverson-cross.mp4",
  },
  {
    group: "All Participants Roll",
    handle: "@SamirK_Athletics",
    signatureMove: "The Jordan Switch",
    category: "Open",
    verificationStatus: "Verified Clean",
    coreVerdict: "Challenge Cleared",
    overallFidelity: 82,
    referenceClipUrl: null,
    visualProofName: "samir-k-jordan-switch.mp4",
  },
];

let seedPromise: Promise<void> | undefined;

async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const [{ count: total }] = await db
        .select({ count: count() })
        .from(contestantsTable);

      if (total > 0) return;
      await db.insert(contestantsTable).values(seedContestants);
    })();
  }

  await seedPromise;
}

router.get("/contestants", async (req, res): Promise<void> => {
  await ensureSeeded();
  const contestants = await db
    .select()
    .from(contestantsTable)
    .orderBy(desc(contestantsTable.overallFidelity), desc(contestantsTable.createdAt));

  req.log.info({ count: contestants.length }, "Loaded contest entries");
  res.json(ListContestantsResponse.parse(contestants));
});

router.post("/contestants", async (req, res): Promise<void> => {
  const parsed = CreateContestantBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid contest submission");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [contestant] = await db
    .insert(contestantsTable)
    .values({
      group: "Active Submissions",
      handle: parsed.data.handle,
      signatureMove: parsed.data.signatureMove,
      category: parsed.data.category,
      verificationStatus: parsed.data.visualProofName
        ? "Pending Check"
        : "Needs Proof",
      coreVerdict: "Under Review",
      overallFidelity: 0,
      referenceClipUrl: parsed.data.referenceClipUrl,
      visualProofName: parsed.data.visualProofName ?? null,
    })
    .returning();

  req.log.info({ contestantId: contestant.id }, "Created contest submission");
  res.status(201).json(CreateContestantResponse.parse(contestant));
});

router.get("/contestants/:id", async (req, res): Promise<void> => {
  const params = GetContestantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await ensureSeeded();
  const [contestant] = await db
    .select()
    .from(contestantsTable)
    .where(eq(contestantsTable.id, params.data.id));

  if (!contestant) {
    res.status(404).json({ error: "Contestant not found" });
    return;
  }

  res.json(GetContestantResponse.parse(contestant));
});

router.get("/contest/summary", async (_req, res): Promise<void> => {
  await ensureSeeded();
  const contestants = await db
    .select()
    .from(contestantsTable)
    .orderBy(desc(contestantsTable.overallFidelity), desc(contestantsTable.createdAt));

  const verifiedEntries = contestants.filter(
    (contestant) => contestant.verificationStatus === "Verified Clean",
  ).length;
  const pendingEntries = contestants.filter(
    (contestant) => contestant.verificationStatus !== "Verified Clean",
  ).length;
  const averageFidelity = contestants.length
    ? Math.round(
        contestants.reduce((total, contestant) => total + contestant.overallFidelity, 0) /
          contestants.length,
      )
    : 0;
  const moveCounts = new Map<string, number>();
  for (const contestant of contestants) {
    moveCounts.set(
      contestant.signatureMove,
      (moveCounts.get(contestant.signatureMove) ?? 0) + 1,
    );
  }
  const topMove =
    [...moveCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "No move yet";

  res.json(
    GetContestSummaryResponse.parse({
      totalEntries: contestants.length,
      verifiedEntries,
      pendingEntries,
      averageFidelity,
      topMove,
      leaderboard: contestants.slice(0, 5),
    }),
  );
});

export default router;