namespace Airbnb.Modules.Identity;

internal static class Emails
{
    // One canonical form for every lookup and insert, so "Ana@Example.com " and "ana@example.com" are one account.
    internal static string Normalize(string email) => email.Trim().ToLowerInvariant();

    // What follows the last "@" of a normalized email: SSO connections are chosen by it.
    internal static string Domain(string email) => email[(email.LastIndexOf('@') + 1)..];
}
