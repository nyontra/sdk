import { describe, expect, it } from "vitest";
import { Account } from "../src/account.js";
import { buildTransferTx, signTx } from "../src/transaction.js";

const BOB = "0x2222222222222222222222222222222222222222";

describe("Account", () => {
  it("generates a random account with mnemonic + 0x address/key", () => {
    const a = Account.generate();
    expect(a.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(a.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(a.mnemonic?.split(" ")).toHaveLength(12);
  });

  it("round-trips via private key and mnemonic", () => {
    const a = Account.generate();
    expect(Account.fromPrivateKey(a.privateKey).address).toBe(a.address);
    expect(Account.fromPrivateKey(a.privateKey.replace(/^0x/, "")).address).toBe(a.address);
    expect(Account.fromMnemonic(a.mnemonic!).address).toBe(a.address);
  });
});

describe("signTx", () => {
  const account = Account.generate();

  it("builds the wire shape (lowercase from/to, timestamp informational)", async () => {
    const signed = await signTx(account, {
      type: "TRANSFER",
      to: BOB.toUpperCase().replace("0X", "0x"),
      amount: 5,
      nonce: 3,
      data: { tag: "x" },
    });
    expect(signed).toMatchObject({
      type: "TRANSFER",
      from: account.address.toLowerCase(),
      to: BOB,
      amount: 5,
      payload: "",
      data: { tag: "x" },
      nonce: 3,
    });
    expect(signed.signature).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(typeof signed.timestamp).toBe("number");
  });

  it("defaults from to the signing account; rejects a mismatched from", async () => {
    const ok = await signTx(account, { type: "UPDATE_NAME", payload: "name", nonce: 1 });
    expect(ok.from).toBe(account.address.toLowerCase());
    await expect(
      signTx(account, { type: "TRANSFER", from: BOB, to: BOB, amount: 1, nonce: 1 }),
    ).rejects.toThrow(/does not match/);
  });

  it("sets to = from for UPDATE_NAME (wallet parity)", async () => {
    const signed = await signTx(account, { type: "UPDATE_NAME", payload: "name", nonce: 2 });
    expect(signed.to).toBe(account.address.toLowerCase());
  });

  it("validates: missing amount for TRANSFER, missing to, bad nonce, bad amount, oversized data", async () => {
    await expect(signTx(account, { type: "TRANSFER", to: BOB, nonce: 0 })).rejects.toThrow(/amount/);
    await expect(signTx(account, { type: "TRANSFER", amount: 1, nonce: 0 })).rejects.toThrow(/to/);
    await expect(
      signTx(account, { type: "TRANSFER", to: BOB, amount: 1, nonce: -1 }),
    ).rejects.toThrow(/nonce/);
    await expect(
      signTx(account, { type: "TRANSFER", to: BOB, amount: 1.5, nonce: 0 }),
    ).rejects.toThrow(/amount/);
    await expect(
      signTx(account, { type: "TRANSFER", to: BOB, amount: 1, nonce: 0, data: "x".repeat(300) }),
    ).rejects.toThrow(/256/);
  });

  it("accepts string amounts", async () => {
    const signed = await signTx(account, { type: "TRANSFER", to: BOB, amount: "1000000", nonce: 9 });
    expect(signed.amount).toBe("1000000");
  });

  it("buildTransferTx produces a TRANSFER input", () => {
    const input = buildTransferTx({ to: BOB, amount: 7, nonce: 1, data: { a: 1 } });
    expect(input).toEqual({ type: "TRANSFER", from: undefined, to: BOB, amount: 7, nonce: 1, data: { a: 1 } });
  });
});