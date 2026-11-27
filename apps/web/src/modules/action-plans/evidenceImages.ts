import {
  loadNativeThumbnail, loadOriginalImage, originalImageKey, storageThumbnailKey,
} from "../../core/auth/evidenceImages";
import { fetchPrivateObject } from "../../core/auth/privateStorage";
import { privateImages } from "../../shared/privateImageCache";
import type { Evidence } from "./types";

export const BUCKET = "action-plan-evidence";
const imagePrefix = (planId: string) => `action-plan:${planId}:`;
const originalKey = (e: Evidence) => originalImageKey(imagePrefix(e.plan_id), e, true);
const thumbnailKey = (e: Evidence) => storageThumbnailKey(imagePrefix(e.plan_id), e, true);

export function planEvidenceImage(e: Evidence, expanded: boolean) {
  const cacheKey = expanded ? originalKey(e) : thumbnailKey(e);
  return {
    cacheKey,
    thumbnail: !expanded,
    load: () => expanded
      ? loadOriginalImage(cacheKey, e, signal => fetchPrivateObject(BUCKET, e.object_key, signal))
      : loadNativeThumbnail(cacheKey, e, (signal, transform) => fetchPrivateObject(BUCKET, e.object_key, signal, transform)),
  };
}

export function reconcilePlanEvidenceImages(planId: string, rows: Evidence[]) {
  privateImages.reconcile(imagePrefix(planId), new Set(rows.flatMap(e => [originalKey(e), thumbnailKey(e)])));
}
