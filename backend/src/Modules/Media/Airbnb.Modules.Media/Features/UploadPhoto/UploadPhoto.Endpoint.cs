using System.Security.Claims;
using Airbnb.Modules.Media.Contracts;
using Airbnb.SharedKernel;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Media;

internal static partial class UploadPhoto
{
    internal const long MaxFileBytes = 10 * 1024 * 1024;
    // Room for the multipart boundaries and part headers around a file at the limit.
    private const long MaxRequestBytes = MaxFileBytes + 64 * 1024;

    internal const string MissingFile = "Attach a photo as the 'file' field";
    internal const string TooLarge = "Photos must be 10 MB or smaller";
    internal const string UnsupportedType = "Use a JPEG, PNG or WebP photo";

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/photos", async Task<IResult> (
            IFormFile? file, ClaimsPrincipal user, BlobServiceClient blobs, CancellationToken cancellationToken) =>
        {
            if (file is null || file.Length == 0)
            {
                return TypedResults.BadRequest(ApiResponse.Fail(MissingFile));
            }
            if (file.Length > MaxFileBytes)
            {
                return TypedResults.Json(ApiResponse.Fail(TooLarge, "photo_too_large"), statusCode: StatusCodes.Status413PayloadTooLarge);
            }

            await using var content = file.OpenReadStream();
            var header = new byte[PhotoContent.HeaderLength];
            var read = await content.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false, cancellationToken);
            if (!PhotoContent.IsSupported(header.AsSpan(0, read)))
            {
                return TypedResults.Json(ApiResponse.Fail(UnsupportedType, "photo_unsupported_type"), statusCode: StatusCodes.Status415UnsupportedMediaType);
            }
            content.Position = 0;

            var id = Guid.CreateVersion7().ToString("N");
            var uploads = blobs.GetBlobContainerClient(PhotoStorage.UploadsContainer);
            await uploads.CreateIfNotExistsAsync(cancellationToken: cancellationToken);
            await uploads.GetBlobClient(id).UploadAsync(content, new BlobUploadOptions
            {
                Metadata = new Dictionary<string, string> { [PhotoStorage.OwnerMetadata] = user.FindFirstValue(ClaimTypes.NameIdentifier)! },
            }, cancellationToken);

            return TypedResults.Created($"/api/photos/{id}", ApiResponse.Ok(new PhotoStatusDto(id, PhotoStatusDto.Pending, null)));
        })
        .RequireAuthorization()
        .DisableAntiforgery()
        .WithMetadata(new RequestSizeLimitAttribute(MaxRequestBytes), new RequestFormLimitsAttribute { MultipartBodyLengthLimit = MaxRequestBytes });
}
