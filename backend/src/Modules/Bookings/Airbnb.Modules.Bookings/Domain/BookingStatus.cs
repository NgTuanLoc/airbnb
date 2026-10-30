namespace Airbnb.Modules.Bookings;

internal static class BookingStatus
{
    // Saved before the payment is taken; it holds the nights until the payment settles.
    internal const string Pending = "pending";
    internal const string Confirmed = "confirmed";
    internal const string Declined = "declined";
    internal const string Cancelled = "cancelled";
}
