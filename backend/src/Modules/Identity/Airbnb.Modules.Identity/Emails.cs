namespace Airbnb.Modules.Identity;

internal static class Emails
{
    // One canonical form for every lookup and insert, so "Ana@Example.com " and "ana@example.com" are one account.
    internal static string Normalize(string email) => email.Trim().ToLowerInvariant();
}
