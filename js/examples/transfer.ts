/**
 * End-to-end example: generate (or import) an account, check balance/nonce,
 * and transfer with an optional JSON memo.
 *
 *   NYONTRA_PRIVATE_KEY=0x... npx tsx examples/transfer.ts 0xRecipient 100
 *
 * Omit NYONTRA_PRIVATE_KEY to generate a throwaway account (its mnemonic is
 * printed once — fund it from a genesis/holder address to make a transfer).
 * The gateway is the public chain endpoint: https://rpc.nyontra.com
 */

import { Account, NyontraClient, NyontraApiError } from "../src/index.js";

const GATEWAY_URL = process.env.NYONTRA_GATEWAY_URL ?? "https://rpc.nyontra.com";

async function main(): Promise<void> {
  const [to, amountArg] = process.argv.slice(2);
  if (!to || !amountArg) {
    console.error("Usage: npx tsx examples/transfer.ts <recipientAddress> <amount>");
    process.exit(1);
  }
  const amount = Number(amountArg);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    console.error("amount must be a positive integer");
    process.exit(1);
  }

  // 1. Account — from env key/mnemonic, or freshly generated.
  let account: Account;
  const phraseOrKey = process.env.NYONTRA_PRIVATE_KEY ?? process.env.NYONTRA_MNEMONIC;
  if (phraseOrKey) {
    account = phraseOrKey.split(" ").length >= 12
      ? Account.fromMnemonic(phraseOrKey)
      : Account.fromPrivateKey(phraseOrKey);
    console.log(`Using account ${account.address}`);
  } else {
    account = Account.generate();
    console.log("Generated throwaway account — back up this mnemonic:");
    console.log(`  address:    ${account.address}`);
    console.log(`  privateKey: ${account.privateKey}`);
    console.log(`  mnemonic:   ${account.mnemonic}`);
  }

  // 2. Read-only chain state (public, no auth).
  const client = new NyontraClient({ gatewayUrl: GATEWAY_URL });
  console.log(`Gateway: ${client.gatewayUrl} — ${(await client.getHealth()).trim()}`);
  const accountState = await client.getAccount(account.address);
  console.log(`Balance: ${accountState.balance} — nonce: ${accountState.nonce}`);
  if (accountState.balance < amount) {
    console.error("Insufficient balance for this transfer.");
    process.exit(1);
  }

  // 3. Transfer — nonce is fetched, signing is local, broadcast is one POST.
  try {
    const result = await client.transfer(account, {
      to,
      amount,
      data: { memo: "example transfer", via: "sdk/js" },
    });
    console.log("Committed:", result);
    const check = await client.getTxStatus(result.hash);
    console.log("Chain status:", check.status);
  } catch (err) {
    if (err instanceof NyontraApiError) {
      console.error(`Rejected (HTTP ${err.status}):`, err.body);
      if (err.status === 403 && String(err.body).includes("nonce")) {
        console.error("Concurrent tx took the nonce slot — retry the script.");
      }
      if (err.status === 403 && String(err.body).includes("insufficient")) {
        console.error("Fund the sending account first.");
      }
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});