---
name: App Storage access checks
description: Replit App Storage service-account permissions and reliable readiness probes.
---

Do not use `bucket.exists()` as the readiness check for generated private media. In this workspace, the API service identity was denied `storage.buckets.get` even after App Storage provisioning, while writing and deleting an object in the configured private directory succeeded.

**Why:** Bucket-level metadata permission is not required for object-level storage operations, so a bucket existence probe can falsely mark a usable bucket unavailable.

**How to apply:** Probe the actual object permissions required by the feature, using a uniquely named temporary object and deleting it afterward. Keep this check server-side and never log storage environment values.
