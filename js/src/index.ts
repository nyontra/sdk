/**
 * @nyontra/sdk — official Nyontra JavaScript/TypeScript SDK.
 *
 * Local secp256k1 key management + canonical transaction signing (byte-exact
 * parity with the core chain signer) + HTTP client for the public gateway
 * at https://rpc.nyontra.com.
 */

export { Account, type Keypair } from "./account.js";
export {
  buildSignMessage,
  canonicalData,
  type SignableTx,
} from "./signing.js";
export {
  buildTransferTx,
  signTx,
  MAX_DATA_CANONICAL_LENGTH,
  TX_TYPES,
  type CoreTxType,
  type SignedTx,
  type TxInput,
} from "./transaction.js";
export {
  DEFAULT_GATEWAY_URL,
  NyontraApiError,
  NyontraClient,
  type AccountJson,
  type BlockInfo,
  type BroadcastResponse,
  type NyontraClientOptions,
  type Replication,
  type TxLog,
  type TxStatusResponse,
} from "./client.js";