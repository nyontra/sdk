/**
 * Transaction construction + signing.
 *
 * A signed tx is the flat JSON object POSTed to /core/v1/tx/broadcast:
 *   { type, from, to, amount, payload, data, nonce, signature, timestamp }
 *
 * The signature covers the canonical message (see signing.ts) — NOT the JSON
 * body — so field order on the wire is irrelevant, but every value that
 * participates in the message (from, to, amount, nonce, data) must be signed
 * exactly as sent. `timestamp` is informational only (not signed, not
 * enforced by core), matching the wallet's wire format.
 */

import type { Account } from "./account.js";
import { buildSignMessage, canonicalData } from "./signing.js";

/** Mirrors core/src/lib/types.ts MAX_DATA_CANONICAL_LENGTH. */
export const MAX_DATA_CANONICAL_LENGTH = 256;

/** Core transaction types (non-governance). Governance types use the default signer format. */
export const TX_TYPES = ["TRANSFER", "UPDATE_NAME", "SET_PERMISSIONS"] as const;
export type CoreTxType = (typeof TX_TYPES)[number];

/** Unsigned transaction input. */
export interface TxInput {
  /** One of TX_TYPES, or a governance type (PROPOSE_MINT, VOTE_PROPOSAL, ...). */
  type: string;
  /** Sender address. Defaults to the signing account's address. */
  from?: string;
  /** Recipient (required for TRANSFER / SET_PERMISSIONS; set to sender for UPDATE_NAME). */
  to?: string;
  /** Non-negative integer amount (number or decimal string). Required for TRANSFER. */
  amount?: number | string;
  /** Free-form string payload (e.g. new display name for UPDATE_NAME, vote choice for VOTE_PROPOSAL). */
  payload?: string;
  /**
   * Next account nonce (the account's current nonce from
   * GET /core/v1/account/:address). Must be exact — see client.transfer()
   * which fetches it for you.
   */
  nonce: number;
  /** Optional developer memo/metadata — any JSON value, ≤ 256 chars canonical. Hashed into the chain. */
  data?: unknown;
}

/** Signed transaction — wire format accepted by POST /core/v1/tx/broadcast. */
export interface SignedTx {
  type: string;
  from: string;
  to: string;
  amount: number | string;
  payload: string;
  data: unknown;
  nonce: number;
  signature: string;
  /** Informational only — not part of the signature; core ignores it. */
  timestamp: number;
}

/** Build an unsigned TRANSFER input. */
export function buildTransferTx(input: {
  to: string;
  amount: number | string;
  nonce: number;
  from?: string;
  data?: unknown;
}): TxInput {
  return {
    type: "TRANSFER",
    from: input.from,
    to: input.to,
    amount: input.amount,
    nonce: input.nonce,
    data: input.data,
  };
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function assertAddress(value: string, field: string): void {
  if (!ADDRESS_RE.test(value)) {
    throw new Error(`${field} must be a 0x-prefixed 20-byte hex address (got "${value}")`);
  }
}

function assertAmount(amount: number | string | undefined, required: boolean): void {
  if (amount === undefined || amount === null) {
    if (required) throw new Error("amount is required for TRANSFER transactions");
    return;
  }
  const ok =
    typeof amount === "number"
      ? Number.isSafeInteger(amount) && amount >= 0
      : /^\d+$/.test(amount);
  if (!ok) {
    throw new Error(`amount must be a non-negative integer (got ${JSON.stringify(amount)})`);
  }
}

/**
 * Sign a transaction with the given account. Validates structure client-side
 * (address format, integer amount, nonce, memo size) so obvious mistakes fail
 * fast with a clear message instead of a 400/403 from the gateway.
 */
export async function signTx(account: Account, tx: TxInput): Promise<SignedTx> {
  const type = String(tx.type || "").toUpperCase();
  if (!type) throw new Error("type is required");

  const from = (tx.from ?? account.address).toLowerCase();
  assertAddress(from, "from");
  if (from !== account.address.toLowerCase()) {
    throw new Error(
      `from (${from}) does not match the signing account (${account.address.toLowerCase()})`,
    );
  }

  const nonce = tx.nonce;
  if (!Number.isSafeInteger(nonce) || nonce < 0) {
    throw new Error(`nonce must be a non-negative integer (got ${JSON.stringify(tx.nonce)})`);
  }

  assertAmount(tx.amount, type === "TRANSFER");

  let to = (tx.to ?? "").toLowerCase();
  if (type === "UPDATE_NAME") {
    to = from; // wallet parity: UPDATE_NAME sets recipient to the sender
  } else if ((type === "TRANSFER" || type === "SET_PERMISSIONS") && !to) {
    throw new Error(`to is required for ${type} transactions`);
  }
  if (to) assertAddress(to, "to");

  if (tx.data !== undefined && tx.data !== null) {
    const len = canonicalData(tx.data).length;
    if (len > MAX_DATA_CANONICAL_LENGTH) {
      throw new Error(
        `data exceeds ${MAX_DATA_CANONICAL_LENGTH} characters (canonical length ${len})`,
      );
    }
  }

  const message = buildSignMessage({
    type,
    from,
    to,
    amount: tx.amount ?? 0,
    payload: tx.payload,
    nonce,
    data: tx.data,
  });
  const signature = await account.signMessage(message);

  return {
    type,
    from,
    to,
    amount: tx.amount ?? 0,
    payload: tx.payload ?? "",
    data: tx.data ?? null,
    nonce,
    signature,
    timestamp: Math.floor(Date.now() / 1000),
  };
}