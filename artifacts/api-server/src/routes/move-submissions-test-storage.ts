let saveCalls = 0;

export function resetMoveSubmissionStorageState(): void {
  saveCalls = 0;
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
