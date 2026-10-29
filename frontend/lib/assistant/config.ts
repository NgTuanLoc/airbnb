import "server-only";
import { dataSource } from "@/lib/data-source";

/** The assistant needs the backend and its service: on in api mode once ASSISTANT_HTTP is set. */
export function assistantEnabled(): boolean {
  return dataSource().kind === "api" && Boolean(process.env.ASSISTANT_HTTP);
}
