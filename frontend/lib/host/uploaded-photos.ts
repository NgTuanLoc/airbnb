import { z } from "zod";
import { envelopeSchema } from "@/lib/api-client/schemas";
import { dataSource } from "@/lib/data-source";

// Host photo uploads (docs/superpowers/specs/2026-10-22-host-photo-uploads-design.md): a listing stores an uploaded
// photo as the same-origin path the image proxy serves, so next/image needs no extra remote host.
const PREFIX = "/api/photos/";
export const UPLOADED_PHOTO_PATTERN = /^\/api\/photos\/[0-9a-f]{32}$/;

export const PHOTOS_PROCESSING = "Wait for photos to finish processing";
export const PHOTOS_FAILED = "Remove photos that failed to upload";

const STATUS_TIMEOUT_MS = 5_000;

export const photoStatusSchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "ready", "rejected"]),
  reason: z.string().optional(),
});

export type PhotoStatus = z.infer<typeof photoStatusSchema>;

export const uploadedPhotoUrl = (id: string): string => `${PREFIX}${id}`;

export function uploadedPhotoId(url: string): string | null {
  return UPLOADED_PHOTO_PATTERN.test(url) ? url.slice(PREFIX.length) : null;
}

/** The backend's view of one photo, asked as the token's user; null when missing or someone else's. */
export async function fetchPhotoStatus(baseUrl: string, token: string, id: string): Promise<PhotoStatus | null> {
  const path = `/api/photos/${id}`;
  const response = await fetch(new URL(path, baseUrl), {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  const parsed = envelopeSchema(photoStatusSchema).safeParse(await response.json().catch(() => undefined));
  if (!response.ok || !parsed.success || !parsed.data.data) throw new Error(`GET ${path} failed with ${response.status}`);
  return parsed.data.data as PhotoStatus;
}

/** Why a listing's photos can't be saved yet, or null when every uploaded one is ready and the user's own. */
export async function checkUploadedPhotos(photos: string[], token: string | null): Promise<string | null> {
  const ids = photos.map(uploadedPhotoId).filter((id): id is string => id !== null);
  if (ids.length === 0) return null;
  const source = dataSource();
  if (source.kind !== "api" || !token) return PHOTOS_FAILED;

  const statuses = await Promise.all(ids.map((id) => fetchPhotoStatus(source.baseUrl, token, id)));
  if (statuses.some((status) => status === null || status.status === "rejected")) return PHOTOS_FAILED;
  if (statuses.some((status) => status?.status === "pending")) return PHOTOS_PROCESSING;
  return null;
}
