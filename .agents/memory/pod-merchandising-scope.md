---
name: POD merchandising scope
description: Product boundary for print-on-demand preparation.
---

The owner subsequently authorized completing the existing Printful integration and checkout development. This supersedes the earlier planning-only restriction, not the separate approval needed for live products, prices, checkout charges and fulfillment. Competition entry, eligibility, votes, rankings, and winners remain free and independent of purchases.

**Why:** the user set merchandise as Phase 2 and explicitly required purchases not to affect free competition.

**How to apply:** reuse Printful and develop checkout where approved configuration permits; do not enable real purchases or fulfillment before product/payment terms are confirmed. Never use purchases to influence competition.

Printful product-template access is separate from catalog mockups: reading templates requires an Account-level token with `product_templates/read`, and managing templates requires `product_templates`. The catalog mockup flow can use catalog product IDs directly, without synced products or saved templates.

**Why:** avoid requiring broad Account-level template access just to preview art on a catalog item; the project is not ready to publish products.

**How to apply:** use the catalog and Mockup Generator APIs for private previews. Only use Product Templates if the product workflow explicitly needs reusable templates and the connected token has the appropriate Account-level permission.
