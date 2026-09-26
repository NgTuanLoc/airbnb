// Writes the frontend mock data as the backend modules' seed JSON (spec §6), so mock and API modes serve identical data.
// `--check` exits non-zero when the committed seed files differ from a fresh export (CI guard).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cities } from "../lib/data/cities.ts";
import { experiences } from "../lib/data/experiences.ts";
import { hosts } from "../lib/data/hosts.ts";
import { listings } from "../lib/data/listings.ts";
import { reviews } from "../lib/data/reviews.ts";
import { services } from "../lib/data/services.ts";
import { toBackendReviews, withSortOrder } from "./seed/transform.ts";

const modulesDir = fileURLToPath(new URL("../../backend/src/Modules/", import.meta.url));

const seedFiles: Record<string, unknown> = {
  "Stays/Airbnb.Modules.Stays/Data/Seed/listings.json": withSortOrder(listings),
  "Stays/Airbnb.Modules.Stays/Data/Seed/cities.json": withSortOrder(cities),
  "Experiences/Airbnb.Modules.Experiences/Data/Seed/experiences.json": withSortOrder(experiences),
  "Services/Airbnb.Modules.Services/Data/Seed/services.json": withSortOrder(services),
  "Hosts/Airbnb.Modules.Hosts/Data/Seed/hosts.json": hosts,
  "Reviews/Airbnb.Modules.Reviews/Data/Seed/reviews.json": toBackendReviews(reviews, experiences),
};

const check = process.argv.includes("--check");
const stale: string[] = [];

for (const [relativePath, data] of Object.entries(seedFiles)) {
  const target = modulesDir + relativePath;
  const json = `${JSON.stringify(data, null, 2)}\n`;
  if (check) {
    let committed = "";
    try {
      committed = readFileSync(target, "utf8").replace(/\r\n/g, "\n");
    } catch {
      // A missing file counts as stale.
    }
    if (committed !== json) stale.push(relativePath);
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, json);
    console.log(`wrote ${relativePath}`);
  }
}

if (stale.length > 0) {
  console.error(`Seed files differ from the frontend mock data (run \`npm run seed:export\`):\n  ${stale.join("\n  ")}`);
  process.exit(1);
}
