namespace Airbnb.Modules.Bookings;

// Mirrors frontend/lib/reservation/pricing.ts; BookingPricingTests pins both to the same cases.
internal static class BookingPricing
{
    internal const decimal CleaningFee = 75m;
    internal const decimal ServiceFeeRate = 0.14m;

    internal static (decimal Subtotal, decimal CleaningFee, decimal ServiceFee, decimal Total) Calculate(decimal nightly, int nights)
    {
        var subtotal = nightly * nights;
        var serviceFee = Math.Round(subtotal * ServiceFeeRate, MidpointRounding.AwayFromZero);
        return (subtotal, CleaningFee, serviceFee, subtotal + CleaningFee + serviceFee);
    }
}
