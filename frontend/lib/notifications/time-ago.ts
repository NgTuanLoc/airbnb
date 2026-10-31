const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** How long ago something happened, for a notification: "Just now", "5 minutes ago", "Yesterday", "3 days ago". */
export function timeAgo(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  const label = relativeLabel(minutes);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function relativeLabel(minutes: number): string {
  if (minutes < 60) return relative.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return relative.format(-hours, "hour");
  return relative.format(-Math.floor(hours / 24), "day");
}
