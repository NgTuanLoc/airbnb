export interface Listing {
  id: string;
  title: string;
  location: { city: string; country: string; lat: number; lng: number };
  photos: string[];
  pricePerNight: number;
  rating: number;
  reviewCount: number;
  isGuestFavorite: boolean;
  hostId: string;
  category: string;
}

export interface City {
  id: string;
  name: string;
  subLabel: string;
  image: string;
  listingCount: number;
}

export const CATEGORIES = [
  "All",
  "Cabins",
  "Beachfront",
  "Countryside",
  "Amazing views",
  "Tiny homes",
  "Lakefront",
  "Trending",
] as const;

export type Category = (typeof CATEGORIES)[number];
