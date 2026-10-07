using Airbnb.Modules.Identity.Data;
using Airbnb.SharedKernel.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
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
        builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
        builder.Services.AddMemoryCache();
        builder.Services.AddSingleton<LoginThrottle>();
        builder.Services.AddScoped<Register.Handler>();
        builder.Services.AddScoped<Login.Handler>();
        builder.Services
            .AddAuthentication(SessionAuthentication.Scheme)
            .AddScheme<AuthenticationSchemeOptions, SessionAuthenticationHandler>(SessionAuthentication.Scheme, configureOptions: null);
        builder.Services.AddAuthorization();
        return builder;
    }

    public static IHostApplicationBuilder AddIdentityModuleDatabase(this IHostApplicationBuilder builder) =>
        builder.AddModuleDbContext<IdentityDbContext>(Schema, IdentityDbContext.SeedAsync);

    public static IEndpointRouteBuilder MapIdentityEndpoints(this IEndpointRouteBuilder api)
    {
        Register.Map(api);
        Login.Map(api);
        Logout.Map(api);
        Me.Map(api);
        return api;
    }
}
