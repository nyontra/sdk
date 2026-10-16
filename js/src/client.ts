/**
 * HTTP client for the public Nyontra gateway (https://rpc.nyontra.com).
 *
 * No API keys: writes are authorized by the transaction signature itself, and
 * permission-checked reads use the optional X-Nyontra-Requester header (self
 * lookup or VIEW_ALL_HISTORY permission). CORS on the gateway is open.
 *
 * Runs anywhere fetch exists (Node ≥ 18, browsers, workers); a custom fetch
 * implementation can be injected for testing or non-standard runtimes.
 */

import type { Account } from "./account.js";
import type { SignedTx } from "./transaction.js";
import { signTx } from "./transaction.js";

/** Default public gateway. */
export const DEFAULT_GATEWAY_URL = "https://rpc.nyontra.com";

export interface NyontraClientOptions {
  /** Gateway base URL. Defaults to https://rpc.nyontra.com */
  gatewayUrl?: string;
  /** Requester address sent as X-Nyontra-Requester on reads (self/auditor checks). */
  requester?: string;
  /** Custom fetch (testing / non-standard runtimes). Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
}

/** Replication report returned with every successful broadcast. */
export interface Replication {
  /** True once primary + majority of ready followers applied the tx. */
  quorum: boolean;
  /** Nodes (primary + followers) that applied at response time. */
  acknowledged: number;
  /** Primary + ready followers expected to apply. */
  expected: number;
  /** Follower node ids that failed at response time. */
  failed: string[];
  /** Followers still catching up in the background. */
  pending: number;
}

/** Success body of POST /core/v1/tx/broadcast. */
export interface BroadcastResponse {
  status: "success";
  /** Chain sequence id assigned by the primary (not client-supplied). */
  id: number;
  /** Chain hash (lowercase hex, no 0x prefix). */
  hash: string;
  replication: Replication;
  /** Present (true) when this was an idempotent confirmation of an already-committed tx. */
  idempotent?: boolean;
}

/** Account JSON from GET /core/v1/account/:address. */
export interface AccountJson {
  address: string;
  name: string | null;
  balance: number;
  /** Permission bitmask (MANAGE_ROLES=1, MINT=2, SET_PRICE=4, API=8, ESCROW_SIGN=16, VIEW_ALL_HISTORY=64, VALIDATOR=256). */
  permissions: number;
  /** Current account nonce — use as the `nonce` of the next transaction. */
  nonce: number;
  history: unknown[];
}

/** TxLog from history/explorer/tx-status endpoints. */
export interface TxLog {
  hash: string;
  type: string;
  from: string;
  to: string;
  amount: number;
  payload: string;
  data?: unknown;
  /** Unix seconds (chain event time). */
  timestamp: number;
}

/** GET /core/v1/tx/status/:hash response. */
export interface TxStatusResponse {
  hash: string;
  status: "confirmed" | "not_found";
  data?: TxLog;
}

/** GET /core/v1/block/current response. */
export interface BlockInfo {
  height: number;
  hash: string;
  /** Unix seconds. */
  time: number;
}

/** Error thrown for any non-2xx gateway response. */
export class NyontraApiError extends Error {
  /** HTTP status code (400 structural, 403 auth/state, 409 retryable race, 501 unknown type). */
  readonly status: number;
  /** Parsed response body: {error: "..."} JSON or raw text. */
  readonly body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    const msg =
      message ??
      (typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : String(body));
    super(`Nyontra gateway error ${status}: ${msg}`);
    this.name = "NyontraApiError";
    this.status = status;
    this.body = body;
  }
}
export class NyontraClient {
  readonly gatewayUrl: string;
  private readonly requester?: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: NyontraClientOptions | string = {}) {
    const opts = typeof options === "string" ? { gatewayUrl: options } : options;
    this.gatewayUrl = (opts.gatewayUrl ?? DEFAULT_GATEWAY_URL).replace(/\/+$/, "");
    this.requester = opts.requester;
    this.fetchFn = opts.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!this.fetchFn) {
      throw new Error("No fetch implementation available — pass one via { fetch }");
    }
  }

  // ---------------------------------------------------------------- reads

  /** GET /core/v1/health — plain-text liveness probe. */
  async getHealth(): Promise<string> {
    return this.text("/core/v1/health", "GET");
  }

  /** GET /core/v1/block/current — latest chain tip {height, hash, time}. */
  getBlockCurrent(): Promise<BlockInfo> {
    return this.json<BlockInfo>("/core/v1/block/current", "GET");
  }

  /** GET /core/v1/account/:address — account state incl. nonce (public). */
  getAccount(address: string): Promise<AccountJson> {
    return this.json<AccountJson>(
      `/core/v1/account/${encodeURIComponent(address.toLowerCase())}`,
      "GET",
    );
  }

  /** GET /core/v1/balance/:address — {balance} (public). */
  async getBalance(address: string): Promise<number> {
    const res = await this.json<{ balance: number }>(
      `/core/v1/balance/${encodeURIComponent(address.toLowerCase())}`,
      "GET",
    );
    return res.balance;
  }

  /**
   * Current nonce for `address` — the value your next transaction must carry.
   * Unknown/unfunded addresses report nonce 0.
   */
  async getNonce(address: string): Promise<number> {
    return (await this.getAccount(address)).nonce;
  }

  /** GET /core/v1/tx/status/:hash — confirmed tx or not_found. */
  getTxStatus(hash: string): Promise<TxStatusResponse> {
    return this.json<TxStatusResponse>(`/core/v1/tx/status/${encodeURIComponent(hash)}`, "GET");
  }

  /**
   * GET /core/v1/history/:address — sender/recipient history.
   * Requires X-Nyontra-Requester: self lookup, or an address with
   * VIEW_ALL_HISTORY (64). Set `requester` on the client (or pass `as`).
   */
  getHistory(address: string, options: { limit?: number; as?: string } = {}): Promise<TxLog[]> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    const qs = params.toString();
    return this.json<TxLog[]>(
      `/core/v1/history/${encodeURIComponent(address.toLowerCase())}${qs ? `?${qs}` : ""}`,
      "GET",
      options.as ?? this.requester,
    );
  }

  // --------------------------------------------------------------- writes

  /**
   * POST /core/v1/tx/broadcast — submit a pre-signed transaction.
   * Retrying the identical signed tx is safe: (sender, nonce) is idempotent.
   */
  broadcast(tx: SignedTx): Promise<BroadcastResponse> {
    return this.json<BroadcastResponse>(
      "/core/v1/tx/broadcast",
      "POST",
      undefined,
      JSON.stringify(tx),
    );
  }

  /**
   * End-to-end transfer: fetch the current nonce (unless given), sign locally,
   * and broadcast. Throws NyontraApiError on rejection — e.g. status 403 with
   * "nonce mismatch" means a concurrent tx took the slot; retry the call.
   */
  async transfer(
    account: Account,
    input: {
      to: string;
      amount: number | string;
      data?: unknown;
      /** Override the nonce (otherwise fetched via GET /core/v1/account/:address). */
      nonce?: number;
    },
  ): Promise<BroadcastResponse> {
    const nonce = input.nonce ?? (await this.getNonce(account.address));
    const signed = await signTx(account, {
      type: "TRANSFER",
      from: account.address,
      to: input.to,
      amount: input.amount,
      nonce,
      data: input.data,
    });
    return this.broadcast(signed);
  }

  // -------------------------------------------------------------- private

  /** Fetch + throw NyontraApiError on non-2xx; returns raw text. */
  private async text(
    path: string,
    method: "GET" | "POST",
    requester?: string,
    body?: string,
  ): Promise<string> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const req = requester ?? this.requester;
    if (req) headers["X-Nyontra-Requester"] = req;

    const res = await this.fetchFn(`${this.gatewayUrl}${path}`, { method, headers, body });
    const text = await res.text();
    if (!res.ok) throw new NyontraApiError(res.status, parseBody(text));
    return text;
  }

  /** Fetch and JSON-parse; gateway error bodies may be JSON or plain text. */
  private async json<T>(
    path: string,
    method: "GET" | "POST",
    requester?: string,
    body?: string,
  ): Promise<T> {
    const text = await this.text(path, method, requester, body);
    if (text === "") return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }
}

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}