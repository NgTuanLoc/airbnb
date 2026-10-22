extern alias functions;

using Airbnb.Api.Tests.Infrastructure;
using Airbnb.Modules.Media.Contracts;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using SkiaSharp;

namespace Airbnb.Api.Tests.Media;

// The function's work against real blob storage (Azurite); the Functions host and its trigger are covered by the
// AppHost smoke test.
public sealed class PhotoJobTests(InfrastructureFixture infrastructure)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private BlobServiceClient Blobs => new(infrastructure.BlobConnectionString);

    private async Task<string> StoreOriginalAsync(byte[] bytes)
    {
        var id = Guid.CreateVersion7().ToString("N");
        var uploads = Blobs.GetBlobContainerClient(PhotoStorage.UploadsContainer);
        await uploads.CreateIfNotExistsAsync(cancellationToken: Ct);
        await uploads.GetBlobClient(id).UploadAsync(new BinaryData(bytes), new BlobUploadOptions
        {
            Metadata = new Dictionary<string, string> { [PhotoStorage.OwnerMetadata] = "u-owner" },
        }, Ct);
        return id;
    }

    private BlobClient Processed(string id) =>
        Blobs.GetBlobContainerClient(PhotoStorage.PhotosContainer).GetBlobClient(PhotoStorage.ProcessedBlobName(id));

    private static byte[] Jpeg(int width, int height)
    {
        using var bitmap = new SKBitmap(width, height);
        bitmap.Erase(SKColors.Coral);
        using var image = SKImage.FromBitmap(bitmap);
        return image.Encode(SKEncodedImageFormat.Jpeg, 90).ToArray();
    }

    [Fact]
    public async Task Valid_photo_writes_the_webp()
    {
        var bytes = Jpeg(800, 600);
        var id = await StoreOriginalAsync(bytes);

        await new functions::Airbnb.Functions.PhotoJob(Blobs).RunAsync(id, new MemoryStream(bytes), Ct);

        var properties = await Processed(id).GetPropertiesAsync(cancellationToken: Ct);
        Assert.Equal("image/webp", properties.Value.ContentType);
    }

    [Fact]
    public async Task Running_twice_is_harmless()
    {
        var bytes = Jpeg(800, 600);
        var id = await StoreOriginalAsync(bytes);
        var job = new functions::Airbnb.Functions.PhotoJob(Blobs);
        await job.RunAsync(id, new MemoryStream(bytes), Ct);
        var first = (await Processed(id).GetPropertiesAsync(cancellationToken: Ct)).Value.ETag;

        await job.RunAsync(id, new MemoryStream(bytes), Ct);

        Assert.Equal(first, (await Processed(id).GetPropertiesAsync(cancellationToken: Ct)).Value.ETag);
    }

    [Fact]
    public async Task Rejected_photo_marks_the_original()
    {
        var bytes = new byte[2048];
        new Random(7).NextBytes(bytes);
        var id = await StoreOriginalAsync(bytes);

        await new functions::Airbnb.Functions.PhotoJob(Blobs).RunAsync(id, new MemoryStream(bytes), Ct);

        var original = Blobs.GetBlobContainerClient(PhotoStorage.UploadsContainer).GetBlobClient(id);
        var metadata = (await original.GetPropertiesAsync(cancellationToken: Ct)).Value.Metadata;
        Assert.Equal(PhotoStorage.RejectedStatus, metadata[PhotoStorage.StatusMetadata]);
        Assert.Equal("not_an_image", metadata[PhotoStorage.ReasonMetadata]);
        Assert.Equal("u-owner", metadata[PhotoStorage.OwnerMetadata]);
        Assert.False(await Processed(id).ExistsAsync(Ct));
    }
}
