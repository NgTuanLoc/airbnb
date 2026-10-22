# Host Photo Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hosts upload their own listing photos in api mode; an Azure Function validates, uprights, strips metadata and re-encodes them to WebP before they are ever served.

**Architecture:** A blob-only `Media` module in the API stores originals in `photo-uploads` (Azurite locally) and serves processed photos from `photos`. A .NET isolated Azure Function, blob-triggered on `photo-uploads`, does the image work with SkiaSharp. Next relays uploads, status checks and images through route handlers, and the host form gains an uploader. Status is derived from blobs, with no table.

**Tech Stack:** Aspire 13.6.3 (`Aspire.Hosting.Azure.Storage`, `Aspire.Hosting.Azure.Functions`, `Aspire.Azure.Storage.Blobs`), Azure Functions isolated worker on net10.0, SkiaSharp, Testcontainers.Azurite, Next.js 16, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-host-photo-uploads-design.md`

## Global Constraints

- Package versions only in `backend/Directory.Packages.props`. Pin: `Aspire.Hosting.Azure.Storage` 13.6.3, `Aspire.Hosting.Azure.Functions` 13.6.3, `Aspire.Azure.Storage.Blobs` 13.6.3, `Microsoft.Azure.Functions.Worker` 2.52.0, `Microsoft.Azure.Functions.Worker.Sdk` 2.1.0, `Microsoft.Azure.Functions.Worker.Extensions.Storage.Blobs` 6.8.2, `SkiaSharp` 4.153.1, `SkiaSharp.NativeAssets.Linux.NoDependencies` 4.153.1, `Testcontainers.Azurite` 4.15.0 (same as the other Testcontainers).
- Warnings are errors; tests pass `TestContext.Current.CancellationToken`.
- Aspire resource names: `storage`, `blobs` (the blob connection name everywhere), `photo-processor`.
- Containers `photo-uploads` and `photos`; metadata keys `ownerid`, `status` (value `rejected`), `reason`; processed blob `{id}.webp`.
- Photo id: `Guid.CreateVersion7().ToString("N")`, validated as `^[0-9a-f]{32}$`.
- File limit: 10 MB = 10 * 1024 * 1024 bytes. Long edge ≤ 2560 px, WebP quality 80, reject short edge < 400 px or > 40,000,000 pixels.
- API error codes: `photo_too_large` (413), `photo_unsupported_type` (415). Rejection reasons: `not_an_image`, `too_small`, `too_large_dimensions`.
- UI copy, exactly:
  - `photo_too_large`: "Photos must be 10 MB or smaller"
  - `photo_unsupported_type`: "Use a JPEG, PNG or WebP photo"
  - `not_an_image`: "This file isn't a photo we can read"
  - `too_small`: "Photos need to be at least 400 pixels on the short side"
  - `too_large_dimensions`: "This photo is too large (over 40 megapixels)"
  - processing timeout: "Still processing — try again later"
  - saving with a pending photo: "Wait for photos to finish processing"
  - saving with a rejected, unknown or foreign photo, or any uploaded photo in mock mode: "Remove photos that failed to upload"
- Frontend: tokens from DESIGN.md only; every route export wrapped in `withErrorEnvelope`; tests import from `@/lib/test-utils`.

## Review Focus

- An iPhone HEIC file (`....ftypheic`) is refused with 415 `photo_unsupported_type`, not accepted and then rejected later. Test in Task 2.
- A file of exactly 10 MB is accepted, while 10 MB + 1 byte gets 413 with `code: "photo_too_large"`, not a bare framework 413 or 400. Test in Task 2.
- A transparent PNG comes out as a valid WebP and keeps its alpha. Test in Task 1.
- Saving a listing that includes another user's photo id, or a pending one, is refused with the fixed message. Editing a listing whose uploaded photos are all ready still saves. Tests in Task 4.
- The same original processed twice (blob triggers can fire more than once) leaves one output and doesn't throw. Test in Task 3 (`PhotoJob`).

---

### Task 1: Media contracts + PhotoProcessor

**Files:**
- Create: `backend/src/Modules/Media/Airbnb.Modules.Media.Contracts/Airbnb.Modules.Media.Contracts.csproj`, `PhotoStorage.cs`
- Create: `backend/src/Airbnb.Functions/Airbnb.Functions.csproj`, `host.json`, `Program.cs`, `PhotoProcessor.cs`
- Modify: `backend/Airbnb.slnx`, `backend/Directory.Packages.props`, `backend/tests/Airbnb.UnitTests/Airbnb.UnitTests.csproj`, `backend/tests/Airbnb.ArchitectureTests/ModuleRulesTests.cs` (Contracts map)
- Test: `backend/tests/Airbnb.UnitTests/Functions/PhotoProcessorTests.cs`

**Interfaces:**
- Produces: `public static class PhotoStorage { const string UploadsContainer = "photo-uploads", PhotosContainer = "photos", OwnerMetadata = "ownerid", StatusMetadata = "status", RejectedStatus = "rejected", ReasonMetadata = "reason"; static string ProcessedBlobName(string id) => $"{id}.webp"; static bool IsPhotoId(string id); }` (namespace `Airbnb.Modules.Media.Contracts`).
- Produces: `internal sealed record PhotoResult(byte[]? Webp, string? RejectionReason)` and `internal static class PhotoProcessor { PhotoResult Process(Stream original); const int MaxLongEdge = 2560, MinShortEdge = 400; const long MaxPixels = 40_000_000; }` in `Airbnb.Functions` (InternalsVisibleTo `Airbnb.UnitTests`).

- [ ] **Step 1: Scaffold.** Contracts is a plain class library referencing nothing. `Airbnb.Functions` is `Microsoft.NET.Sdk`, `OutputType Exe`, `AzureFunctionsVersion v4`, packages Worker, Worker.Sdk, Extensions.Storage.Blobs, `Aspire.Azure.Storage.Blobs`, SkiaSharp and the Linux native assets, plus project references to ServiceDefaults and Media.Contracts. `Program.cs` = `FunctionsApplication.CreateBuilder(args)`, `AddServiceDefaults()`, `AddAzureBlobServiceClient("blobs")`, build, run. `host.json` is the v2 default. Add both projects to the slnx and the Contracts project to `ModuleRulesTests.Contracts` (`typeof(PhotoStorage)`).
- [ ] **Step 2: Write the failing tests** in `PhotoProcessorTests`. Images are generated in-test with Skia (`SKBitmap` → `SKImage.Encode`). For EXIF orientation, hand-insert an APP1 segment with Orientation = 6 into the JPEG bytes.
  - `Rotated_jpeg_comes_out_upright_without_metadata`: a 600×400 JPEG tagged orientation 6 → the output decodes as WebP, 400×600, and the output bytes contain neither `"Exif"` nor `"XMP"`.
  - `Large_photo_is_scaled_to_2560_on_the_long_edge`: 4000×3000 → 2560×1920.
  - `Small_photo_is_kept_at_its_size`: 800×600 → 800×600.
  - `Transparent_png_keeps_alpha`: a 500×500 PNG with a transparent pixel at (0,0) → output WebP pixel (0,0) alpha = 0.
  - `Short_edge_under_400_is_rejected`: 1000×399 → `RejectionReason == "too_small"`, `Webp == null`.
  - `Over_40_megapixels_is_rejected_before_decoding`: PNG 8000×5001 → `"too_large_dimensions"`.
  - `Random_bytes_are_not_an_image`: 2 KB random → `"not_an_image"`.
  - `PhotoStorage_ids`: `IsPhotoId` true for `Guid.CreateVersion7().ToString("N")`, false for `""`, `"../x"`, uppercase hex, 31 chars.
- [ ] **Step 3: Run:** `dotnet test --project tests/Airbnb.UnitTests --filter-class "Airbnb.UnitTests.Functions.PhotoProcessorTests"`. Expected: FAIL (types missing).
- [ ] **Step 4: Implement `PhotoProcessor.Process`** with `SKCodec.Create` (null → `not_an_image`), checking dimensions from `codec.Info` before decoding. Decode, apply `codec.EncodedOrigin` by drawing onto a rotated/flipped canvas, resize with `SKSamplingOptions(SKCubicResampler.Mitchell)` when the long edge is over 2560, then `SKImage.Encode(SKEncodedImageFormat.Webp, 80)`.
- [ ] **Step 5: Run the tests.** Expected: PASS, and `dotnet build Airbnb.slnx` has 0 warnings.
- [ ] **Step 6: Commit** `feat: add the photo processor for host uploads`.

### Task 2: Media module (upload, status, image)

**Files:**
- Create: `backend/src/Modules/Media/Airbnb.Modules.Media/Airbnb.Modules.Media.csproj`, `MediaModule.cs`, `UploadPhoto.cs`, `GetPhotoStatus.cs`, `GetPhotoImage.cs`, `PhotoContent.cs` (sniffing)
- Modify: `backend/src/Airbnb.Api/Program.cs`, `backend/src/Airbnb.Api/Airbnb.Api.csproj`, `backend/Airbnb.slnx`, `backend/Directory.Packages.props`, `ModuleRulesTests.cs` (Modules map), `backend/tests/Airbnb.Api.Tests/Airbnb.Api.Tests.csproj`, `Infrastructure/InfrastructureFixture.cs`, `Infrastructure/ApiFactory.cs`
- Test: `backend/tests/Airbnb.Api.Tests/Media/PhotoEndpointTests.cs`, `backend/tests/Airbnb.UnitTests/Media/PhotoContentTests.cs`

**Interfaces:**
- Consumes: `PhotoStorage` (Task 1).
- Produces: `public static class MediaModule { IHostApplicationBuilder AddMediaModule(this IHostApplicationBuilder); IEndpointRouteBuilder MapMediaEndpoints(this IEndpointRouteBuilder); }`. `AddMediaModule` calls `builder.AddAzureBlobServiceClient("blobs")`. There's no `AddMediaModuleDatabase`: blobs are the module's only state, so it is not added to the MigrationService.
- Produces HTTP:
  - `POST /api/photos` → 201 `{ id, status: "pending" }`
  - `GET /api/photos/{id}` → 200 `{ id, status: "pending"|"ready"|"rejected", reason? }`, or 404
  - `GET /api/photos/{id}/image` → `image/webp` with `Cache-Control: public, max-age=31536000, immutable` and `ETag`
- Produces: `InfrastructureFixture.BlobConnectionString`, and `ApiFactory` sets `ConnectionStrings:blobs`.

- [ ] **Step 1: Write the failing tests.**
  - `PhotoContentTests`: JPEG/PNG/WebP magic bytes recognised; HEIC (`00 00 00 18 66 74 79 70 68 65 69 63`), GIF and text not recognised.
  - `PhotoEndpointTests`, multipart field `file`, user from `AuthHelpers.RegisterAsync`:
    - `Upload_requires_sign_in` → 401.
    - `Upload_stores_the_original_with_its_owner`: a small JPEG → 201, `status == "pending"`, and the blob `photo-uploads/{id}` exists with `ownerid` = the user id (checked with a `BlobServiceClient` on the fixture's connection string).
    - `Exactly_10_MB_is_accepted_and_one_byte_more_is_413`: JPEG magic + padding to 10,485,760 → 201; 10,485,761 → 413 with `code == "photo_too_large"`.
    - `Heic_and_renamed_text_are_415`: both → 415 with `code == "photo_unsupported_type"` (the text file sent as `photo.jpg`, `image/jpeg`).
    - `Missing_file_is_400`.
    - `Status_is_owner_only`: owner gets `pending`; another user gets 404; `GET /api/photos/not-an-id` gets 404.
    - `Image_is_404_until_processed_then_cached`: `/image` is 404; the test uploads `photos/{id}.webp` itself, then `/image` is 200 `image/webp` with the cache header and an ETag, and status becomes `ready`.
    - `Rejected_original_reports_its_reason`: the test sets metadata `status=rejected, reason=too_small` → status `rejected`, `reason == "too_small"`, and `/image` is 404.
- [ ] **Step 2: Run** `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Media.PhotoEndpointTests"` and the unit test. Expected: FAIL.
- [ ] **Step 3: Add the Azurite container** (`AzuriteBuilder("mcr.microsoft.com/azure-storage/azurite:3.35.0")`), started after RabbitMQ and disposed first.
- [ ] **Step 4: Implement the module.** Upload endpoint:
  - `.RequireAuthorization()`, `.DisableAntiforgery()`
  - request size limit 10 MB + 64 KB via `WithMetadata(new RequestSizeLimitAttribute(...))` and `FormOptions.MultipartBodyLengthLimit` on the endpoint
  - length > 10 MB → 413 `photo_too_large`; sniff the first 12 bytes → 415 `photo_unsupported_type`
  - `CreateIfNotExistsAsync` on `photo-uploads`, then upload with the `ownerid` metadata

  Status and image endpoints:
  - a missing blob or container (`RequestFailedException` status 404) reads as not found
  - status checks ownership against `ClaimTypes.NameIdentifier`
  - image streams `photos/{id}.webp` with the ETag and cache header

  Register in `Program.cs` next to the other modules, and add the module to `ModuleRulesTests.Modules`.
- [ ] **Step 5: Run the tests.** Expected: PASS, along with the rest of `Airbnb.Api.Tests` and `Airbnb.ArchitectureTests`.
- [ ] **Step 6: Commit** `feat: add the Media module for photo uploads`.

### Task 3: The Function, AppHost wiring, smoke test, CI

**Files:**
- Create: `backend/src/Airbnb.Functions/ProcessPhoto.cs`, `backend/src/Airbnb.Functions/PhotoJob.cs`
- Modify: `backend/src/Airbnb.AppHost/AppHost.cs`, `Airbnb.AppHost.csproj`, `backend/Directory.Packages.props`, `backend/tests/Airbnb.AppHost.Tests/AppHostSmokeTests.cs` (+ csproj: SkiaSharp), `.github/workflows/ci.yml`, `README.md`, `CLAUDE.md`
- Test: `backend/tests/Airbnb.Api.Tests/Media/PhotoJobTests.cs` (needs Azurite, so it lives with the integration tests; `Airbnb.Api.Tests` references `Airbnb.Functions`, which gets InternalsVisibleTo `Airbnb.Api.Tests`)

**Interfaces:**
- Consumes: `PhotoProcessor.Process`, `PhotoStorage`.
- Produces: `internal sealed class PhotoJob(BlobServiceClient blobs) { Task RunAsync(string id, Stream original, CancellationToken ct); }`. `ProcessPhoto` is `[Function("ProcessPhoto")]` with `[BlobTrigger("photo-uploads/{id}", Connection = "blobs")] Stream original, string id`; it ignores ids that fail `IsPhotoId` and calls `PhotoJob.RunAsync`.

- [ ] **Step 1: Write the failing `PhotoJobTests`.**
  - `Valid_photo_writes_the_webp`: after `RunAsync`, `photos/{id}.webp` exists.
  - `Running_twice_is_harmless`: a second `RunAsync` doesn't throw and the blob's ETag is unchanged.
  - `Rejected_photo_marks_the_original`: random bytes → the original's metadata has `status=rejected` and `reason=not_an_image`, keeps `ownerid`, and no output blob exists.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement `PhotoJob`.**
  - If the output exists, return.
  - Otherwise process the original:
    - On success, `CreateIfNotExistsAsync` on `photos` and upload with `ContentType = "image/webp"`.
    - On rejection, merge `status` and `reason` into the original's existing metadata (read it, add the two keys, `SetMetadataAsync`).
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Wire the AppHost** exactly as in the spec's AppHost block:
  - `AddAzureStorage("storage").RunAsEmulator(...)` with data volume and persistent lifetime
  - `AddBlobs("blobs")`
  - `AddAzureFunctionsProject<Projects.Airbnb_Functions>("photo-processor").WithHostStorage(storage).WithReference(blobs).WaitFor(storage)`
  - `api.WithReference(blobs).WaitFor(storage)`
- [ ] **Step 6: Extend the smoke test.**
  - Register a user through the API.
  - POST an 800×600 JPEG generated with Skia to `/api/photos`.
  - Poll `GET /api/photos/{id}` every second for at most 60 s until `ready`.
  - Assert `/api/photos/{id}/image` is 200 `image/webp`.
  - Also assert the `photo-processor` resource is running.
- [ ] **Step 7: Update the CI `apphost` job:** before `dotnet test`, add `- run: npm i -g azure-functions-core-tools@4 --unsafe-perm true`.
- [ ] **Step 8: Verify locally.** Run `dotnet test --project tests/Airbnb.AppHost.Tests`. Expected: PASS. Run `aspire run`. Expected: the dashboard shows `storage`, `photo-processor` and `api` healthy.
- [ ] **Step 9: Docs.** README gets a "Photo uploads" bullet: what runs, and that Core Tools are needed. CLAUDE.md gets a Backend Conventions bullet: the Media module, the blob layout, the Function, Azurite in tests, and the CI Core Tools step. Update the CLAUDE.md layout line to add Media and `src/Airbnb.Functions`.
- [ ] **Step 10: Commit** `feat: process uploaded photos in an Azure Function under Aspire`.

### Task 4: Frontend relay routes and the save check

**Files:**
- Create: `frontend/lib/host/uploaded-photos.ts`, `frontend/app/api/host/photos/route.ts`, `frontend/app/api/host/photos/[id]/route.ts`, `frontend/app/api/photos/[id]/route.ts`
- Modify: `frontend/lib/host/schemas.ts`, `frontend/app/api/host/listings/route.ts`, `frontend/app/api/host/listings/[id]/route.ts`
- Test: `frontend/lib/host/uploaded-photos.test.ts`, `frontend/app/api/host/photos/photo-routes.test.ts`, `frontend/lib/host/schemas.test.ts`, `frontend/app/api/host/listings/host-listing-routes.test.ts`

**Interfaces:**
- Produces, in `lib/host/uploaded-photos.ts`:
  - `UPLOADED_PHOTO_PATTERN = /^\/api\/photos\/[0-9a-f]{32}$/`
  - `uploadedPhotoUrl(id: string): string` (returns `/api/photos/${id}`)
  - `uploadedPhotoId(url: string): string | null`
  - `type PhotoStatus = { id: string; status: "pending" | "ready" | "rejected"; reason?: string }`
  - `fetchPhotoStatus(baseUrl: string, token: string, id: string): Promise<PhotoStatus | null>` (null on 404)
  - `checkUploadedPhotos(photos: string[], token: string | null): Promise<string | null>`, which returns one of the two fixed save messages, or null when all are fine
- Produces HTTP (Next):
  - `POST /api/host/photos` (multipart passthrough)
  - `GET /api/host/photos/[id]` → `PhotoStatus`
  - `GET /api/photos/[id]` → image passthrough

  All three are 404 in mock mode; the first two are session-guarded.

- [ ] **Step 1: Write the failing tests.**
  - Schema: accepts `PHOTO_OPTIONS[0]` and `/api/photos/<32 hex>`; rejects `/api/photos/../x`, `https://evil.example/x.jpg` and duplicates.
  - `checkUploadedPhotos`, with `fetch` stubbed:
    - only stock photos → null and no fetch
    - all ready → null
    - one pending → "Wait for photos to finish processing"
    - one 404 (another user's photo) → "Remove photos that failed to upload"
    - one rejected → the same message
    - mock mode with an uploaded URL → the same message
  - Routes:
    - POST without a session → 401 envelope
    - POST forwards the body unchanged with `authorization: Bearer <token>`, `content-type` and `x-forwarded-for`, and returns the API's status and body (201 and 413 cases)
    - status GET forwards
    - the image GET streams the body and passes `content-type`, `cache-control` and `etag`; an API 404 → 404
    - all three → 404 in mock mode
  - Listing routes: POST and PUT with a pending uploaded photo → 400 with the message; PUT with all-ready uploaded photos → 200.
- [ ] **Step 2: Run** `npx vitest run lib/host app/api/host app/api/photos`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The schema's photo item becomes "in `PHOTO_OPTIONS` or matches `UPLOADED_PHOTO_PATTERN`".
  - Forwarding uses `fetch(new URL(path, baseUrl), { method, body: request.body, duplex: "half", headers })` with a 30 s timeout on uploads. The headers come from the cookie token (`getSessionToken()`) and `clientIp(request)`.
  - The listing routes call `checkUploadedPhotos` after `parseBody` and return `jsonError(message, 400)`.
- [ ] **Step 4: Run the tests.** Expected: PASS, plus `npm run lint` and `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat: relay photo uploads through Next and check them on save`.

### Task 5: Uploader UI

**Files:**
- Create: `frontend/components/features/host/photo-uploader.tsx`, `frontend/lib/host/photo-upload-messages.ts`
- Modify: `frontend/components/features/host/host-listing-form.tsx`, `frontend/app/host/listings/new/page.tsx`, `frontend/app/host/listings/[id]/edit/page.tsx`, root `CLAUDE.md` (add `PhotoUploader` to the component list; replace "Photos must come from `PHOTO_OPTIONS`" with the upload rule)
- Test: `frontend/components/features/host/photo-uploader.test.tsx`, `host-listing-form.test.tsx`, both page tests

**Interfaces:**
- Consumes: `uploadedPhotoUrl`, `PhotoStatus` (Task 4), `MAX_PHOTOS`.
- Produces:
  - `photoUploadMessage(code: string): string`, which maps every code in Global Constraints and falls back to "Upload failed — try again"
  - `PhotoUploader({ remaining: number, onReady: (url: string) => void })`
  - `HostListingFormProps` gains `uploadsEnabled?: boolean`

- [ ] **Step 1: Write the failing tests.** Use fake timers and stub `fetch`.
  - `PhotoUploader`:
    - picking an 11 MB file shows "Photos must be 10 MB or smaller" with no request made
    - a `.gif` shows the type message
    - a valid file shows a preview with "Processing…", then on `ready` calls `onReady("/api/photos/<id>")`
    - a `rejected`/`too_small` status shows that text
    - after 60 s of `pending` it shows "Still processing — try again later" and a Remove button
    - with `remaining = 0` the input is disabled
    - the file input has `accept="image/jpeg,image/png,image/webp"` and `multiple`
  - Form: with `uploadsEnabled` the uploader renders in the photos step, and a ready upload appears in the selected photos with its position badge. Without `uploadsEnabled` there is no uploader.
  - Pages: `uploadsEnabled` is true when `dataSource().kind === "api"`.
- [ ] **Step 2: Run** `npx vitest run components/features/host app/host`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The uploader POSTs `FormData` with `file` to `/api/host/photos`, then polls `/api/host/photos/{id}` every 2 s.
  - Revoke object URLs on unmount and removal.
  - In the form, uploaded photos render first in the photo grid (`next/image` with their local path) and toggle like stock photos. `onReady` appends when under `MAX_PHOTOS`.
- [ ] **Step 4: Run** `npm test`, `npm run lint` and `npx tsc --noEmit`. Expected: all pass.
- [ ] **Step 5: Manual check under `aspire run`.**
  - Create a listing with an uploaded phone photo and confirm it shows on `/rooms/hl-…`.
  - Download it and confirm it's WebP with no EXIF.
- [ ] **Step 6: Commit** `feat: let hosts upload listing photos`.
