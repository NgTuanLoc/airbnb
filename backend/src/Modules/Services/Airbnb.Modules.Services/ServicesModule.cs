using Airbnb.Modules.Services.Data;
using Airbnb.SharedKernel.Persistence;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Airbnb.Modules.Services;

public static class ServicesModule
{
    internal const string Schema = "services";
    internal const string CacheTag = "services";

    public static IHostApplicationBuilder AddServicesModule(this IHostApplicationBuilder builder)
    {
        builder.AddServicesModuleDatabase();
        // The validation generator only registers request types for AddValidation() calls in this assembly.
        builder.Services.AddValidation();
        builder.Services.AddScoped<ListServices.Handler>();
        builder.Services.AddScoped<GetService.Handler>();
        return builder;
    }

    public static IHostApplicationBuilder AddServicesModuleDatabase(this IHostApplicationBuilder builder) =>
        builder.AddModuleDbContext<ServicesDbContext>(Schema, ServicesDbContext.SeedAsync);

    public static IEndpointRouteBuilder MapServicesEndpoints(this IEndpointRouteBuilder api)
    {
        ListServices.Map(api);
        GetService.Map(api);
        return api;
    }
}
