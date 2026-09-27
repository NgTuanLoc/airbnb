using Airbnb.Modules.Reviews.Data;
using Airbnb.SharedKernel.Persistence;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Airbnb.Modules.Reviews;

public static class ReviewsModule
{
    internal const string Schema = "reviews";
    internal const string CacheTag = "reviews";

    public static IHostApplicationBuilder AddReviewsModule(this IHostApplicationBuilder builder)
    {
        builder.AddReviewsModuleDatabase();
        // The validation generator only registers request types for AddValidation() calls in this assembly.
        builder.Services.AddValidation();
        builder.Services.AddScoped<ListReviews.Handler>();
        return builder;
    }

    public static IHostApplicationBuilder AddReviewsModuleDatabase(this IHostApplicationBuilder builder) =>
        builder.AddModuleDbContext<ReviewsDbContext>(Schema, ReviewsDbContext.SeedAsync);

    public static IEndpointRouteBuilder MapReviewsEndpoints(this IEndpointRouteBuilder api)
    {
        ListReviews.Map(api);
        return api;
    }
}
