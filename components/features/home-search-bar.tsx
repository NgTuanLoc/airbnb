"use client";

import { useRouter } from "next/navigation";
import { SearchBar } from "@/components/design-system";

export function HomeSearchBar() {
  const router = useRouter();
  return <SearchBar onSearch={() => router.push("/s/anywhere")} />;
}
