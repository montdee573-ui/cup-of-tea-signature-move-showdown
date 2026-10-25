import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, moveCardsTable } from "@workspace/db";
import {
  GetMoveCardParams,
  GetMoveCardResponse,
  ListMoveCardsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const seedMoveCards = [
  {
    slug: "kobe-bryant-hesitation-drive",
    athleteName: "Kobe Bryant",
    sport: "Basketball",
    era: "Classic",
    team: "Los Angeles Lakers",
    moveName: "Hesitation-to-burst drive",
    tagline: "A pause, a lane, then a hard attack.",
    explanation:
      "In the uploaded game clip, Bryant briefly changes pace with the ball, shifts past the nearby defender toward the right side, and rises for a close finish. This is a description of the visible action, not a verified name for a signature move. The short clip does not identify the game, opponent, or date.",
    cues: [
      "Watch for the brief pause that changes the defender's timing.",
      "Notice the direction change into open space.",
      "The sequence ends with a close-range finish.",
    ],
    sourceType: "user_clip",
    sourceLabel: "Observed in the user-provided Kobe GIF; game details not identified",
    sourceUrl: null,
    coverImageUrl: "/images/kobe-drive-frame.jpg",
    sortOrder: 1,
  },
  {
    slug: "michael-jordan-fadeaway",
    athleteName: "Michael Jordan",
    sport: "Basketball",
    era: "Classic",
    team: "Chicago Bulls",
    moveName: "Fadeaway",
    tagline: "Create space and rise away from the contest.",
    explanation:
      "Jordan's fadeaway uses a backward lean during the jump shot to create separation from a defender while keeping the shooting motion balanced. The NBA source presents it as one of his signature moves.",
    cues: [
      "Look for the separation created by the backward drift.",
      "Track how the shooting form stays controlled while moving away.",
      "The release point makes a direct contest more difficult.",
    ],
    sourceType: "official",
    sourceLabel: "NBA Signature Moves: Michael Jordan's fadeaway",
    sourceUrl:
      "https://www.nba.com/watch/video/michael-jordans-signature-move-the-fadeaway",
    coverImageUrl: null,
    sortOrder: 2,
  },
  {
    slug: "allen-iverson-crossover",
    athleteName: "Allen Iverson",
    sport: "Basketball",
    era: "Classic",
    team: "Philadelphia 76ers",
    moveName: "Crossover into pull-up",
    tagline: "Sell one direction, cross, and rise into the shot.",
    explanation:
      "The NBA's 2001 Finals highlight describes Iverson using his trademark crossover before making a jumper over Tyronn Lue. The card focuses on that documented sequence rather than inventing extra details.",
    cues: [
      "Watch how the change of direction shifts the defender's balance.",
      "Follow the crossover directly into the space it creates.",
      "Notice the quick transition from dribble to pull-up jumper.",
    ],
    sourceType: "official",
    sourceLabel: "NBA 2001 Finals moment: Iverson crossover and jumper",
    sourceUrl: "https://www.nba.com/news/history-finals-moments-allen-iverson-crossover-2001",
    coverImageUrl: null,
    sortOrder: 3,
  },
  {
    slug: "stephen-curry-stepback",
    athleteName: "Stephen Curry",
    sport: "Basketball",
    era: "Current",
    team: "Golden State Warriors",
    moveName: "Stepback jumper",
    tagline: "Make room for a fast, balanced release.",
    explanation:
      "The Warriors' player spotlight identifies the stepback jumper as a signature part of Curry's scoring game. A quick backward step creates shooting room after the defender reacts to the drive.",
    cues: [
      "Notice the forward threat that gets the defender moving.",
      "Watch for the backward step that creates the shooting pocket.",
      "The release follows immediately, before the defender can recover.",
    ],
    sourceType: "official",
    sourceLabel: "Golden State Warriors player spotlight: Stephen Curry",
    sourceUrl: "https://www.nba.com/warriors/mocap/spotlight/stephencurry",
    coverImageUrl: null,
    sortOrder: 4,
  },
  {
    slug: "shai-gilgeous-alexander-spin",
    athleteName: "Shai Gilgeous-Alexander",
    sport: "Basketball",
    era: "Current",
    team: "Oklahoma City Thunder",
    moveName: "Spin into a game-winning finish",
    tagline: "Turn the corner and finish through the opening.",
    explanation:
      "The NBA's Horry Scale write-up documents Gilgeous-Alexander spinning and scoring a game-winner over Portland. The card describes that specific reported play, not a claim that every spin move is identical.",
    cues: [
      "Track the spin that takes him around the defender.",
      "Notice how he keeps control while turning toward the basket.",
      "The move finishes with the documented game-winning shot.",
    ],
    sourceType: "official",
    sourceLabel: "NBA Horry Scale: Shai Gilgeous-Alexander's game-winner",
    sourceUrl:
      "https://www.nba.com/news/horry-scale-shai-gilgeous-alexander-spins-and-sinks-game-winner-over-blazers",
    coverImageUrl: null,
    sortOrder: 5,
  },
];

let seedPromise: Promise<void> | undefined;

async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = db
      .insert(moveCardsTable)
      .values(seedMoveCards)
      .onConflictDoNothing({ target: moveCardsTable.slug })
      .then(() => undefined)
      .catch((error: unknown) => {
        seedPromise = undefined;
        throw error;
      });
  }

  await seedPromise;
}

router.get("/move-cards", async (req, res): Promise<void> => {
  await ensureSeeded();
  const cards = await db
    .select()
    .from(moveCardsTable)
    .orderBy(asc(moveCardsTable.sortOrder), asc(moveCardsTable.id));

  req.log.info({ count: cards.length }, "Loaded athlete move cards");
  res.json(ListMoveCardsResponse.parse(cards));
});

router.get("/move-cards/:slug", async (req, res): Promise<void> => {
  const params = GetMoveCardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await ensureSeeded();
  const [card] = await db
    .select()
    .from(moveCardsTable)
    .where(eq(moveCardsTable.slug, params.data.slug));

  if (!card) {
    res.status(404).json({ error: "Move card not found" });
    return;
  }

  res.json(GetMoveCardResponse.parse(card));
});

export default router;
