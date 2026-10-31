---
name: POD merchandising scope
description: Product boundary for print-on-demand preparation.
---

Prepare optional merchandise associations and print-on-demand fulfillment connections, but do not activate payments, product sales, or checkout yet. Competition entry, eligibility, votes, rankings, and winners must remain free and independent of purchases.

**Why:** the user set merchandise as Phase 2 and explicitly required purchases not to affect free competition.

**How to apply:** keep merchandise features in planning/mockup mode until the user explicitly approves product creation or sales; never use purchase status to gate or influence competition.

Printful product-template access is separate from catalog mockups: reading templates requires an Account-level token with `product_templates/read`, and managing templates requires `product_templates`. The catalog mockup flow can use catalog product IDs directly, without synced products or saved templates.

**Why:** avoid requiring broad Account-level template access just to preview art on a catalog item; the project is not ready to publish products.

**How to apply:** use the catalog and Mockup Generator APIs for private previews. Only use Product Templates if the product workflow explicitly needs reusable templates and the connected token has the appropriate Account-level permission.
