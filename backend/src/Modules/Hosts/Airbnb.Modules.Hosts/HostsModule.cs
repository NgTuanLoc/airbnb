using Airbnb.Modules.Hosts.Data;
using Airbnb.SharedKernel.Persistence;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Airbnb.Modules.Hosts;

public static class HostsModule
{
    internal const string Schema = "hosts";
    internal const string CacheTag = "hosts";

    public static IHostApplicationBuilder AddHostsModule(this IHostApplicationBuilder builder)
    {
        builder.AddHostsModuleDatabase();
        // The validation generator only registers request types for AddValidation() calls in this assembly.
        builder.Services.AddValidation();
        builder.Services.AddScoped<GetHost.Handler>();
        return builder;
    }

    public static IHostApplicationBuilder AddHostsModuleDatabase(this IHostApplicationBuilder builder) =>
        builder.AddModuleDbContext<HostsDbContext>(Schema, HostsDbContext.SeedAsync);

    public static IEndpointRouteBuilder MapHostsEndpoints(this IEndpointRouteBuilder api)
    {
        GetHost.Map(api);
        return api;
    }
}
