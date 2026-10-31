---
name: API app integration test bundles
description: Constraints when bundling the full API app into a route integration test.
---

When an API integration test imports the full app, its bundler traverses every mounted router even if the test only calls one endpoint. The test database adapter must therefore export the real schema table bindings referenced by all mounted routes, while keeping database operations routed through the test double.

**Why:** A route-only test bundle may succeed with a partial database adapter, but switching the entry point to the public app causes bundling to fail on unrelated routers' missing exports.

**How to apply:** Before bundling an app-level API test, compare database imports across the mounted router graph with the test adapter's exports. Also load the app with a logger configuration compatible with the test bundle so its worker dependencies do not outlive the test.
