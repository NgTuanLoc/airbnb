"use client";

import { useState } from "react";

export interface EarningsCity {
  id: string;
  name: string;
  averagePrice: number;
}

const DEFAULT_NIGHTS = 7;

export function EarningsEstimate({ cities }: { cities: EarningsCity[] }) {
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [nights, setNights] = useState(DEFAULT_NIGHTS);
  const city = cities.find((c) => c.id === cityId);
  const estimate = Math.round((city?.averagePrice ?? 0) * nights);

  return (
    <div className="flex flex-col gap-4 rounded-md border border-hairline p-6 shadow-airbnb">
      <p className="text-body-md text-body">You could earn</p>
      <p className="text-display-xl text-ink">${estimate.toLocaleString("en-US")}</p>
      <p className="text-body-sm text-muted">
        {nights} {nights === 1 ? "night" : "nights"} a month at an average of ${city?.averagePrice ?? 0} a night
      </p>
      <label htmlFor="earnings-nights" className="text-caption text-muted">Nights a month</label>
      <input id="earnings-nights" type="range" min={1} max={30} value={nights} onChange={(e) => setNights(Number(e.target.value))} />
      <label htmlFor="earnings-city" className="text-caption text-muted">City</label>
      <select id="earnings-city" value={cityId} onChange={(e) => setCityId(e.target.value)}
        className="h-12 rounded-sm border border-hairline bg-canvas px-3 text-body-md text-ink">
        {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}
