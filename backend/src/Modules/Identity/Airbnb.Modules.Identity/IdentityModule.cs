using Airbnb.Modules.Identity.Data;
using Airbnb.SharedKernel.Persistence;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Airbnb.Modules.Identity;

public static class IdentityModule
{
    internal const string Schema = "identity";

    public static IHostApplicationBuilder AddIdentityModule(this IHostApplicationBuilder builder)
    {
        builder.AddIdentityModuleDatabase();
        // The validation generator only registers request types for AddValidation() calls in this assembly.
        builder.Services.AddValidation();
        return builder;
    }

    public static IHostApplicationBuilder AddIdentityModuleDatabase(this IHostApplicationBuilder builder) =>
        builder.AddModuleDbContext<IdentityDbContext>(Schema, IdentityDbContext.SeedAsync);

    public static IEndpointRouteBuilder MapIdentityEndpoints(this IEndpointRouteBuilder api) => api;
}
