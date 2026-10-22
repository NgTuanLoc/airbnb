using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Hosting;

namespace Airbnb.Modules.Media;

// Host photo uploads (spec 2026-10-22): originals and processed photos live in blob storage, which is the module's
// only state, so there is no database and nothing for the MigrationService.
public static class MediaModule
{
    public static IHostApplicationBuilder AddMediaModule(this IHostApplicationBuilder builder)
    {
        builder.AddAzureBlobServiceClient("blobs");
        return builder;
    }

    public static IEndpointRouteBuilder MapMediaEndpoints(this IEndpointRouteBuilder api)
    {
        UploadPhoto.Map(api);
        GetPhotoStatus.Map(api);
        GetPhotoImage.Map(api);
        return api;
    }
}
