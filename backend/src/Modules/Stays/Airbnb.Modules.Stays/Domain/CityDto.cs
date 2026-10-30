namespace Airbnb.Modules.Stays.Cities;

// Wire shape of the frontend's City type.
internal sealed record CityDto(string Id, string Name, string SubLabel, string Image, int ListingCount);
