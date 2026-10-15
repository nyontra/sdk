# @nyontra/sdk — JavaScript / TypeScript

Official SDK for the [Nyontra network](../../docs/README.md). Local secp256k1
key management, **canonical transaction signing** (byte-exact parity with the
core chain signer), and an HTTP client for the public gateway at
**https://rpc.nyontra.com**.

Works in Node ≥ 18, browsers, and workers (anything with `fetch`).

```bash
npm install @nyontra/sdk ethers
```

(`ethers` is the SDK's only runtime dependency.)

## Quickstart

```ts
import { Account, NyontraClient } from "@nyontra/sdk";

// 1. Keys are generated locally — the private key never leaves your machine.
const account = Account.generate();
console.log(account.address, account.mnemonic); // back these up!

// 2. The gateway needs no API keys: authorization is the tx signature.
const client = new NyontraClient({ gatewayUrl: "https://rpc.nyontra.com" });

// 3. Transfer — nonce fetched automatically, signing local, one POST.
const result = await client.transfer(account, {
  to: "0x2222222222222222222222222222222222222222",
  amount: 100,
  data: { memo: "invoice #42" }, // optional JSON memo, locked into the chain
});
console.log(result.hash, result.replication.quorum);
```

## Accounts (key management)

```ts
const fresh   = Account.generate();               // random + BIP-39 mnemonic
const fromKey = Account.fromPrivateKey("0x...");  // 0x-prefixed (or bare) hex key
const fromPhrase = Account.fromMnemonic("word1 word2 ... word12");

fresh.address;      // EIP-55 checksummed 0x address
fresh.privateKey;   // 0x + 64 hex — keep secret!
fresh.mnemonic;     // phrase or null (raw-key imports)
fresh.export();     // { address, privateKey, mnemonic? }
```

Keys are standard secp256k1/EIP-55 — importable into MetaMask, ethers, viem,
or hardware wallets.

## Transactions

`signTx(account, input)` validates locally, builds the exact canonical
message, signs EIP-191, and returns the wire object core expects:

```ts
import { signTx, buildTransferTx } from "@nyontra/sdk";

const nonce = await client.getNonce(account.address); // must be exact

const signed = await signTx(account, {
  type: "TRANSFER",          // TRANSFER | UPDATE_NAME | SET_PERMISSIONS | governance types
  to: "0x2222...2222",       // required for TRANSFER/SET_PERMISSIONS
  amount: 100,               // non-negative integer (number or string)
  nonce,                     // next account nonce
  data: { any: "json" },     // optional memo, ≤ 256 chars canonical JSON
});
await client.broadcast(signed);
```

Notes:
- `amount` must be an **integer** — use strings for values > 2^53.
- `nonce` must equal the account's current nonce exactly; a `403 "nonce
  mismatch"` means a concurrent tx took the slot — refetch and retry.
- Re-broadcasting the identical signed tx is safe (idempotent on
  `(sender, nonce)`) — retry freely after network timeouts.
- `timestamp` on the signed object is informational only (not signed).

Other tx types use the same helper — e.g. rename:
`signTx(account, { type: "UPDATE_NAME", payload: "new-name", nonce })`.
The canonical message format per type is documented in
[docs/signing.md](../../docs/signing.md).

## Client (HTTP)

```ts
const client = new NyontraClient({
  gatewayUrl: "https://rpc.nyontra.com", // default
  requester: account.address,             // optional X-Nyontra-Requester for reads
});
```

| Method | Gateway endpoint | Notes |
|---|---|---|
| `transfer(account, {to, amount, data?, nonce?})` | `POST /core/v1/tx/broadcast` | fetches nonce → signs → broadcasts |
| `broadcast(signedTx)` | `POST /core/v1/tx/broadcast` | pre-signed tx |
| `getAccount(address)` | `GET /core/v1/account/:address` | includes `nonce`, `balance`, `permissions` |
| `getBalance(address)` | `GET /core/v1/balance/:address` | number |
| `getNonce(address)` | via `GET /core/v1/account/:address` | next tx nonce |
| `getTxStatus(hash)` | `GET /core/v1/tx/status/:hash` | `{status: "confirmed" \| "not_found", data?}` |
| `getHistory(address, {limit?, as?})` | `GET /core/v1/history/:address` | needs self/VIEW_ALL_HISTORY requester |
| `getBlockCurrent()` | `GET /core/v1/block/current` | chain tip |
| `getHealth()` | `GET /core/v1/health` | plain text |

Non-2xx responses throw `NyontraApiError` with `.status` (400 structural,
403 signature/state, 409 retryable race, 501 unknown type) and parsed `.body`.

## Example script

```bash
NYONTRA_PRIVATE_KEY=0x... npx tsx examples/transfer.ts 0xRecipient 100
```

See [`examples/transfer.ts`](./examples/transfer.ts).

## Development

```bash
npm install
npm run build     # tsc → dist/ (ESM + .d.ts)
npm test          # vitest — golden signing vectors + client mocks
npm run typecheck
```

`test/signing.test.ts` pins the canonical message format with golden vectors
derived from `core/src/lib/signature.ts`; signatures are verified with viem
(`verifyMessage`) exactly as core verifies them. Breaking those vectors breaks
production signatures — they are the compatibility contract.

## Links

- Gateway docs: [docs/](../../docs/README.md) — payload schema, signing guide, raw HTTP examples
- All SDKs: [sdk/README.md](../README.md)