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
  description: string;
  propertyType: string;
  maxGuests: number;
  bedrooms: number;
  beds: number;
  baths: number;
  amenities: string[];
}

export interface Host {
  id: string;
  name: string;
  avatar: string;
  isSuperhost: boolean;
  responseRate: number;
  joinedYear: number;
}

export interface Review {
  id: string;
  listingId: string;
  authorName: string;
  authorAvatar: string;
  date: string;
  rating: number;
  body: string;
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

export interface Experience {
  id: string;
  title: string;
  location: { city: string; country: string; lat: number; lng: number };
  photos: string[];
  pricePerPerson: number;
  durationHours: number;
  rating: number;
  reviewCount: number;
  isNew: boolean;
  hostId: string;
  category: string;
  description: string;
}

export interface Service {
  id: string;
  title: string;
  provider: string;
  serviceCategory: string;
  photos: string[];
  price: number;
  rating: number;
  reviewCount: number;
  city: string;
  description: string;
}

export const EXPERIENCE_CATEGORIES = [
  "All",
  "Food & drink",
  "Art & culture",
  "Nature",
  "Sports",
  "Wellness",
] as const;

export type ExperienceCategory = (typeof EXPERIENCE_CATEGORIES)[number];

export const SERVICE_CATEGORIES = [
  "All",
  "Photography",
  "Chefs",
  "Massage",
  "Training",
  "Hair & makeup",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
