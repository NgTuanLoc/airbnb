using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;
using Airbnb.Modules.Media.Contracts;
using Azure.Storage.Blobs;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Airbnb.Api.Tests.Media;

public sealed class PhotoEndpointTests(InfrastructureFixture infrastructure)
{
    private const int TenMegabytes = 10 * 1024 * 1024;
    private static readonly byte[] JpegMagic = [0xFF, 0xD8, 0xFF, 0xE0];

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private WebApplicationFactory<Program> Factory() =>
        new ApiFactory(infrastructure).WithWebHostBuilder(builder => builder.UseSetting("RateLimiting:WritesPerMinute", "1000"));

    private BlobServiceClient Blobs => new(infrastructure.BlobConnectionString);

    private static byte[] Jpeg(int length = 2048)
    {
        var bytes = new byte[length];
        JpegMagic.CopyTo(bytes, 0);
        return bytes;
    }

    private static async Task<HttpResponseMessage> UploadAsync(HttpClient client, string? token, byte[]? file, string fileName = "photo.jpg", string contentType = "image/jpeg")
    {
        var form = new MultipartFormDataContent();
        if (file is not null)
        {
            var part = new ByteArrayContent(file);
            part.Headers.ContentType = new MediaTypeHeaderValue(contentType);
            form.Add(part, "file", fileName);
        }
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/photos") { Content = form };
        if (token is not null) request.Authorized(token);
        return await client.SendAsync(request, Ct);
    }

    private static async Task<HttpResponseMessage> GetAsync(HttpClient client, string path, string? token = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        if (token is not null) request.Authorized(token);
        return await client.SendAsync(request, Ct);
    }

    private static async Task<JsonElement> BodyAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(Ct);

    private static async Task<string> UploadedIdAsync(HttpClient client, string token)
    {
        using var response = await UploadAsync(client, token, Jpeg());
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await BodyAsync(response)).GetProperty("data").GetProperty("id").GetString()!;
    }

    [Fact]
    public async Task Upload_requires_sign_in()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();

        using var response = await UploadAsync(client, token: null, Jpeg());

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Upload_stores_the_original_with_its_owner()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var user = await AuthHelpers.RegisterAsync(client);

        using var response = await UploadAsync(client, user.Token, Jpeg());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var data = (await BodyAsync(response)).GetProperty("data");
        Assert.Equal("pending", data.GetProperty("status").GetString());
        var id = data.GetProperty("id").GetString()!;
        Assert.True(PhotoStorage.IsPhotoId(id));
        var original = Blobs.GetBlobContainerClient(PhotoStorage.UploadsContainer).GetBlobClient(id);
        var properties = await original.GetPropertiesAsync(cancellationToken: Ct);
        Assert.Equal(user.UserId, properties.Value.Metadata[PhotoStorage.OwnerMetadata]);
    }

    [Fact]
    public async Task Exactly_10_MB_is_accepted_and_one_byte_more_is_413()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var user = await AuthHelpers.RegisterAsync(client);

        using var atLimit = await UploadAsync(client, user.Token, Jpeg(TenMegabytes));
        using var overLimit = await UploadAsync(client, user.Token, Jpeg(TenMegabytes + 1));

        Assert.Equal(HttpStatusCode.Created, atLimit.StatusCode);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, overLimit.StatusCode);
        Assert.Equal("photo_too_large", (await BodyAsync(overLimit)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Heic_and_renamed_text_are_415()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var user = await AuthHelpers.RegisterAsync(client);
        byte[] heic = [0x00, 0x00, 0x00, 0x18, .. "ftypheic"u8, 0, 0, 0, 0];

        using var heicResponse = await UploadAsync(client, user.Token, heic, "IMG_0001.HEIC", "image/heic");
        using var textResponse = await UploadAsync(client, user.Token, "just some text, not a photo"u8.ToArray());

        foreach (var response in new[] { heicResponse, textResponse })
        {
            Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
            Assert.Equal("photo_unsupported_type", (await BodyAsync(response)).GetProperty("code").GetString());
        }
    }

    [Fact]
    public async Task Missing_file_is_400()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var user = await AuthHelpers.RegisterAsync(client);

        using var response = await UploadAsync(client, user.Token, file: null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Status_is_owner_only()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var owner = await AuthHelpers.RegisterAsync(client);
        var stranger = await AuthHelpers.RegisterAsync(client);
        var id = await UploadedIdAsync(client, owner.Token);

        using var mine = await GetAsync(client, $"/api/photos/{id}", owner.Token);
        using var theirs = await GetAsync(client, $"/api/photos/{id}", stranger.Token);
        using var malformed = await GetAsync(client, "/api/photos/not-an-id", owner.Token);

        Assert.Equal(HttpStatusCode.OK, mine.StatusCode);
        Assert.Equal("pending", (await BodyAsync(mine)).GetProperty("data").GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.NotFound, theirs.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, malformed.StatusCode);
    }

    [Fact]
    public async Task Image_is_404_until_processed_then_cached()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var owner = await AuthHelpers.RegisterAsync(client);
        var id = await UploadedIdAsync(client, owner.Token);

        using (var pending = await GetAsync(client, $"/api/photos/{id}/image"))
        {
            Assert.Equal(HttpStatusCode.NotFound, pending.StatusCode);
        }

        var photos = Blobs.GetBlobContainerClient(PhotoStorage.PhotosContainer);
        await photos.CreateIfNotExistsAsync(cancellationToken: Ct);
        await photos.GetBlobClient(PhotoStorage.ProcessedBlobName(id)).UploadAsync(new BinaryData("RIFF....WEBP"u8.ToArray()), Ct);

        using var ready = await GetAsync(client, $"/api/photos/{id}/image");
        Assert.Equal(HttpStatusCode.OK, ready.StatusCode);
        Assert.Equal("image/webp", ready.Content.Headers.ContentType?.MediaType);
        Assert.Equal("public, max-age=31536000, immutable", ready.Headers.CacheControl?.ToString());
        Assert.NotNull(ready.Headers.ETag);

        using var status = await GetAsync(client, $"/api/photos/{id}", owner.Token);
        Assert.Equal("ready", (await BodyAsync(status)).GetProperty("data").GetProperty("status").GetString());
    }

    [Fact]
    public async Task Rejected_original_reports_its_reason()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var owner = await AuthHelpers.RegisterAsync(client);
        var id = await UploadedIdAsync(client, owner.Token);
        var original = Blobs.GetBlobContainerClient(PhotoStorage.UploadsContainer).GetBlobClient(id);
        await original.SetMetadataAsync(new Dictionary<string, string>
        {
            [PhotoStorage.OwnerMetadata] = owner.UserId,
            [PhotoStorage.StatusMetadata] = PhotoStorage.RejectedStatus,
            [PhotoStorage.ReasonMetadata] = "too_small",
        }, cancellationToken: Ct);

        using var status = await GetAsync(client, $"/api/photos/{id}", owner.Token);
        using var image = await GetAsync(client, $"/api/photos/{id}/image");

        var data = (await BodyAsync(status)).GetProperty("data");
        Assert.Equal("rejected", data.GetProperty("status").GetString());
        Assert.Equal("too_small", data.GetProperty("reason").GetString());
        Assert.Equal(HttpStatusCode.NotFound, image.StatusCode);
    }
}
