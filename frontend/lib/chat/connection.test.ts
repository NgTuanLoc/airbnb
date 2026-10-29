import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const signalr = vi.hoisted(() => {
  const connection = {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    invoke: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    onreconnected: vi.fn(),
    onreconnecting: vi.fn(),
    onclose: vi.fn(),
  };
  const builder = { withUrl: vi.fn(), withAutomaticReconnect: vi.fn(), configureLogging: vi.fn(), build: vi.fn(() => connection) };
  builder.withUrl.mockReturnValue(builder);
  builder.withAutomaticReconnect.mockReturnValue(builder);
  builder.configureLogging.mockReturnValue(builder);
  return { connection, builder };
});
vi.mock("@microsoft/signalr", () => ({
  HubConnectionBuilder: vi.fn(function HubConnectionBuilder() {
    return signalr.builder;
  }),
  HttpTransportType: { WebSockets: 1 },
  LogLevel: { Warning: 3 },
}));

import { connectChat } from "./connection";

const HUB_URL = "http://gateway.test/chat/hub";
const tokenReply = (token: string) => Response.json({ success: true, data: { token, expiresAt: "2030-01-01T00:10:00Z", hubUrl: HUB_URL } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => tokenReply("t1"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

type HubOptions = { transport: number; skipNegotiation: boolean; accessTokenFactory: () => Promise<string> };
const hubOptions = () => signalr.builder.withUrl.mock.calls[0][1] as HubOptions;

describe("connectChat", () => {
  test("connects to the hub the server names, over WebSockets without the negotiate request", async () => {
    await connectChat();

    expect(fetchMock).toHaveBeenCalledWith("/api/chat/token", expect.anything());
    expect(signalr.builder.withUrl).toHaveBeenCalledWith(HUB_URL, expect.objectContaining({ transport: 1, skipNegotiation: true }));
    expect(signalr.builder.withAutomaticReconnect).toHaveBeenCalled();
    expect(signalr.connection.start).toHaveBeenCalled();
  });

  test("listens for every hub event from the start, so none arrives unhandled", async () => {
    await connectChat();

    const events = signalr.connection.on.mock.calls.map(([name]) => name);
    expect(events).toEqual(expect.arrayContaining(["message", "read"]));
  });

  test("reports when the connection drops, comes back, or gives up", async () => {
    const chat = await connectChat();
    const statuses: string[] = [];
    chat.onStatusChange((status) => statuses.push(status));
    const last = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls.at(-1)![0] as (error?: Error) => void;

    last(signalr.connection.onreconnecting)(new Error("lost"));
    last(signalr.connection.onreconnected)();
    last(signalr.connection.onclose)(new Error("gave up"));

    expect(statuses).toEqual(["reconnecting", "connected", "disconnected"]);
  });

  test("fetches a fresh token for each connect after the first", async () => {
    await connectChat();
    fetchMock.mockResolvedValueOnce(tokenReply("t2"));

    expect(await hubOptions().accessTokenFactory()).toBe("t1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await hubOptions().accessTokenFactory()).toBe("t2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("a refused token request rejects with its message", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ success: false, error: "Log in to continue" }, { status: 401 }));

    await expect(connectChat()).rejects.toThrow("Log in to continue");
    expect(signalr.connection.start).not.toHaveBeenCalled();
  });

  test("calls the hub and validates what comes back", async () => {
    const chat = await connectChat();
    const message = { id: "msg_1", conversationId: "cv_1", senderId: "usr_1", text: "Hi", sentAt: "2030-01-01T00:00:00Z" };
    signalr.connection.invoke.mockResolvedValueOnce(message);

    expect(await chat.send("cv_1", "Hi")).toEqual(message);
    expect(signalr.connection.invoke).toHaveBeenCalledWith("Send", "cv_1", "Hi");
  });

  test("a hub error reads as the server's own words", async () => {
    const chat = await connectChat();
    signalr.connection.invoke.mockRejectedValueOnce(
      new Error("An unexpected error occurred invoking 'Send' on the server. HubException: You're sending messages too fast. Wait a moment."),
    );

    await expect(chat.send("cv_1", "Hi")).rejects.toThrow(/^You're sending messages too fast\. Wait a moment\.$/);
  });
});
