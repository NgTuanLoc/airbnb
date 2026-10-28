using Airbnb.Modules.Bookings.Data;
using Airbnb.Modules.Bookings.Payments;
using Airbnb.SharedKernel.Persistence;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Airbnb.Modules.Bookings;

public static class BookingsModule
{
    internal const string Schema = "bookings";

    public static IHostApplicationBuilder AddBookingsModule(this IHostApplicationBuilder builder)
    {
        builder.AddBookingsModuleDatabase();
        // The validation generator only registers request types for AddValidation() calls in this assembly.
        builder.Services.AddValidation();
        builder.Services.AddScoped<CreateBooking.Handler>();
        // Bad settings fail at startup: without the key every charge would be refused.
        if (string.IsNullOrEmpty(builder.Configuration["Payments:ServiceKey"]))
        {
            throw new InvalidOperationException("Payments:ServiceKey is required to charge bookings");
        }
        builder.Services.AddHttpClient(PaymentsClient.Name, client => client.BaseAddress = new Uri("http://payments"));
        builder.Services.AddSingleton<PaymentsClient>();
        builder.Services.AddHostedService<PaymentReconciler>();
        return builder;
    }

    public static IHostApplicationBuilder AddBookingsModuleDatabase(this IHostApplicationBuilder builder) =>
        builder.AddModuleDbContext<BookingsDbContext>(Schema, BookingsDbContext.SeedAsync);

    public static IEndpointRouteBuilder MapBookingsEndpoints(this IEndpointRouteBuilder api)
    {
        CreateBooking.Map(api);
        GetAvailability.Map(api);
        ListMyBookings.Map(api);
        ListHosting.Map(api);
        GetBooking.Map(api);
        CancelBooking.Map(api);
        return api;
    }
}
