/**
 * Canonical message builder — EXACT mirror of the core chain signer:
 *   core/src/lib/signature.ts  (buildSignMessage)
 *   core/src/lib/hash.ts       (canonicalData / stableStringify)
 *
 * The signature this SDK produces MUST byte-for-byte match the string core
 * reconstructs before verifying (viem verifyMessage = EIP-191), or every tx
 * is rejected with 403 "signature verification failed".
 *
 * Message formats (all address parts lowercased, colon-separated):
 *   UPDATE_NAME:                "{from}:{payload}:{nonce}:{data}"
 *   TRANSFER / SET_PERMISSIONS: "{from}:{to}:{amount}:{nonce}:{data}"
 *   default (governance family): "{from}:{type}:{payload}:{nonce}:{data}"
 *
 * `data` is the deterministic canonical JSON of the optional memo field
 * ("" when absent/null), matching the hash chain so the sender commits to it.
 */

/** Minimal tx shape needed to build the canonical message. */
export interface SignableTx {
  type: string;
  from: string;
  to?: string;
  amount?: number | string;
  payload?: string;
  nonce: number;
  /** Optional developer memo/metadata (any JSON value). */
  data?: unknown;
}

/**
 * Deterministic JSON serialization: object keys sorted recursively, arrays in
 * order, strings JSON-escaped, non-finite numbers → "null".
 */
function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    return Number.isFinite(value) ? JSON.stringify(value) : "null";
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
  }
  return "null";
}

/** Deterministic canonical serialization of the optional `data` field ("": absent). */
export function canonicalData(value: unknown): string {
  if (value === undefined || value === null) return "";
  return stableStringify(value);
}

/** Build the exact message core verifies for a given transaction. */
export function buildSignMessage(tx: SignableTx): string {
  const from = String(tx.from || "").toLowerCase();
  const type = String(tx.type || "").toUpperCase();
  const payload = tx.payload ?? "";
  const nonce = tx.nonce ?? 0;
  const data = canonicalData(tx.data);

  switch (type) {
    case "UPDATE_NAME":
      return `${from}:${payload}:${nonce}:${data}`;
    case "TRANSFER":
    case "SET_PERMISSIONS":
      return `${from}:${String(tx.to ?? "").toLowerCase()}:${tx.amount ?? 0}:${nonce}:${data}`;
    default:
      return `${from}:${type}:${payload}:${nonce}:${data}`;
  }
}