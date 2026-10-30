using System.Security.Claims;
using Airbnb.Modules.Media.Contracts;
using Airbnb.SharedKernel;
using Azure;
using Azure.Storage.Blobs;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Media;

internal static partial class GetPhotoStatus
{
    internal const string NotFoundMessage = "Photo not found";

    // Derived from the blobs (no table): a processed photo means ready, a rejected mark on the original means rejected,
    // an original alone means the function hasn't finished. Only the uploader may ask; anyone else gets the 404.
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/photos/{id}", async Task<Results<Ok<ApiResponse<PhotoStatusDto>>, NotFound<ApiResponse<object>>>> (
            string id, ClaimsPrincipal user, BlobServiceClient blobs, CancellationToken cancellationToken) =>
        {
            if (!PhotoStorage.IsPhotoId(id))
            {
                return TypedResults.NotFound(ApiResponse.Fail(NotFoundMessage));
            }

            IDictionary<string, string> metadata;
            try
            {
                var original = blobs.GetBlobContainerClient(PhotoStorage.UploadsContainer).GetBlobClient(id);
                metadata = (await original.GetPropertiesAsync(cancellationToken: cancellationToken)).Value.Metadata;
            }
            catch (RequestFailedException exception) when (exception.Status == StatusCodes.Status404NotFound)
            {
                return TypedResults.NotFound(ApiResponse.Fail(NotFoundMessage));
            }

            if (!metadata.TryGetValue(PhotoStorage.OwnerMetadata, out var owner) || owner != user.FindFirstValue(ClaimTypes.NameIdentifier))
            {
                return TypedResults.NotFound(ApiResponse.Fail(NotFoundMessage));
            }

            var processed = blobs.GetBlobContainerClient(PhotoStorage.PhotosContainer).GetBlobClient(PhotoStorage.ProcessedBlobName(id));
            if (await processed.ExistsAsync(cancellationToken))
            {
                return TypedResults.Ok(ApiResponse.Ok(new PhotoStatusDto(id, PhotoStatusDto.Ready, null)));
            }

            if (!metadata.TryGetValue(PhotoStorage.StatusMetadata, out var status) || status != PhotoStorage.RejectedStatus)
            {
                return TypedResults.Ok(ApiResponse.Ok(new PhotoStatusDto(id, PhotoStatusDto.Pending, null)));
            }
            metadata.TryGetValue(PhotoStorage.ReasonMetadata, out var reason);
            return TypedResults.Ok(ApiResponse.Ok(new PhotoStatusDto(id, PhotoStatusDto.Rejected, reason)));
        }).RequireAuthorization();
}
