export type MerchMockupPreview = {
  title: string;
  placement: string;
  variantIds: number[];
  imageUrl: string;
};

export type MerchMockupPreviewGroup = {
  key: string;
  title: string;
  previews: MerchMockupPreview[];
};

function filenamePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function getMerchMockupDownloadFilename(
  preview: MerchMockupPreview,
  variants: Array<{ id: number; name: string }>,
  placements: Array<{ id: string; title: string }>,
): string {
  const variantLabel = preview.variantIds
    .map((id) => variants.find((variant) => variant.id === id)?.name ?? `Variant ${id}`)
    .map(filenamePart)
    .filter(Boolean)
    .join("-");
  const placementLabel = filenamePart(
    placements.find((item) => item.id === preview.placement)?.title ?? preview.placement,
  );
  const titleLabel = filenamePart(preview.title);
  let extension = ".jpg";
  try {
    const path = new URL(preview.imageUrl).pathname.toLowerCase();
    const imageExtension = path.match(/\.(png|jpe?g|webp)$/)?.[0];
    if (imageExtension) extension = imageExtension;
  } catch {
    // The filename still has useful labels if a provider URL is malformed.
  }

  return [
    variantLabel || "variant",
    placementLabel || "print-area",
    titleLabel || "mockup",
  ].join("-") + extension;
}

export function groupMerchMockupPreviews(
  previews: MerchMockupPreview[],
  variants: Array<{ id: number; name: string }>,
  placements: Array<{ id: string; title: string }>,
): MerchMockupPreviewGroup[] {
  const groups = new Map<string, MerchMockupPreviewGroup>();
  for (const preview of previews) {
    const variantLabels = preview.variantIds.map((id) =>
      variants.find((variant) => variant.id === id)?.name ?? `Variant #${id}`);
    const placementLabel = placements.find((item) => item.id === preview.placement)?.title
      ?? preview.placement;
    const key = `${preview.variantIds.join(",")}|${preview.placement}`;
    const group = groups.get(key) ?? {
      key,
      title: `${variantLabels.join(", ") || "Selected variants"} · ${placementLabel}`,
      previews: [],
    };
    group.previews.push(preview);
    groups.set(key, group);
  }
  return [...groups.values()];
}
