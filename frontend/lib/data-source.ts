export type DataSource = { kind: "mock" } | { kind: "api"; baseUrl: string };

/** The server-only DATA_SOURCE switch (mock by default), shared by the repositories and the auth gateway. Reads the env on every call. */
export function dataSource(): DataSource {
  const source = process.env.DATA_SOURCE || "mock";
  if (source === "mock") return { kind: "mock" };
  if (source !== "api") throw new Error(`DATA_SOURCE must be "mock" or "api", got "${source}"`);
  const baseUrl = process.env.API_HTTP;
  if (!baseUrl) throw new Error("DATA_SOURCE=api needs API_HTTP, the backend base URL (Aspire sets it)");
  return { kind: "api", baseUrl };
}
