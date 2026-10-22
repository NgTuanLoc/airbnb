"use client";

import { useEffect, useRef, useState } from "react";
import { photoUploadMessage } from "@/lib/host/photo-upload-messages";
import { uploadedPhotoUrl } from "@/lib/host/uploaded-photos";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;
const POLL_INTERVAL_MS = 2_000;
const PROCESSING_TIMEOUT_MS = 60_000;

type Upload = { key: string; name: string; preview: string; message: string | null };

export interface PhotoUploaderProps {
  /** Photo slots the listing has left; in-flight uploads count against them. */
  remaining: number;
  /** Called once per photo the photo-processor has finished, with the URL the listing stores. */
  onReady: (url: string) => void;
}

/** Uploads host photos and waits for the backend to process them; finished photos leave this list via onReady. */
export function PhotoUploader({ remaining, onReady }: PhotoUploaderProps) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  // Polls outlive renders, so they call the latest onReady through a ref.
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const slots = remaining - uploads.filter((upload) => upload.message === null).length;

  function update(key: string, message: string | null) {
    setUploads((current) => current.map((upload) => (upload.key === key ? { ...upload, message } : upload)));
  }

  function remove(key: string) {
    setUploads((current) => {
      const gone = current.find((upload) => upload.key === key);
      if (gone) URL.revokeObjectURL(gone.preview);
      return current.filter((upload) => upload.key !== key);
    });
  }

  function later(run: () => void, ms: number) {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      run();
    }, ms);
    timers.current.add(timer);
  }

  function poll(key: string, id: string, startedAt: number) {
    later(async () => {
      try {
        const response = await fetch(`/api/host/photos/${id}`, { cache: "no-store" });
        const status = (await response.json())?.data;
        if (status?.status === "ready") {
          remove(key);
          onReadyRef.current(uploadedPhotoUrl(id));
          return;
        }
        if (status?.status === "rejected") return update(key, photoUploadMessage(status.reason));
      } catch {
        // A missed check is retried on the next tick.
      }
      if (Date.now() - startedAt >= PROCESSING_TIMEOUT_MS) update(key, photoUploadMessage("timeout"));
      else poll(key, id, startedAt);
    }, POLL_INTERVAL_MS);
  }

  async function start(file: File) {
    const key = crypto.randomUUID();
    setUploads((current) => [...current, { key, name: file.name, preview: URL.createObjectURL(file), message: null }]);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/host/photos", { method: "POST", body: form });
      const body = await response.json().catch(() => undefined);
      if (!response.ok || !body?.data?.id) return update(key, photoUploadMessage(body?.code));
      poll(key, body.data.id, Date.now());
    } catch {
      update(key, photoUploadMessage(undefined));
    }
  }

  function pick(files: FileList | null) {
    setPickError(null);
    const picked = Array.from(files ?? []);
    const wrongType = picked.find((file) => !ACCEPTED_TYPES.includes(file.type));
    const tooLarge = picked.find((file) => file.size > MAX_BYTES);
    if (wrongType) setPickError(photoUploadMessage("photo_unsupported_type"));
    else if (tooLarge) setPickError(photoUploadMessage("photo_too_large"));
    picked
      .filter((file) => ACCEPTED_TYPES.includes(file.type) && file.size <= MAX_BYTES)
      .slice(0, Math.max(slots, 0))
      .forEach(start);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex h-14 cursor-pointer items-center justify-center rounded-sm border border-dashed border-hairline text-body-md text-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:text-muted">
        Upload photos
        <input
          type="file"
          className="sr-only"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          disabled={slots <= 0}
          onChange={(event) => {
            pick(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      {pickError && <span className="text-body-sm text-error">{pickError}</span>}
      {uploads.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {uploads.map((upload) => (
            <li key={upload.key} className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview, not optimizable */}
              <img src={upload.preview} alt={upload.name} className="aspect-square w-full rounded-sm object-cover" />
              {upload.message === null ? (
                <span className="text-caption text-body">Processing…</span>
              ) : (
                <>
                  <span className="text-caption text-error">{upload.message}</span>
                  <button type="button" className="text-left text-caption text-ink underline" aria-label={`Remove ${upload.name}`} onClick={() => remove(upload.key)}>
                    Remove
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
