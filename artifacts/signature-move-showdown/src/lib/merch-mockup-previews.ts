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
