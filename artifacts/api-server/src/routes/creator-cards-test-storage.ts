import { Readable } from "node:stream";

let videoBytes = Buffer.alloc(0);
let missing = false;
let metadataReads = 0;
let streamRanges: Array<{ start?: number; end?: number }> = [];

export function resetCreatorMotionVideo(bytes: Buffer, isMissing = false): void {
  videoBytes = Buffer.from(bytes);
  missing = isMissing;
  metadataReads = 0;
  streamRanges = [];
}

export function creatorMotionVideoState() {
  return { metadataReads, streamRanges: [...streamRanges] };
}

export function reelVideoFile(): never {
  throw new Error("Unexpected legacy reel storage access in creator-card tests.");
}

export async function saveReelVideo(): Promise<never> {
  throw new Error("Unexpected legacy reel storage write in creator-card tests.");
}

export async function verifyStorageAccess(): Promise<void> {}

export async function saveStudioReferenceClip(): Promise<void> {
  throw new Error("Unexpected reference clip storage write in creator-card tests.");
}

export async function deleteStudioReferenceClip(): Promise<void> {}

export function studioReferenceClipFile(): never {
  throw new Error("Unexpected reference clip storage access in creator-card tests.");
}

export function creatorMotionVideoFile(_id: string) {
  return {
    async getMetadata(): Promise<[{ size: number }]> {
      metadataReads += 1;
      if (missing) throw Object.assign(new Error("Not found"), { code: 404 });
      return [{ size: videoBytes.length }];
    },
    createReadStream(range?: { start?: number; end?: number }) {
      streamRanges.push({ ...(range ?? {}) });
      const start = range?.start ?? 0;
      const end = range?.end ?? videoBytes.length - 1;
      return Readable.from([videoBytes.subarray(start, end + 1)]);
    },
  };
}
