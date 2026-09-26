using System.Linq.Expressions;

namespace Airbnb.Modules.Services;

// Wire shape of the frontend's Service type.
internal sealed record ServiceDto(
    string Id,
    string Title,
    string Provider,
    string ServiceCategory,
    IReadOnlyList<string> Photos,
    decimal Price,
    decimal Rating,
    int ReviewCount,
    string City,
    string Description)
{
    public static readonly Expression<Func<Service, ServiceDto>> Projection = s => new ServiceDto(
        s.Id, s.Title, s.Provider, s.ServiceCategory, s.Photos, s.Price, s.Rating, s.ReviewCount, s.City, s.Description);
}
