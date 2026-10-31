import { currentTraceId } from "./trace";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: { total: number; page: number; limit: number };
  /** A machine-readable reason for a failure the client has to tell apart (e.g. "account_exists"). */
  code?: string;
  /** The request's trace (the x-trace-id header too), to find it in the Aspire dashboard when debugging. */
  traceId?: string;
}

export function ok<T>(data: T, meta?: ApiResponse<T>["meta"]): ApiResponse<T> {
  return { success: true, data, meta, ...traced() };
}

export function fail<T = never>(error: string, code?: string): ApiResponse<T> {
  return { success: false, error, ...(code ? { code } : {}), ...traced() };
}

function traced(): Pick<ApiResponse<never>, "traceId"> {
  const traceId = currentTraceId();
  return traceId ? { traceId } : {};
}
