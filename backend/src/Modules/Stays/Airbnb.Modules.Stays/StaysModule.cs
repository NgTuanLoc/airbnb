using Airbnb.Modules.Stays.Cities;
using Airbnb.Modules.Stays.Contracts;
using Airbnb.Modules.Stays.Data;
using Airbnb.Modules.Stays.Listings;
using Airbnb.SharedKernel.Persistence;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Airbnb.Modules.Stays;

public static class StaysModule
{
    internal const string Schema = "stays";
    internal const string CacheTag = "stays";

    public static IHostApplicationBuilder AddStaysModule(this IHostApplicationBuilder builder)
    {
        builder.AddStaysModuleDatabase();
        // The validation generator only registers request types for AddValidation() calls in this assembly.
        builder.Services.AddValidation();
        builder.Services.AddScoped<SearchListings.Handler>();
        builder.Services.AddScoped<GetListing.Handler>();
        builder.Services.AddScoped<GetCities.Handler>();
        builder.Services.AddScoped<IListingLookup, ListingLookup>();
        builder.Services.AddScoped<IListingReviewStats, ListingReviewStats>();
        return builder;
    }

    public static IHostApplicationBuilder AddStaysModuleDatabase(this IHostApplicationBuilder builder) =>
        builder.AddModuleDbContext<StaysDbContext>(Schema, StaysDbContext.SeedAsync);

    public static IEndpointRouteBuilder MapStaysEndpoints(this IEndpointRouteBuilder api)
    {
        SearchListings.Map(api);
        GetListing.Map(api);
        GetCities.Map(api);
        return api;
    }
}
