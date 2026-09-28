import { PHOTO_OPTIONS } from "./options";

/** A valid (untrimmed) host listing body for tests. */
export const validInput = {
  title: "  Sunny cabin by the lake  ",
  description: "A bright cabin with a deck, a fireplace and a view of the water.",
  propertyType: "Entire cabin",
  category: "Cabins",
  cityId: "aspen",
  maxGuests: 4,
  bedrooms: 2,
  beds: 2,
  baths: 1.5,
  amenities: ["Wifi", "Kitchen"],
  photos: [PHOTO_OPTIONS[0], PHOTO_OPTIONS[1]],
  pricePerNight: 180,
};
