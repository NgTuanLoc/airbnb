using Airbnb.Modules.Experiences.Contracts;
using Airbnb.Modules.Experiences.Data;
using Airbnb.SharedKernel.Persistence;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Airbnb.Modules.Experiences;

public static class ExperiencesModule
{
    internal const string Schema = "experiences";
    internal const string CacheTag = "experiences";

    public static IHostApplicationBuilder AddExperiencesModule(this IHostApplicationBuilder builder)
    {
        builder.AddExperiencesModuleDatabase();
        // The validation generator only registers request types for AddValidation() calls in this assembly.
        builder.Services.AddValidation();
        builder.Services.AddScoped<ListExperiences.Handler>();
        builder.Services.AddScoped<GetExperience.Handler>();
        builder.Services.AddScoped<IExperienceLookup, ExperienceLookup>();
        builder.Services.AddScoped<IExperienceReviewStats, ExperienceReviewStats>();
        return builder;
    }

    public static IHostApplicationBuilder AddExperiencesModuleDatabase(this IHostApplicationBuilder builder) =>
        builder.AddModuleDbContext<ExperiencesDbContext>(Schema, ExperiencesDbContext.SeedAsync);

    public static IEndpointRouteBuilder MapExperiencesEndpoints(this IEndpointRouteBuilder api)
    {
        ListExperiences.Map(api);
        GetExperience.Map(api);
        return api;
    }
}
