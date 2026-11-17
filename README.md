# Nyontra SDKs

Official client SDKs for the Nyontra network. All SDKs implement the same
contract against the public gateway at **https://api.nyontra.com**:

- **Local key management** — secp256k1 keypairs; your private key never leaves
  your machine.
- **Canonical transaction signing** — byte-for-byte parity with the core chain
  signer (`core/src/lib/signature.ts`), EIP-191 personal messages.
- **HTTP client** — `POST` signed transactions to the gateway
  (`/core/v1/tx/broadcast`) and query accounts, balances, and history.



## Available languages

| Language | Package | Status |
|---|---|---|
| JavaScript / TypeScript | [`js/`](./js/) | ✅ v0.1.0 |
| Python | _planned_ | — |
| Go | _planned_ | — |

## JavaScript / TypeScript

```bash
npm install @nyontra/sdk
```

```ts
import { Account, NyontraClient } from "@nyontra/sdk";

const account = Account.generate();
const client = new NyontraClient({ gatewayUrl: "https://api.nyontra.com" });

await client.transfer(account, {
  to: "0x2222222222222222222222222222222222222222",
  amount: 100,
});
```

Full guide: [js/README.md](./js/README.md)
and [docs/sdk.mdx](../docs/sdk.mdx).