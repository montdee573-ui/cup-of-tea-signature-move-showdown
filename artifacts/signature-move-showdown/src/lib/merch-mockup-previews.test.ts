import assert from "node:assert/strict";
import { test } from "node:test";
import { groupMerchMockupPreviews } from "./merch-mockup-previews.ts";

test("multi-option previews are grouped and labeled by variant and placement", () => {
  const previews = [
    { title: "Front view", placement: "front", variantIds: [7], imageUrl: "https://images.test/7-front.png" },
    { title: "Front detail", placement: "front", variantIds: [7], imageUrl: "https://images.test/7-front-detail.png" },
    { title: "Back view", placement: "back", variantIds: [7], imageUrl: "https://images.test/7-back.png" },
    { title: "Front view", placement: "front", variantIds: [8], imageUrl: "https://images.test/8-front.png" },
    { title: "Back view", placement: "back", variantIds: [8], imageUrl: "https://images.test/8-back.png" },
  ];

  const groups = groupMerchMockupPreviews(
    previews,
    [
      { id: 7, name: "Black / M" },
      { id: 8, name: "White / L" },
    ],
    [
      { id: "front", title: "Front print" },
      { id: "back", title: "Back print" },
    ],
  );

  assert.deepEqual(groups.map(({ key, title, previews: groupedPreviews }) => ({
    key,
    title,
    previewTitles: groupedPreviews.map(({ title: previewTitle }) => previewTitle),
  })), [
    { key: "7|front", title: "Black / M · Front print", previewTitles: ["Front view", "Front detail"] },
    { key: "7|back", title: "Black / M · Back print", previewTitles: ["Back view"] },
    { key: "8|front", title: "White / L · Front print", previewTitles: ["Front view"] },
    { key: "8|back", title: "White / L · Back print", previewTitles: ["Back view"] },
  ]);
});
