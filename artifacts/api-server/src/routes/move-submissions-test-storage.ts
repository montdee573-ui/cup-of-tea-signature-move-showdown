import { Readable } from "node:stream";

let saveCalls = 0;
const savedReferenceClips = new Map<string, { bytes: Buffer; contentType: string }>();

export function resetMoveSubmissionStorageState(): void {
  saveCalls = 0;
  savedReferenceClips.clear();
}

export function moveSubmissionStorageState() {
  return { saveCalls };
}

export async function saveMoveSubmissionVideo(): Promise<string> {
  saveCalls += 1;
  return "private/test-video";
}

export async function deleteMoveSubmissionVideo(): Promise<void> {}

export function moveSubmissionVideoFile(): never {
  throw new Error("Unexpected private video access in move-submission validation tests.");
}

export function reelVideoFile(): never {
  throw new Error("Unexpected reel video access in move-submission validation tests.");
}

export async function saveReelVideo(): Promise<never> {
  throw new Error("Unexpected reel video write in move-submission validation tests.");
}

export async function verifyStorageAccess(): Promise<void> {}

export async function saveStudioReferenceClip(objectPath: string, bytes: Buffer, contentType: string): Promise<void> {
  savedReferenceClips.set(objectPath, { bytes: Buffer.from(bytes), contentType });
}

export async function deleteStudioReferenceClip(objectPath: string): Promise<void> {
  savedReferenceClips.delete(objectPath);
}

export function studioReferenceClipFile(objectPath: string) {
  const stored = savedReferenceClips.get(objectPath);
  if (!stored) throw new Error("Reference clip not found.");
  return {
    createReadStream: (range?: { start: number; end: number }) => Readable.from(
      range ? [stored.bytes.subarray(range.start, range.end + 1)] : [stored.bytes],
    ),
    download: async () => [Buffer.from(stored.bytes)],
  };
}
