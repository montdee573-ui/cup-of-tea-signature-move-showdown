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
  const [variantId, setVariantId] = useState("");
  const [placement, setPlacement] = useState("");
  const [artworkUrl, setArtworkUrl] = useState("");
  const [variantSearch, setVariantSearch] = useState("");
  const [taskKey, setTaskKey] = useState("");
  const productDetails = useGetMerchProductDetails(Number(productId), {
    query: {
      queryKey: getGetMerchProductDetailsQueryKey(Number(productId)),
      enabled: Boolean(productId),
      retry: false,
      refetchOnMount: "always",
    },
  });
  const startMockup = useCreateMerchMockup();
  const mockupTask = useGetMerchMockupTask(taskKey, {
    query: {
      queryKey: getGetMerchMockupTaskQueryKey(taskKey),
      enabled: Boolean(taskKey),
      retry: false,
      refetchInterval: (query) => query.state.data?.status === "pending" ? 2500 : false,
    },
  });

  useEffect(() => {
    setVariantId("");
    setPlacement("");
    setTaskKey("");
  }, [productId]);

  useEffect(() => {
    if (productDetails.data && !variantId) {
      const firstVariant = productDetails.data.variants[0];
      if (firstVariant) setVariantId(String(firstVariant.id));
    }
  }, [productDetails.data, variantId]);

  useEffect(() => {
    if (productDetails.data && !placement) {
      const firstPlacement = productDetails.data.placements[0];
      if (firstPlacement) setPlacement(firstPlacement.id);
    }
  }, [productDetails.data, placement]);

  const visibleVariants = useMemo(() => {
    const needle = variantSearch.trim().toLowerCase();
    return (productDetails.data?.variants ?? []).filter((variant) =>
      !needle || variant.name.toLowerCase().includes(needle));
  }, [productDetails.data, variantSearch]);

  const generate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!productId || !variantId || !placement) return;
    setTaskKey("");
    startMockup.mutate({
      id: Number(productId),
      data: {
        variantId: Number(variantId),
        placement,
        artworkUrl: artworkUrl.trim(),
      },
    }, {
      onSuccess: (result) => setTaskKey(result.taskKey),
    });
  };

  return <section className="merch-studio" aria-labelledby="merch-studio-title">
    <div className="merch-studio-head">
      <div><span className="launch-label"><Shirt size={13} /> PRIVATE MERCH PREVIEW</span><h2 id="merch-studio-title">Mock up an approved design.</h2></div>
      <span className="merch-studio-lock"><LockKeyhole size={13} /> OWNER ONLY</span>
    </div>
    <p className="merch-studio-intro">Choose a Printful catalog item, size/color, and print area, then attach its approved artwork using a public HTTPS image URL that Printful can retrieve.</p>
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
              <label>Variant
                <select value={variantId} onChange={(event) => setVariantId(event.target.value)} required>
                  <option value="">Select a size and color</option>
                  {visibleVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}
                </select>
              </label>
              <label>Print placement
                <select value={placement} onChange={(event) => setPlacement(event.target.value)} required>
                  <option value="">Select a print area</option>
                  {productDetails.data.placements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
              </label>
            </>}
      </>}
      <label>Approved print-ready artwork URL
        <input type="url" inputMode="url" required maxLength={2048} value={artworkUrl} onChange={(event) => setArtworkUrl(event.target.value)} placeholder="https://example.com/card-art.png" />
      </label>
      <button className="merch-studio-generate" type="submit" disabled={!productId || !variantId || !placement || !artworkUrl.trim() || startMockup.isPending}>
        {startMockup.isPending ? <><LoaderCircle size={15} className="spin-icon" /> Starting private preview…</> : <><Images size={15} /> Generate private mockup</>}
      </button>
    </form>
    {startMockup.isError && <p className="merch-studio-error" role="alert"><CircleAlert size={15} /> {messageOf(startMockup.error, "The mockup request could not be started.")}</p>}
    {taskKey && <div className="merch-studio-result" aria-live="polite">
      {mockupTask.isLoading || mockupTask.data?.status === "pending"
        ? <p className="merch-studio-status"><LoaderCircle size={15} className="spin-icon" /> Printful is preparing the mockup…</p>
        : mockupTask.isError
          ? <p className="merch-studio-error" role="alert"><CircleAlert size={15} /> {messageOf(mockupTask.error, "The mockup status could not be checked.")}</p>
          : mockupTask.data?.status === "failed"
            ? <p className="merch-studio-error" role="alert"><CircleAlert size={15} /> {mockupTask.data.error || "Printful could not generate this mockup."}</p>
            : mockupTask.data?.status === "completed" && mockupTask.data.mockups.length
              ? <div className="merch-studio-previews">{mockupTask.data.mockups.map((preview, index) => <figure key={`${preview.imageUrl}-${index}`}>
                <img src={preview.imageUrl} alt={`${preview.title} private product mockup`} loading="lazy" />
                <figcaption>{preview.title} · {preview.placement}</figcaption>
              </figure>)}</div>
              : mockupTask.data?.status === "completed"
                ? <p className="merch-studio-status">The task completed, but Printful returned no preview images.</p>
                : null}
    </div>}
    <p className="merch-studio-safety"><LockKeyhole size={14} /> Only the signed-in owner can start or view these previews. This creates no Printful product, sync product, order, checkout, or sale.</p>
  </section>;
}
