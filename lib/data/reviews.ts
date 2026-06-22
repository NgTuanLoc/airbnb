import type { Review } from "@/lib/types";

const avatar = (id: string) => `https://images.unsplash.com/${id}?w=120&q=80`;

const BODIES = [
  "Absolutely stunning place. Spotless, well-stocked, and exactly as pictured. The host was responsive and thoughtful.",
  "A wonderful stay from start to finish. Great location, comfortable beds, and beautiful views every morning.",
  "We didn't want to leave. Cozy, quiet, and full of charming touches. Would book again in a heartbeat.",
  "Perfect getaway. Check-in was seamless and the space felt even better in person. Highly recommend.",
];

const NAMES = ["Sarah", "David", "Priya", "Marco", "Yuki", "Hannah"];

function reviewsFor(listingId: string, count: number, startIndex: number): Review[] {
  return Array.from({ length: count }, (_, i) => {
    const n = startIndex + i;
    return {
      id: `${listingId}-r${i + 1}`,
      listingId,
      authorName: NAMES[n % NAMES.length],
      authorAvatar: avatar(["photo-1438761681033-6461ffad8d80", "photo-1500648767791-00dcc994a43e", "photo-1534528741775-53994a69daeb"][n % 3]),
      date: ["March 2026", "February 2026", "January 2026", "December 2025"][i % 4],
      rating: 5,
      body: BODIES[n % BODIES.length],
    };
  });
}

export const reviews: Review[] = [
  ...reviewsFor("l1", 4, 0),
  ...Array.from({ length: 15 }, (_, i) => reviewsFor(`l${i + 2}`, 2, i)).flat(),
  { id: "re1", listingId: "e1", authorName: "Priya", authorAvatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&q=80", date: "March 2026", rating: 5, body: "The nonna was wonderful and the pasta was unreal. A highlight of the trip." },
  { id: "re2", listingId: "e1", authorName: "Marcus", authorAvatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&q=80", date: "February 2026", rating: 5, body: "Hands-on, warm, and delicious. Booking again next time." },
  { id: "re3", listingId: "e2", authorName: "Sofia", authorAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&q=80", date: "January 2026", rating: 5, body: "The caves at sunrise were magic and our guide was so calm and safe." },
];
