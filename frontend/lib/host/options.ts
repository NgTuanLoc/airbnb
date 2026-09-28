import { listings } from "@/lib/data/listings";
import { CATEGORIES } from "@/lib/types";

export const HOST_LISTING_ID_PREFIX = "hl-";
export const MAX_PHOTOS = 5;

export const PROPERTY_TYPES = [
  "Entire home", "Entire cabin", "Entire villa", "Entire apartment", "Entire cottage", "Tiny home", "Private room",
] as const;

export const HOST_CATEGORIES: string[] = CATEGORIES.filter((category) => category !== "All");

export const AMENITY_OPTIONS = [
  "Wifi", "Kitchen", "Free parking", "Self check-in", "Air conditioning", "Washer", "Pool", "Hot tub", "Workspace", "Pets allowed",
] as const;

// The seed listings' cover photos: all on images.unsplash.com, which next.config.ts allows for next/image.
export const PHOTO_OPTIONS: readonly string[] = [...new Set(listings.map((listing) => listing.photos[0]))].slice(0, 12);

export interface HostCity {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
}

// The six cities the site knows, with coordinates so host listings get a map pin without geocoding.
export const HOST_CITIES: readonly HostCity[] = [
  { id: "wilmington", name: "Wilmington", country: "USA", lat: 34.22, lng: -77.94 },
  { id: "athens", name: "Athens", country: "Greece", lat: 37.98, lng: 23.72 },
  { id: "aspen", name: "Aspen", country: "USA", lat: 39.19, lng: -106.82 },
  { id: "malibu", name: "Malibu", country: "USA", lat: 34.03, lng: -118.69 },
  { id: "kyoto", name: "Kyoto", country: "Japan", lat: 35.01, lng: 135.77 },
  { id: "lisbon", name: "Lisbon", country: "Portugal", lat: 38.72, lng: -9.14 },
];

export const DEFAULT_HOST_AVATAR = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80";
