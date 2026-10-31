import { Router, type IRouter } from "express";
import { isIP } from "node:net";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  CreateMerchMockupBody,
  CreateMerchMockupResponse,
  GetMerchMockupTaskParams,
  GetMerchMockupTaskResponse,
  GetMerchProductDetailsParams,
  GetMerchProductDetailsResponse,
  ListMerchCatalogResponse,
} from "@workspace/api-zod";
import { isStudioOwner } from "./studio";

const router: IRouter = Router();
const connectors = new ReplitConnectors();

type PrintfulProduct = {
  id: number;
  title?: string;
  type?: string;
  variant_count?: number;
  image?: string;
};

type PrintfulVariant = {
  id?: number;
  name?: string;
  color?: string;
  size?: string;
};

type PrintfulTaskPreview = {
  placement?: string;
  display_name?: string;
  variant_ids?: number[];
  mockup_url?: string;
  url?: string;
  extra?: Array<{ title?: string; url?: string }>;
};

function positiveId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function safePublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !hostname.endsWith(".localhost")
      && !hostname.endsWith(".local")
      && hostname !== "localhost"
      && isIP(hostname) === 0;
  } catch {
    return false;
  }
}

async function readPrintfulProduct(productId: number): Promise<{
  product?: { id?: number; title?: string };
  variants?: PrintfulVariant[];
} | null> {
  const response = await connectors.proxy("printful", `/products/${productId}`, { method: "GET" });
  const payload = await response.json() as { result?: { product?: { id?: number; title?: string }; variants?: PrintfulVariant[] } };
  if (response.status === 404) return null;
  if (!response.ok || payload.result?.product?.id !== productId) {
    throw new Error("Printful product details are unavailable.");
  }
  return payload.result;
}

async function readPrintfulPlacements(productId: number): Promise<Record<string, string>> {
  const response = await connectors.proxy("printful", `/mockup-generator/printfiles/${productId}`, { method: "GET" });
  const payload = await response.json() as { result?: { available_placements?: Record<string, string> } };
  if (!response.ok || !payload.result?.available_placements) {
    throw new Error("Printful print placements are unavailable.");
  }
  return payload.result.available_placements;
}

router.get("/merch/catalog", async (req, res): Promise<void> => {
  try {
    const response = await connectors.proxy("printful", "/products", { method: "GET" });
    const payload = await response.json() as { result?: PrintfulProduct[] };
    if (!response.ok || !Array.isArray(payload.result)) {
      req.log.warn({ status: response.status }, "Printful catalog request failed");
      res.status(502).json({ error: "Printful catalog is temporarily unavailable." });
      return;
    }

    const items = payload.result
      .filter((product) => Number.isInteger(product.id) && typeof product.title === "string")
      .map((product) => ({
        id: product.id,
        title: product.title as string,
        type: product.type ?? null,
        variantCount: Number.isInteger(product.variant_count) ? product.variant_count as number : 0,
        imageUrl: product.image ?? null,
      }));

    res.json(ListMerchCatalogResponse.parse(items));
  } catch (error) {
    req.log.error({ error }, "Could not read Printful catalog");
    res.status(502).json({ error: "Printful catalog is temporarily unavailable." });
  }
});

router.get("/merch/catalog/:id/details", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Sign in as the studio owner to prepare private mockups." });
    return;
  }
  const params = GetMerchProductDetailsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Choose a valid catalog product." });
    return;
  }

  try {
    const [productResult, placements] = await Promise.all([
      readPrintfulProduct(params.data.id),
      readPrintfulPlacements(params.data.id),
    ]);
    if (!productResult?.product) {
      res.status(404).json({ error: "That catalog product was not found." });
      return;
    }
    const variants = (productResult.variants ?? [])
      .filter((variant) => Number.isSafeInteger(variant.id) && typeof variant.name === "string")
      .map((variant) => ({
        id: variant.id as number,
        name: variant.name as string,
        color: variant.color ?? null,
        size: variant.size ?? null,
      }));
    const response = {
      productId: params.data.id,
      title: productResult.product.title ?? `Catalog item ${params.data.id}`,
      variants,
      placements: Object.entries(placements).map(([id, title]) => ({ id, title })),
    };
    res.json(GetMerchProductDetailsResponse.parse(response));
  } catch (error) {
    req.log.error({ error, productId: params.data.id }, "Could not read Printful mockup options");
    res.status(502).json({ error: "Printful product options are temporarily unavailable." });
  }
});

router.post("/merch/catalog/:id/mockups", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Sign in as the studio owner to generate private mockups." });
    return;
  }
  const params = GetMerchProductDetailsParams.safeParse(req.params);
  const parsed = CreateMerchMockupBody.safeParse(req.body);
  if (!params.success || !parsed.success || !safePublicHttpsUrl(parsed.data.artworkUrl)) {
    res.status(400).json({ error: "Choose valid product variants, print placements, and a public HTTPS artwork URL." });
    return;
  }

  try {
    const [productResult, placements] = await Promise.all([
      readPrintfulProduct(params.data.id),
      readPrintfulPlacements(params.data.id),
    ]);
    if (!productResult?.product) {
      res.status(404).json({ error: "That catalog product was not found." });
      return;
    }
    const availableVariantIds = new Set(
      (productResult.variants ?? [])
        .map((variant) => variant.id)
        .filter((id): id is number => Number.isSafeInteger(id)),
    );
    if (new Set(parsed.data.variantIds).size !== parsed.data.variantIds.length
      || new Set(parsed.data.placements).size !== parsed.data.placements.length
      || parsed.data.variantIds.some((variantId) => !availableVariantIds.has(variantId))
      || parsed.data.placements.some((placement) => !Object.hasOwn(placements, placement))
      || parsed.data.variantIds.length * parsed.data.placements.length > 40) {
      res.status(400).json({ error: "Those variants or print placements are unavailable for this catalog product, or the comparison exceeds 40 combinations." });
      return;
    }

    const response = await connectors.proxy(
      "printful",
      `/mockup-generator/create-task/${params.data.id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant_ids: parsed.data.variantIds,
          files: parsed.data.placements.map((placement) => ({
            placement,
            image_url: parsed.data.artworkUrl,
          })),
          format: "png",
          width: 1200,
        }),
      },
    );
    const payload = await response.json() as { result?: { task_key?: string; status?: string }; error?: { message?: string } };
    if (!response.ok || !payload.result?.task_key) {
      req.log.warn({ status: response.status }, "Printful mockup task could not be created");
      res.status(502).json({
        error: response.status === 403
          ? "Printful denied mockup generation. Confirm the connected account can use the Mockup Generator API."
          : payload.error?.message || "Printful could not start mockup generation.",
      });
      return;
    }
    res.json(CreateMerchMockupResponse.parse({
      taskKey: payload.result.task_key,
      status: payload.result.status ?? "pending",
      productId: params.data.id,
      variantIds: parsed.data.variantIds,
      placements: parsed.data.placements,
    }));
  } catch (error) {
    req.log.error({ error, productId: params.data.id }, "Could not create Printful mockup");
    res.status(502).json({ error: "Printful could not start mockup generation." });
  }
});

router.get("/merch/mockups/:taskKey", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Sign in as the studio owner to view private mockups." });
    return;
  }
  const params = GetMerchMockupTaskParams.safeParse(req.params);
  if (!params.success || !/^[A-Za-z0-9_-]{1,100}$/.test(params.data.taskKey)) {
    res.status(400).json({ error: "The mockup task identifier is invalid." });
    return;
  }

  try {
    const response = await connectors.proxy(
      "printful",
      `/mockup-generator/task?task_key=${encodeURIComponent(params.data.taskKey)}`,
      { method: "GET" },
    );
    const payload = await response.json() as {
      result?: { status?: string; error?: string; mockups?: PrintfulTaskPreview[] };
    };
    if (!response.ok || !payload.result?.status) {
      req.log.warn({ status: response.status }, "Printful mockup task could not be retrieved");
      res.status(502).json({ error: "Printful could not read the mockup task." });
      return;
    }
    const mockups = (payload.result.mockups ?? []).flatMap((mockup) => {
      const previews: Array<{ title: string; placement: string; variantIds: number[]; imageUrl: string }> = [];
      const baseUrl = mockup.mockup_url ?? mockup.url;
      if (typeof baseUrl === "string" && safePublicHttpsUrl(baseUrl)) {
        previews.push({
          title: mockup.display_name ?? mockup.placement ?? "Product mockup",
          placement: mockup.placement ?? "print",
          variantIds: mockup.variant_ids ?? [],
          imageUrl: baseUrl,
        });
      }
      for (const extra of mockup.extra ?? []) {
        if (typeof extra.url === "string" && safePublicHttpsUrl(extra.url)) {
          previews.push({
            title: extra.title ?? "Additional mockup",
            placement: mockup.placement ?? "print",
            variantIds: mockup.variant_ids ?? [],
            imageUrl: extra.url,
          });
        }
      }
      return previews;
    });
    res.json(GetMerchMockupTaskResponse.parse({
      taskKey: params.data.taskKey,
      status: payload.result.status,
      error: payload.result.error ?? null,
      mockups,
    }));
  } catch (error) {
    req.log.error({ error }, "Could not read Printful mockup task");
    res.status(502).json({ error: "Printful could not read the mockup task." });
  }
});

export default router;
