import type { Listing } from "@/lib/types";
import { HOST_CITIES } from "./options";
import type { HostListingInput } from "./schemas";

/** The Listing a host's input describes: new host listings have no rating or reviews yet. */
export function buildHostListing(id: string, hostId: string, input: HostListingInput, status: "listed" | "unlisted"): Listing {
  const city = HOST_CITIES.find((c) => c.id === input.cityId);
  if (!city) throw new Error(`Unknown city '${input.cityId}'`);
  return {
    id,
    title: input.title,
    location: { city: city.name, country: city.country, lat: city.lat, lng: city.lng },
    photos: [...input.photos],
    pricePerNight: input.pricePerNight,
    rating: 0,
    reviewCount: 0,
    isGuestFavorite: false,
    hostId,
    category: input.category,
    description: input.description,
    propertyType: input.propertyType,
    maxGuests: input.maxGuests,
    bedrooms: input.bedrooms,
    beds: input.beds,
    baths: input.baths,
    amenities: [...input.amenities],
    status,
  };
}

/** The form values for editing an existing host listing. */
export function toHostListingInput(listing: Listing): HostListingInput {
  return {
    title: listing.title,
    description: listing.description,
    propertyType: listing.propertyType,
    category: listing.category,
    cityId: HOST_CITIES.find((c) => c.name === listing.location.city)?.id ?? "",
    maxGuests: listing.maxGuests,
    bedrooms: listing.bedrooms,
    beds: listing.beds,
    baths: listing.baths,
    amenities: [...listing.amenities],
    photos: [...listing.photos],
    pricePerNight: listing.pricePerNight,
  };
}
