# @nyontra/sdk — JavaScript / TypeScript

Official SDK for the [Nyontra developer portal](../../docs/README.md). Local
secp256k1 key management, canonical transaction signing, and an HTTP client for
the **Nyontra Dev Portal Backend (gateway)** — the single entry point through
which all developer traffic flows.

The gateway authenticates your project with an API key, applies rate limits, and
proxies requests to the Nyontra core network. You never need to talk to the core
directly.

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

// 2. Connect to the dev-portal gateway with your project API key.
//    Get your key from the Dev Portal dashboard (create a project → copy x-api-key).
const client = new NyontraClient({
   gatewayUrl: "https://api.nyontra.com, // your api URL
  apiKey: "nyon_sk_your_api_key_here",   // from the Dev Portal
});

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
message, signs EIP-191, and returns the wire object the gateway forwards to
core:

```ts
import { signTx, buildTransferTx } from "@nyontra/sdk";

const nonce = await client.getNonce(account.address); // must be exact

const signed = await signTx(account, {
  type: "TRANSFER",          // TRANSFER | UPDATE_NAME | SET_PERMISSIONS
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

## Client (HTTP)

```ts
const client = new NyontraClient({
   gatewayUrl: "https://api.nyontra.com, // your api URL
  apiKey: "nyon_sk_your_api_key_here",   // required by api
  requester: account.address,             // optional X-Nyontra-Requester for reads
});
```

| Method | Gateway endpoint | Notes |
|---|---|---|
| `transfer(account, {to, amount, data?, nonce?})` | `POST /api/rest/v1/tx/broadcast` | fetches nonce → signs → broadcasts |
| `broadcast(signedTx)` | `POST /api/rest/v1/tx/broadcast` | pre-signed tx |
| `getAccount(address)` | `GET /api/rest/v1/account/:address` | includes `nonce`, `balance`, `permissions` |
| `getBalance(address)` | `GET /api/rest/v1/balance/:address` | number |
| `getNonce(address)` | via `GET /api/rest/v1/account/:address` | next tx nonce |
| `getTxStatus(hash)` | `GET /api/rest/v1/tx/status/:hash` | `{status: "confirmed" \| "not_found", data?}` |
| `getHistory(address, {limit?, as?})` | `GET /api/rest/v1/history/:address` | needs self/VIEW_ALL_HISTORY requester |
| `getBlockCurrent()` | `GET /api/rest/v1/block/current` | chain tip |
| `getHealth()` | `GET /api/rest/v1/health` | plain text |

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

- Dev Portal (create projects, get API keys): portal
- Gateway backend (API reference, rate limits): api
- Full docs: [docs/](../../docs/README.md)
