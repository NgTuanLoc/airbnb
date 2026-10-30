using System.Linq.Expressions;

namespace Airbnb.Modules.Experiences;

// Wire shape of the frontend's Experience type.
internal sealed record ExperienceDto(
    string Id,
    string Title,
    LocationDto Location,
    IReadOnlyList<string> Photos,
    decimal PricePerPerson,
    decimal DurationHours,
    decimal Rating,
    int ReviewCount,
    bool IsNew,
    string HostId,
    string Category,
    string Description)
{
    public static readonly Expression<Func<Experience, ExperienceDto>> Projection = e => new ExperienceDto(
        e.Id,
        e.Title,
        new LocationDto(e.Location.City, e.Location.Country, e.Location.Lat, e.Location.Lng),
        e.Photos,
        e.PricePerPerson,
        e.DurationHours,
        e.Rating,
        e.ReviewCount,
        e.IsNew,
        e.HostId,
        e.Category,
        e.Description);
}

internal sealed record LocationDto(string City, string Country, double Lat, double Lng);
