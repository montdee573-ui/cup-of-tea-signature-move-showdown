import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CircleAlert, Images, LoaderCircle, LockKeyhole, Shirt } from "lucide-react";
import {
  getGetMerchMockupTaskQueryKey,
  getGetMerchProductDetailsQueryKey,
  useCreateMerchMockup,
  useGetMerchMockupTask,
  useGetMerchProductDetails,
  useListMerchCatalog,
} from "@workspace/api-client-react";

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function MerchMockupStudio() {
  const catalog = useListMerchCatalog();
  const [productId, setProductId] = useState("");
  const [variantIds, setVariantIds] = useState<string[]>([]);
  const [placementIds, setPlacementIds] = useState<string[]>([]);
  const [artworkUrl, setArtworkUrl] = useState("");
  const [variantSearch, setVariantSearch] = useState("");
  const [batch, setBatch] = useState<{
    taskKey: string;
    productTitle: string;
    variants: Array<{ id: number; name: string }>;
    placements: Array<{ id: string; title: string }>;
  } | null>(null);
  const productDetails = useGetMerchProductDetails(Number(productId), {
    query: {
      queryKey: getGetMerchProductDetailsQueryKey(Number(productId)),
      enabled: Boolean(productId),
      retry: false,
      refetchOnMount: "always",
    },
  });
  const startMockup = useCreateMerchMockup();
  const mockupTask = useGetMerchMockupTask(batch?.taskKey ?? "", {
    query: {
      queryKey: getGetMerchMockupTaskQueryKey(batch?.taskKey ?? ""),
      enabled: Boolean(batch?.taskKey),
      retry: false,
      refetchInterval: (query) => query.state.data?.status === "pending" ? 2500 : false,
    },
  });

  useEffect(() => {
    setVariantIds([]);
    setPlacementIds([]);
  }, [productId]);

  useEffect(() => {
    if (productDetails.data && !variantIds.length) {
      const firstVariant = productDetails.data.variants[0];
      if (firstVariant) setVariantIds([String(firstVariant.id)]);
    }
  }, [productDetails.data, variantIds.length]);

  useEffect(() => {
    if (productDetails.data && !placementIds.length) {
      const firstPlacement = productDetails.data.placements[0];
      if (firstPlacement) setPlacementIds([firstPlacement.id]);
    }
  }, [productDetails.data, placementIds.length]);

  const visibleVariants = useMemo(() => {
    const needle = variantSearch.trim().toLowerCase();
    return (productDetails.data?.variants ?? []).filter((variant) =>
      !needle || variant.name.toLowerCase().includes(needle));
  }, [productDetails.data, variantSearch]);

  const combinationCount = variantIds.length * placementIds.length;

  const toggleVariant = (id: string) => {
    setVariantIds((selected) => {
      if (selected.includes(id)) return selected.filter((value) => value !== id);
      if ((selected.length + 1) * Math.max(placementIds.length, 1) > 40) return selected;
      return [...selected, id];
    });
  };

  const togglePlacement = (id: string) => {
    setPlacementIds((selected) => {
      if (selected.includes(id)) return selected.filter((value) => value !== id);
      if (Math.max(variantIds.length, 1) * (selected.length + 1) > 40) return selected;
      return [...selected, id];
    });
  };

  const generate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!productId || !variantIds.length || !placementIds.length || combinationCount > 40) return;
    const selectedProduct = catalog.data?.find((item) => item.id === Number(productId));
    const selectedVariants = (productDetails.data?.variants ?? [])
      .filter((variant) => variantIds.includes(String(variant.id)))
      .map(({ id, name }) => ({ id, name }));
    const selectedPlacements = (productDetails.data?.placements ?? [])
      .filter((item) => placementIds.includes(item.id));
    startMockup.mutate({
      id: Number(productId),
      data: {
        variantIds: variantIds.map(Number),
        placements: placementIds,
        artworkUrl: artworkUrl.trim(),
      },
    }, {
      onSuccess: (result) => setBatch({
        taskKey: result.taskKey,
        productTitle: selectedProduct?.title ?? `Catalog item ${result.productId}`,
        variants: selectedVariants,
        placements: selectedPlacements,
      }),
    });
  };

  const previewGroups = useMemo(() => {
    if (!batch || !mockupTask.data?.mockups.length) return [];
    const groups = new Map<string, {
      title: string;
      previews: typeof mockupTask.data.mockups;
    }>();
    for (const preview of mockupTask.data.mockups) {
      const variantLabels = preview.variantIds.map((id) =>
        batch.variants.find((variant) => variant.id === id)?.name ?? `Variant #${id}`);
      const placementLabel = batch.placements.find((item) => item.id === preview.placement)?.title
        ?? preview.placement;
      const title = `${variantLabels.join(", ") || "Selected variants"} · ${placementLabel}`;
      const key = `${preview.variantIds.join(",")}|${preview.placement}`;
      const group = groups.get(key) ?? { title, previews: [] };
      group.previews.push(preview);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [batch, mockupTask.data?.mockups]);

  return <section className="merch-studio" aria-labelledby="merch-studio-title">
    <div className="merch-studio-head">
      <div><span className="launch-label"><Shirt size={13} /> PRIVATE MERCH PREVIEW</span><h2 id="merch-studio-title">Mock up an approved design.</h2></div>
      <span className="merch-studio-lock"><LockKeyhole size={13} /> OWNER ONLY</span>
    </div>
    <p className="merch-studio-intro">Choose a Printful catalog item, then compare several sizes/colors and print areas using approved artwork at a public HTTPS image URL Printful can retrieve.</p>
    <p className="merch-studio-permissions">Permission check: this connection can read catalog print areas. Printful product templates require Account-level access plus <code>product_templates/read</code> to view them or <code>product_templates</code> to manage them; neither scope is currently granted. Catalog-based mockups here do not need a saved product template.</p>
    <form className="merch-studio-form" onSubmit={generate}>
      <label>Catalog item
        <select value={productId} onChange={(event) => setProductId(event.target.value)} required disabled={catalog.isLoading || catalog.isError}>
          <option value="">Select a product</option>
          {(catalog.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
      {catalog.isLoading && <p className="merch-studio-status">Loading the Printful catalog…</p>}
      {catalog.isError && <p className="merch-studio-error" role="alert"><CircleAlert size={15} /> {messageOf(catalog.error, "Printful catalog is temporarily unavailable.")}</p>}
      {productId && <>
        {productDetails.isLoading ? <p className="merch-studio-status">Loading sizes, colors, and print areas…</p> :
          productDetails.isError ? <p className="merch-studio-error" role="alert"><CircleAlert size={15} /> {messageOf(productDetails.error, "Printful product details are unavailable.")}</p> :
            productDetails.data && <>
              <label>Search sizes and colors
                <input value={variantSearch} onChange={(event) => setVariantSearch(event.target.value)} placeholder="For example, Black / Large" />
              </label>
              <fieldset className="merch-studio-options">
                <legend>Sizes and colors</legend>
                <div className="merch-studio-checkbox-list">
                  {visibleVariants.map((variant) => {
                    const selected = variantIds.includes(String(variant.id));
                    const wouldExceedLimit = !selected
                      && (variantIds.length + 1) * Math.max(placementIds.length, 1) > 40;
                    return <label key={variant.id}>
                      <input type="checkbox" checked={selected} disabled={wouldExceedLimit}
                        onChange={() => toggleVariant(String(variant.id))} />
                      <span>{variant.name}</span>
                    </label>;
                  })}
                  {!visibleVariants.length && <p className="merch-studio-status">No sizes or colors match this search.</p>}
                </div>
              </fieldset>
              <fieldset className="merch-studio-options">
                <legend>Print areas</legend>
                <div className="merch-studio-checkbox-list">
                  {productDetails.data.placements.map((item) => {
                    const selected = placementIds.includes(item.id);
                    const wouldExceedLimit = !selected
                      && Math.max(variantIds.length, 1) * (placementIds.length + 1) > 40;
                    return <label key={item.id}>
                      <input type="checkbox" checked={selected} disabled={wouldExceedLimit}
                        onChange={() => togglePlacement(item.id)} />
                      <span>{item.title}</span>
                    </label>;
                  })}
                </div>
              </fieldset>
              <p className="merch-studio-selection" aria-live="polite">
                {variantIds.length} size/color option{variantIds.length === 1 ? "" : "s"} × {placementIds.length} print area{placementIds.length === 1 ? "" : "s"} · {combinationCount} comparisons (maximum 40)
              </p>
            </>}
      </>}
      <label>Approved print-ready artwork URL
        <input type="url" inputMode="url" required maxLength={2048} value={artworkUrl} onChange={(event) => setArtworkUrl(event.target.value)} placeholder="https://example.com/card-art.png" />
      </label>
      <button className="merch-studio-generate" type="submit" disabled={!productId || !variantIds.length || !placementIds.length || !artworkUrl.trim() || combinationCount > 40 || startMockup.isPending}>
        {startMockup.isPending ? <><LoaderCircle size={15} className="spin-icon" /> Starting private preview…</> : <><Images size={15} /> Generate private mockup</>}
      </button>
    </form>
    {startMockup.isError && <p className="merch-studio-error" role="alert"><CircleAlert size={15} /> {messageOf(startMockup.error, "The mockup request could not be started.")}</p>}
    {batch && <div className="merch-studio-result" aria-live="polite">
      {mockupTask.isLoading || mockupTask.data?.status === "pending"
        ? <p className="merch-studio-status"><LoaderCircle size={15} className="spin-icon" /> Printful is preparing {batch.variants.length * batch.placements.length} private comparisons for {batch.productTitle}…</p>
        : mockupTask.isError
          ? <p className="merch-studio-error" role="alert"><CircleAlert size={15} /> {messageOf(mockupTask.error, "The mockup status could not be checked.")}</p>
          : mockupTask.data?.status === "failed"
            ? <p className="merch-studio-error" role="alert"><CircleAlert size={15} /> {mockupTask.data.error || "Printful could not generate this mockup."}</p>
            : mockupTask.data?.status === "completed" && mockupTask.data.mockups.length
              ? <div className="merch-studio-comparison">
                <h3>{batch.productTitle} comparison</h3>
                {previewGroups.map((group) => <section className="merch-studio-preview-group" key={group.title}>
                  <h4>{group.title}</h4>
                  <div className="merch-studio-previews">{group.previews.map((preview, index) => <figure key={`${preview.imageUrl}-${index}`}>
                    <img src={preview.imageUrl} alt={`${group.title} private product mockup`} loading="lazy" />
                    <figcaption>{preview.title}</figcaption>
                  </figure>)}</div>
                </section>)}
              </div>
              : mockupTask.data?.status === "completed"
                ? <p className="merch-studio-status">The task completed, but Printful returned no preview images.</p>
                : null}
    </div>}
    <p className="merch-studio-safety"><LockKeyhole size={14} /> Only the signed-in owner can start or view these previews. This creates no Printful product, sync product, order, checkout, or sale.</p>
  </section>;
}
