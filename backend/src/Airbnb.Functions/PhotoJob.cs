using Airbnb.Modules.Media.Contracts;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace Airbnb.Functions;

// One uploaded original → the processed WebP in "photos", or a rejected mark (with its reason) on the original.
// Blob triggers can fire more than once for the same blob, and marking the original changes its ETag, which the
// trigger sees as a new version: an existing output or an existing mark means the work is already done.
internal sealed class PhotoJob(BlobServiceClient blobs)
{
    public async Task RunAsync(string id, Stream original, CancellationToken cancellationToken)
    {
        var photos = blobs.GetBlobContainerClient(PhotoStorage.PhotosContainer);
        var output = photos.GetBlobClient(PhotoStorage.ProcessedBlobName(id));
        if (await output.ExistsAsync(cancellationToken))
        {
            return;
        }

        var upload = blobs.GetBlobContainerClient(PhotoStorage.UploadsContainer).GetBlobClient(id);
        var metadata = (await upload.GetPropertiesAsync(cancellationToken: cancellationToken)).Value.Metadata;
        if (metadata.TryGetValue(PhotoStorage.StatusMetadata, out var status) && status == PhotoStorage.RejectedStatus)
        {
            return;
        }

        var result = PhotoProcessor.Process(original);
        if (result.Webp is { } webp)
        {
            await photos.CreateIfNotExistsAsync(cancellationToken: cancellationToken);
            await output.UploadAsync(new BinaryData(webp), new BlobUploadOptions
            {
                HttpHeaders = new BlobHttpHeaders { ContentType = "image/webp" },
            }, cancellationToken);
            return;
        }

        // SetMetadata replaces the whole set, so the owner is carried over.
        metadata[PhotoStorage.StatusMetadata] = PhotoStorage.RejectedStatus;
        metadata[PhotoStorage.ReasonMetadata] = result.RejectionReason!;
        await upload.SetMetadataAsync(metadata, cancellationToken: cancellationToken);
    }
}
