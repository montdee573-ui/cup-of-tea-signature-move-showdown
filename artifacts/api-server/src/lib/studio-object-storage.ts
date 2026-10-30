import { randomUUID } from "node:crypto";
import { Storage, type File } from "@google-cloud/storage";

const sidecar = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${sidecar}/token`,
    type: "external_account",
    credential_source: {
      url: `${sidecar}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function parsePrivatePath(objectPath: string): { bucketName: string; objectName: string } {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR is not configured");
  const segments = `${privateDir}/${objectPath}`.split("/").filter(Boolean);
  const bucketName = segments.shift();
  if (!bucketName || segments.length === 0) throw new Error("Invalid private object path");
  return { bucketName, objectName: segments.join("/") };
}

function privateDirectory(): { bucketName: string; objectPrefix: string } {
  const { bucketName, objectName } = parsePrivatePath("");
  return { bucketName, objectPrefix: objectName.replace(/\/$/, "") };
}

export function reelVideoFile(id: number): File {
  const { bucketName, objectName } = parsePrivatePath(`reel-studio/${id}.mp4`);
  return storage.bucket(bucketName).file(objectName);
}

export function moveSubmissionVideoFile(id: string): File {
  const { bucketName, objectName } = parsePrivatePath(`move-submissions/${id}`);
  return storage.bucket(bucketName).file(objectName);
}

export async function verifyStorageAccess(): Promise<void> {
  const { bucketName, objectPrefix } = privateDirectory();
  const file = storage.bucket(bucketName).file(`${objectPrefix}/reel-studio/.probe-${randomUUID()}`);
  try {
    await file.save(Buffer.from("ok"), {
      resumable: false,
      metadata: { contentType: "text/plain", cacheControl: "no-store" },
    });
  } finally {
    await file.delete({ ignoreNotFound: true });
  }
}

export async function saveReelVideo(id: number, bytes: Buffer): Promise<void> {
  const file = reelVideoFile(id);
  await file.save(bytes, {
    resumable: false,
    metadata: {
      contentType: "video/mp4",
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
}

export async function saveMoveSubmissionVideo(
  id: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const objectPath = `move-submissions/${id}`;
  await moveSubmissionVideoFile(id).save(bytes, {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: "private, no-store, max-age=0",
    },
  });
  return objectPath;
}

export async function deleteMoveSubmissionVideo(id: string): Promise<void> {
  await moveSubmissionVideoFile(id).delete({ ignoreNotFound: true });
}
