import { Router, type IRouter } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { ListMerchCatalogResponse } from "@workspace/api-zod";

const router: IRouter = Router();
const connectors = new ReplitConnectors();

type PrintfulProduct = {
  id: number;
  title?: string;
  type?: string;
  variant_count?: number;
  image?: string;
};

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

export default router;
