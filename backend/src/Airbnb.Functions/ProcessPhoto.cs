using Airbnb.Modules.Media.Contracts;
using Azure.Storage.Blobs;
using Microsoft.Azure.Functions.Worker;

namespace Airbnb.Functions;

// Runs for every original the API stores. "blobs" is the Aspire connection name of the storage's blob service.
// Errors other than a rejected photo propagate: the host retries, then moves the blob to the poison queue.
public sealed class ProcessPhoto(BlobServiceClient blobs)
{
    [Function(nameof(ProcessPhoto))]
    public async Task RunAsync(
        [BlobTrigger(PhotoStorage.UploadsContainer + "/{id}", Connection = "blobs")] Stream original,
        string id,
        CancellationToken cancellationToken)
    {
        if (!PhotoStorage.IsPhotoId(id))
        {
            return;
        }
        await new PhotoJob(blobs).RunAsync(id, original, cancellationToken);
    }
}
