// Host photo uploads (docs/superpowers/specs/2026-10-22-host-photo-uploads-design.md): a listing stores an uploaded
// photo as the same-origin path the image proxy serves, so next/image needs no extra remote host.
// The backend's checks on them are server only: photo-status.ts.
const PREFIX = "/api/photos/";
export const UPLOADED_PHOTO_PATTERN = /^\/api\/photos\/[0-9a-f]{32}$/;

export const PHOTOS_PROCESSING = "Wait for photos to finish processing";
export const PHOTOS_FAILED = "Remove photos that failed to upload";

export const uploadedPhotoUrl = (id: string): string => `${PREFIX}${id}`;

export function uploadedPhotoId(url: string): string | null {
  return UPLOADED_PHOTO_PATTERN.test(url) ? url.slice(PREFIX.length) : null;
}
