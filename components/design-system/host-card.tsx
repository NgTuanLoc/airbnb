import Image from "next/image";
import type { Host } from "@/lib/types";
import { Button } from "./button";

export interface HostCardProps {
  host: Host;
}

export function HostCard({ host }: HostCardProps) {
  return (
    <section className="rounded-md border border-hairline bg-canvas p-6 shadow-airbnb">
      <div className="flex items-center gap-4">
        <span className="relative h-14 w-14 overflow-hidden rounded-full bg-surface-strong">
          <Image src={host.avatar} alt={host.name} fill sizes="56px" className="object-cover" />
        </span>
        <div className="flex flex-col">
          <span className="text-title-md text-ink">Hosted by {host.name}</span>
          {host.isSuperhost && <span className="text-body-sm text-muted">Superhost · Joined {host.joinedYear}</span>}
          {!host.isSuperhost && <span className="text-body-sm text-muted">Joined {host.joinedYear}</span>}
        </div>
      </div>
      <p className="mt-4 text-body-sm text-body">Response rate: {host.responseRate}%</p>
      <div className="mt-4">
        <Button variant="secondary" className="w-full">Contact host</Button>
      </div>
    </section>
  );
}
