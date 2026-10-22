# Host photo uploads — design

Date: 2026-10-22. Status: proposed.

## Intent

Hosts can only pick up to 5 of 12 fixed Unsplash photos (`PHOTO_OPTIONS`) for a listing. This feature lets them upload
their own. The processing step (check the file is a real image, fix rotation, remove location data, shrink and
re-encode) is bursty CPU work triggered by a storage event, which is why it runs in an Azure Function rather than the API.

The user asked for Aspire's own integrations for both parts: `Aspire.Hosting.Azure.Storage` (Azurite emulator locally)
with the `Aspire.Azure.Storage.Blobs` client, and `Aspire.Hosting.Azure.Functions`.

## Goals

- In api mode, the host listing form (create and edit) accepts uploaded JPEG, PNG or WebP files, 10 MB or less each, up
  to `MAX_PHOTOS` (5) photos per listing in total, uploads mixed with stock photos.
- Each photo shows a preview, then "Processing…", then the processed photo, or a short reason if it was rejected.
- The published photo carries no EXIF metadata (in particular no GPS position), is upright, and is at most 2560 px on its
  long edge.
- `aspire run` brings up storage and the function with everything else; nothing extra to install except the Azure
  Functions Core Tools (already needed by Aspire to run a Functions project).

## Non-goals

- Moving host listings into the backend. They stay in the Next server's memory (my call: the last question offered
  both and the answer was "LGTM"; photos outlive their listing on restart, which is acceptable for now).
- Deleting photos, orphan cleanup, multiple stored sizes (`next/image` already resizes on demand), reordering by drag,
  moderation, Azure deployment.
- Uploads in mock mode: mock mode keeps today's picker only.

## Anti-goals

- A photo URL that serves the unprocessed original. Only the function's output is ever served.
- Trusting the file name or the browser's content type.

## Architecture

```
browser ──multipart──▶ Next POST /api/host/photos ──bearer──▶ API POST /api/photos ──▶ blob photo-uploads/{id}
                                                                                         │ (blob trigger)
                                                                                         ▼
                                                              Function ProcessPhoto ──▶ blob photos/{id}.webp
browser ◀── next/image ◀── Next GET /api/photos/{id} ◀── API GET /api/photos/{id}/image ◀┘
```

### AppHost

```csharp
var storage = builder.AddAzureStorage("storage")
    .RunAsEmulator(azurite => azurite.WithDataVolume().WithLifetime(ContainerLifetime.Persistent));
var blobs = storage.AddBlobs("blobs");

var photoProcessor = builder.AddAzureFunctionsProject<Projects.Airbnb_Functions>("photo-processor")
    .WithHostStorage(storage)
    .WithReference(blobs)
    .WaitFor(storage);

api.WithReference(blobs).WaitFor(storage);
```

Both containers (`photo-uploads`, `photos`) are created on first use (`CreateIfNotExistsAsync`: the API before storing
an original, the function before writing its output; reads treat a missing container as a missing photo), so the
AppHost, the integration tests and Azure behave alike. Container names and metadata keys live in a new
`Airbnb.Modules.Media.Contracts` project, which both the module and the function reference.

### Backend: Media module

`src/Modules/Media/Airbnb.Modules.Media`, following the module layout in CLAUDE.md, but without a DbContext: blob
storage is its only state. Registered in `Airbnb.Api/Program.cs`, `ModuleRulesTests` (references SharedKernel only).
The API registers `BlobServiceClient` with `builder.AddAzureBlobServiceClient("blobs")`.

Photo ids: `Guid.CreateVersion7().ToString("N")` (32 lowercase hex). Blobs:

| Blob | Content | Metadata |
|---|---|---|
| `photo-uploads/{id}` | the original bytes | `ownerid` (user id), `status` (absent, or `rejected`), `reason` |
| `photos/{id}.webp` | the processed photo | — |

Status is derived, no table: `photos/{id}.webp` exists → `ready`; original's `status=rejected` → `rejected`; original
exists → `pending`; neither → 404.

Endpoints (all under `/api`, envelope responses):

- `POST /photos` — `.RequireAuthorization()`, multipart field `file`. Limits: request body 10 MB + a little for the
  multipart framing (`RequestSizeLimit` / form options on this endpoint only); file length 1 byte–10 MB. Content
  sniffed from the first bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF????WEBP`), the declared
  type is ignored. Failures: 413 `code: "photo_too_large"`, 415 `code: "photo_unsupported_type"`, 400 when `file` is
  missing. Success: 201 `{ id, status: "pending" }`, original stored with `ownerid`.
- `GET /photos/{id}` — `.RequireAuthorization()`, owner only (anyone else, or a malformed id: 404). Returns
  `{ id, status, reason? }` with `reason` one of `not_an_image`, `too_small`, `too_large_dimensions`.
- `GET /photos/{id}/image` — public. Streams `photos/{id}.webp` as `image/webp` with
  `Cache-Control: public, max-age=31536000, immutable` and the blob's ETag; 404 until ready. Never serves the original.

The existing write rate limit (10/min per IP) covers uploads; 5 photos plus retries fit.

### Azure Function

`src/Airbnb.Functions`: .NET isolated worker on `net10.0`, packages `Microsoft.Azure.Functions.Worker`,
`Microsoft.Azure.Functions.Worker.Sdk`, `Microsoft.Azure.Functions.Worker.Extensions.Storage.Blobs`,
`Aspire.Azure.Storage.Blobs`, `SkiaSharp` + `SkiaSharp.NativeAssets.Linux.NoDependencies` (MIT; ImageSharp's split
license is avoided). It uses ServiceDefaults and references no module.

`ProcessPhoto`: `[BlobTrigger("photo-uploads/{id}", Connection = "blobs")] Stream original, string id`.

`PhotoProcessor.Process(Stream) → Result` (plain class, unit-tested without the Functions host):

1. `SKCodec.Create`; null → reject `not_an_image`.
2. From the codec info, before decoding: more than 40 megapixels → reject `too_large_dimensions` (decompression-bomb
   guard); short edge under 400 px → reject `too_small`.
3. Decode, apply `EncodedOrigin` (EXIF orientation), scale so the long edge is at most 2560 px (high-quality sampling).
4. Encode WebP, quality 80. Skia's encoder writes no EXIF/XMP, which removes GPS data.

The function writes `photos/{id}.webp` (skipped if it already exists: blob triggers can fire more than once), or on
rejection sets `status=rejected` and `reason` on the original. Any other exception propagates so the host retries and
finally poison-queues the blob; the photo then stays `pending` and the form's timeout (below) covers it.

### Frontend

- `app/api/host/photos/route.ts` `POST`: session-guarded (401 envelope), `withErrorEnvelope`, forwards the multipart
  body to the API with the session's bearer token, returns the API's envelope and status. 404 in mock mode.
- `app/api/host/photos/[id]/route.ts` `GET`: same guard, forwards the status call.
- `app/api/photos/[id]/route.ts` `GET`: public image proxy to `GET /api/photos/{id}/image`, streams the body and passes
  `Content-Type`, `Cache-Control`, `ETag` through. Stored listing photo URLs are this same-origin path
  (`/api/photos/{id}`), so `next/image` needs no new remote host.
- `lib/host/schemas.ts`: a photo is a `PHOTO_OPTIONS` URL or matches `^/api/photos/[0-9a-f]{32}$`. In api mode the
  host-listing create/update route handlers check every uploaded photo with the status call (as the signed-in user) and
  refuse the save (400, "Wait for photos to finish processing" / "Remove rejected photos") unless all are `ready` and
  owned by that user. In mock mode an uploaded-photo URL fails validation.
- `components/features/host/photo-uploader.tsx`: a file input (`accept="image/jpeg,image/png,image/webp"`, multiple)
  plus drop zone, client-side checks (type, 10 MB, remaining slots) for fast feedback, a preview from
  `URL.createObjectURL`, then polls the status route every 2 s; after 60 s it shows "Still processing — try again
  later" and lets the host remove it. Rejection reasons map to fixed text. Ready photos join the same `photos` list
  the stock picker uses, so the cover/position logic is unchanged. The form shows it only when the page passes
  `uploadsEnabled` (from `dataSource() === "api"`); the stock picker stays in both modes.

## Testing

- Unit (`Airbnb.UnitTests`): `PhotoProcessor` with images generated in the test by Skia (JPEG with an orientation tag,
  a PNG, an oversized one scaled down, a tiny one, random bytes, a header claiming > 40 MP); content sniffing.
- Integration (`Airbnb.Api.Tests`): `InfrastructureFixture` adds an Azurite Testcontainer (`Testcontainers.Azurite`).
  Upload requires auth; too large → 413; text file named `.jpg` → 415; owner sees `pending`, another user gets 404;
  `/image` is 404 while pending, and after the test writes `photos/{id}.webp` itself it is 200 with the cache header;
  rejected metadata shows as `rejected` with its reason. The function is not hosted here.
- AppHost smoke test: upload a generated JPEG through the API and wait (≤ 60 s) for `ready`, which proves the Azurite,
  blob trigger and function wiring. CI's `apphost` job installs the Core Tools
  (`npm i -g azure-functions-core-tools@4`).
- Frontend: Vitest for the uploader (states, limits, polling with fake timers, reasons) and the three route handlers
  (guard, forwarding, mock-mode 404); schema tests for the new URL form and the ready check.

## Risks

- Blob trigger latency on Azurite (polling) may be several seconds; acceptable with the spinner. If it proves much
  worse, switch to a queue message sent by the API (`storage.AddQueues`) — a builder's call during implementation.
- Functions on `net10.0` need Core Tools v4.1+; the local machine has v5 preview.

## Calls made without asking (check these)

- Photos attach to in-memory host listings; host listings move to the backend later.
- One stored size (≤ 2560 px WebP); `next/image` makes the rest.
- No database table: status lives in blob existence and metadata.
- SkiaSharp, not ImageSharp, for licensing.
- The stock picker stays next to uploads in api mode.
- The image proxy route forwards the browser IP like the other route handlers; `next/image` caches its optimized
  output, so the API's read limit isn't a concern for repeated views.

## Left to the builder

Exact component markup and copy (following DESIGN.md tokens), file/class names inside the projects, and logging.
