/**
 * NyontraClient tests against a mocked fetch — verifies request shapes,
 * header behavior, nonce fetching, and error mapping without a network.
 */

import { describe, expect, it } from "vitest";
import { Account } from "../src/account.js";
import { NyontraApiError, NyontraClient } from "../src/client.js";
import { buildSignMessage } from "../src/signing.js";

const GATEWAY = "https://rpc.nyontra.com";
const BOB = "0x2222222222222222222222222222222222222222";

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function mockFetch(
  responder: (req: RecordedRequest) => { status?: number; body: string },
): { fetchImpl: typeof fetch; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req: RecordedRequest = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body as string | undefined,
    };
    const { status = 200, body } = responder(req);
    requests.push(req);
    return new Response(body, { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { fetchImpl, requests };
}

const accountJson = (nonce: number) =>
  JSON.stringify({
    address: "0x1111111111111111111111111111111111111111",
    name: null,
    balance: 1000,
    permissions: 0,
    nonce,
    history: [],
  });

const broadcastOk = JSON.stringify({
  status: "success",
  id: 12,
  hash: "abc123",
  replication: { quorum: true, acknowledged: 2, expected: 2, failed: [], pending: 0 },
});

describe("NyontraClient", () => {
  it("defaults to the public gateway URL and normalizes trailing slashes", () => {
    expect(new NyontraClient().gatewayUrl).toBe(GATEWAY);
    expect(new NyontraClient({ gatewayUrl: "https://x.example/" }).gatewayUrl).toBe(
      "https://x.example",
    );
    expect(new NyontraClient("https://y.example").gatewayUrl).toBe("https://y.example");
  });

  it("transfer(): fetches nonce, signs locally (core-parity message), POSTs the wire shape", async () => {
    const account = Account.generate();
    const { fetchImpl, requests } = mockFetch((req) => {
      if (req.url.includes("/core/v1/account/")) return { body: accountJson(5) };
      if (req.url.includes("/core/v1/tx/broadcast")) return { body: broadcastOk };
      throw new Error(`unexpected ${req.method} ${req.url}`);
    });
    const client = new NyontraClient({ gatewayUrl: GATEWAY, fetch: fetchImpl });

    const res = await client.transfer(account, { to: BOB, amount: 100, data: { ref: 7 } });
    expect(res).toMatchObject({
      status: "success",
      id: 12,
      hash: "abc123",
      replication: { quorum: true },
    });

    const post = requests[1]!;
    expect(post.method).toBe("POST");
    expect(post.url).toBe(`${GATEWAY}/core/v1/tx/broadcast`);
    expect(post.headers["Content-Type"]).toBe("application/json");

    const sent = JSON.parse(post.body!);
    expect(sent).toMatchObject({
      type: "TRANSFER",
      from: account.address.toLowerCase(),
      to: BOB,
      amount: 100,
      nonce: 5,
      data: { ref: 7 },
    });
    expect(sent.signature).toMatch(/^0x/);

    // The signature must recover over the exact core-canonical message.
    expect(buildSignMessage(sent)).toBe(
      `${account.address.toLowerCase()}:${BOB}:100:5:{"ref":7}`,
    );
  });

  it("transfer(): uses an explicit nonce without an account fetch", async () => {
    const account = Account.generate();
    const { fetchImpl, requests } = mockFetch(() => ({ body: broadcastOk }));
    const client = new NyontraClient({ gatewayUrl: GATEWAY, fetch: fetchImpl });
    await client.transfer(account, { to: BOB, amount: 1, nonce: 9 });
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0]!.body!).nonce).toBe(9);
  });

  it("getHistory sends X-Nyontra-Requester from client options", async () => {
    const { fetchImpl, requests } = mockFetch(() => ({ body: "[]" }));
    const client = new NyontraClient({
      gatewayUrl: GATEWAY,
      fetch: fetchImpl,
      requester: BOB,
    });
    await client.getHistory(BOB, { limit: 10 });
    expect(requests[0]!.headers["X-Nyontra-Requester"]).toBe(BOB);
    expect(requests[0]!.url).toContain("?limit=10");
  });

  it("maps JSON and plain-text gateway errors to NyontraApiError with status", async () => {
    const account = Account.generate();
    const { fetchImpl } = mockFetch((req) =>
      req.url.includes("/account/")
        ? { body: accountJson(1) }
        : { status: 403, body: JSON.stringify({ error: "nonce mismatch: expected 2, got 1" }) },
    );
    const client = new NyontraClient({ gatewayUrl: GATEWAY, fetch: fetchImpl });

    const err = await client
      .transfer(account, { to: BOB, amount: 1, nonce: 1 })
      .then(() => null)
      .catch((e: unknown) => e as NyontraApiError);
    expect(err).toBeInstanceOf(NyontraApiError);
    expect(err!.status).toBe(403);
    expect(err!.message).toContain("nonce mismatch");

    const textErrFetch = mockFetch(() => ({ status: 400, body: "Invalid JSON" })).fetchImpl;
    const textErr = await new NyontraClient({ fetch: textErrFetch })
      .getHealth()
      .then(() => null)
      .catch((e: unknown) => e as NyontraApiError);
    expect(textErr).toBeInstanceOf(NyontraApiError);
    expect(textErr!.body).toBe("Invalid JSON");
  });

  it("getHealth returns plain text; getBalance unwraps {balance}", async () => {
    const { fetchImpl } = mockFetch((req) =>
      req.url.includes("/health")
        ? { body: "Nyontra Node Online" }
        : { body: JSON.stringify({ balance: 42 }) },
    );
    const client = new NyontraClient({ fetch: fetchImpl });
    expect(await client.getHealth()).toBe("Nyontra Node Online");
    expect(await client.getBalance(BOB)).toBe(42);
  });
});