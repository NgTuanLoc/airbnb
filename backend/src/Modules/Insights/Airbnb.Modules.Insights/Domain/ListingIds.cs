using System.Text.RegularExpressions;

namespace Airbnb.Modules.Insights;

// The listing ids a view may name: seed listings (l1…) and host listings (hl- + a GUID). The API can't check that a
// host listing exists (they live in the Next server), so this shape and the rate limit are what bound the junk.
internal static partial class ListingIds
{
    // \z, not $: in .NET, $ also matches before a trailing newline.
    [GeneratedRegex(@"^(l[0-9]{1,6}|hl-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\z")]
    private static partial Regex Pattern();

    public static bool IsValid(string id) => Pattern().IsMatch(id);
}
