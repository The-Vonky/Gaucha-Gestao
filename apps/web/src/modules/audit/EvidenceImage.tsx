import { identityEnabled } from "../../core/auth/identity";
import { EvidenceImageSlot } from "../../shared/EvidenceImage";
import {
  AUDIT_STORAGE_TRANSFORMS, AUDIT_THUMBNAILS_ENABLED, imageKey, thumbnailKey,
  loadStorageThumbnail, loadEvidenceThumbnail, loadEvidenceImage, evidenceThumbnailState, type ImageEvidence,
} from "./evidenceImages";

export function EvidenceImage({ row, name, expanded = false, authenticated: linked = false, onOpenOriginal }: {
  row: ImageEvidence;
  name: string;
  expanded?: boolean;
  authenticated?: boolean;
  onOpenOriginal?: () => void;
}) {
  const authenticated = identityEnabled || linked;
  const native = AUDIT_STORAGE_TRANSFORMS || linked;
  const thumbnail = (native || AUDIT_THUMBNAILS_ENABLED) && !expanded;
  return <EvidenceImageSlot name={name} expanded={expanded} thumbnail={thumbnail}
    cacheKey={thumbnail ? thumbnailKey(row, authenticated, native) : imageKey(row, authenticated)}
    load={() => !thumbnail ? loadEvidenceImage(row, authenticated)
      : native ? loadStorageThumbnail(row, authenticated) : loadEvidenceThumbnail(row)}
    prepare={thumbnail && !native ? () => evidenceThumbnailState(row.id) : undefined}
    onOpenOriginal={onOpenOriginal} />;
}
