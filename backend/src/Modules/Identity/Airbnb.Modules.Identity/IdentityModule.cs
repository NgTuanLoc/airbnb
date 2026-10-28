using Airbnb.Modules.Identity.Data;
using Airbnb.Modules.Identity.External;
using Airbnb.SharedKernel.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

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
        builder.AddExternalLogins();
        // Checked here so a bad chat signing key fails the host at startup, not on the first token.
        _ = ChatToken.SigningKey(builder.Configuration);
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
        ListProviders.Map(api);
        StartExternalLogin.Map(api);
        CompleteExternalLogin.Map(api);
        ListConnections.Map(api);
        RemoveConnection.Map(api);
        // Only when chat is on: without a signing key the endpoint doesn't exist (404).
        if (ChatToken.SigningKey(api.ServiceProvider.GetRequiredService<IConfiguration>()) is { } chatKey)
        {
            ChatToken.Map(api, chatKey);
        }
        return api;
    }

    // Google, GitHub and SSO sign-in (OAuth spec §1). Misconfigured providers fail the host at startup.
    private static void AddExternalLogins(this IHostApplicationBuilder builder)
    {
        builder.Services.AddOptions<ExternalLoginOptions>().BindConfiguration(ExternalLoginOptions.SectionName).ValidateOnStart();
        builder.Services.AddSingleton<IValidateOptions<ExternalLoginOptions>, ExternalLoginOptionsValidator>();
        // GitHub's API refuses requests without a User-Agent.
        builder.Services.AddHttpClient(ExternalHttp.ClientName, client => client.DefaultRequestHeaders.UserAgent.ParseAdd("airbnb-clone"));
        builder.Services.AddSingleton<ExternalProviders>();
        builder.Services.AddScoped<StartExternalLogin.Handler>();
        builder.Services.AddScoped<CompleteExternalLogin.Handler>();
    }
}
