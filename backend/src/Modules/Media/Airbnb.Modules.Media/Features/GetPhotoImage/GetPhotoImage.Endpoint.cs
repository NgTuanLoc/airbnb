using Airbnb.Modules.Media.Contracts;
using Airbnb.SharedKernel;
using Azure;
using Azure.Storage.Blobs;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Net.Http.Headers;

namespace Airbnb.Modules.Media;

internal static partial class GetPhotoImage
{
    // A photo id never changes content, so browsers and next/image may keep it for a year.
    private const string CacheControl = "public, max-age=31536000, immutable";

    // Public: listings show these to everyone. Only the processed photo is served, never the original.
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/photos/{id}/image", async Task<IResult> (
            string id, HttpContext context, BlobServiceClient blobs, CancellationToken cancellationToken) =>
        {
            if (!PhotoStorage.IsPhotoId(id))
            {
                return TypedResults.NotFound(ApiResponse.Fail(GetPhotoStatus.NotFoundMessage));
            }

            try
            {
                var blob = blobs.GetBlobContainerClient(PhotoStorage.PhotosContainer).GetBlobClient(PhotoStorage.ProcessedBlobName(id));
                var download = (await blob.DownloadStreamingAsync(cancellationToken: cancellationToken)).Value;
                context.Response.Headers.CacheControl = CacheControl;
                return TypedResults.Stream(download.Content, "image/webp",
                    entityTag: EntityTagHeaderValue.Parse(download.Details.ETag.ToString("H")));
            }
            catch (RequestFailedException exception) when (exception.Status == StatusCodes.Status404NotFound)
            {
                return TypedResults.NotFound(ApiResponse.Fail(GetPhotoStatus.NotFoundMessage));
            }
        });
}
