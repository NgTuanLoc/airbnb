import {
  Wifi,
  Utensils,
  SquareParking,
  KeyRound,
  AirVent,
  WashingMachine,
  LayoutGrid,
  TreePine,
  Waves,
  Wheat,
  Mountain,
  House,
  Sailboat,
  Flame,
  UtensilsCrossed,
  Palette,
  Leaf,
  Dumbbell,
  Sparkles,
  Camera,
  ChefHat,
  HandHeart,
  Scissors,
  Circle,
  type LucideIcon,
} from "lucide-react";

const AMENITY_ICONS: Record<string, LucideIcon> = {
  Wifi,
  Kitchen: Utensils,
  "Free parking": SquareParking,
  "Self check-in": KeyRound,
  "Air conditioning": AirVent,
  Washer: WashingMachine,
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  // Homes
  All: LayoutGrid,
  Cabins: TreePine,
  Beachfront: Waves,
  Countryside: Wheat,
  "Amazing views": Mountain,
  "Tiny homes": House,
  Lakefront: Sailboat,
  Trending: Flame,
  // Experiences
  "Food & drink": UtensilsCrossed,
  "Art & culture": Palette,
  Nature: Leaf,
  Sports: Dumbbell,
  Wellness: Sparkles,
  // Services
  Photography: Camera,
  Chefs: ChefHat,
  Massage: HandHeart,
  Training: Dumbbell,
  "Hair & makeup": Scissors,
};

export function getAmenityIcon(name: string): LucideIcon {
  return AMENITY_ICONS[name] ?? Circle;
}

export function getCategoryIcon(name: string): LucideIcon {
  return CATEGORY_ICONS[name] ?? Circle;
}
