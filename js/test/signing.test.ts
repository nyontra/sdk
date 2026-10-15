/**
 * Golden vectors for the canonical sign message — these strings are computed
 * by hand from core's documented format (core/src/lib/signature.ts) and must
 * never change. If a refactor breaks these vectors, signatures will break in
 * production (every tx → 403).
 */

import { describe, expect, it } from "vitest";
import { verifyMessage } from "viem";
import { Account } from "../src/account.js";
import { buildSignMessage, canonicalData } from "../src/signing.js";
import { signTx } from "../src/transaction.js";

const ALICE = "0x1111111111111111111111111111111111111111";
const BOB = "0x2222222222222222222222222222222222222222";

describe("buildSignMessage golden vectors", () => {
  it("TRANSFER without data (trailing colon, empty data)", () => {
    expect(
      buildSignMessage({ type: "TRANSFER", from: ALICE, to: BOB, amount: 250, nonce: 4 }),
    ).toBe(`${ALICE}:${BOB}:250:4:`);
  });

  it("TRANSFER with data (canonical JSON appended)", () => {
    expect(
      buildSignMessage({
        type: "TRANSFER",
        from: ALICE,
        to: BOB,
        amount: 100,
        nonce: 0,
        data: { orderId: "abc" },
      }),
    ).toBe(`${ALICE}:${BOB}:100:0:{"orderId":"abc"}`);
  });

  it("UPDATE_NAME (payload in place of recipient/amount)", () => {
    expect(buildSignMessage({ type: "UPDATE_NAME", from: ALICE, payload: "alice", nonce: 5 })).toBe(
      `${ALICE}:alice:5:`,
    );
  });

  it("SET_PERMISSIONS uses the transfer-family format", () => {
    expect(buildSignMessage({ type: "SET_PERMISSIONS", from: ALICE, to: BOB, amount: 0, nonce: 7 })).toBe(
      `${ALICE}:${BOB}:0:7:`,
    );
  });

  it("default family inserts the type (governance)", () => {
    expect(
      buildSignMessage({ type: "VOTE_PROPOSAL", from: ALICE, payload: "1:approve", nonce: 9 }),
    ).toBe(`${ALICE}:VOTE_PROPOSAL:1:approve:9:`);
  });

  it("lowercases addresses and uppercases type defensively", () => {
    const mixed = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
    const lower = mixed.toLowerCase();
    expect(buildSignMessage({ type: "transfer", from: mixed, to: mixed, amount: 1, nonce: 0 })).toBe(
      `${lower}:${lower}:1:0:`,
    );
  });
});

describe("canonicalData", () => {
  it("returns '' for absent/null/undefined", () => {
    expect(canonicalData(undefined)).toBe("");
    expect(canonicalData(null)).toBe("");
  });

  it("sorts object keys recursively, preserves array order", () => {
    expect(canonicalData({ b: 2, a: { z: [3, 1], y: true } })).toBe(
      '{"a":{"y":true,"z":[3,1]},"b":2}',
    );
  });

  it("handles primitives deterministically", () => {
    expect(canonicalData(42)).toBe("42");
    expect(canonicalData(1.5)).toBe("1.5");
    expect(canonicalData("hi \"there\"")).toBe('"hi \\"there\\""');
    expect(canonicalData(false)).toBe("false");
    expect(canonicalData(Number.NaN)).toBe("null");
  });

  it("is key-order independent (deterministic)", () => {
    expect(canonicalData({ x: 1, y: 2 })).toBe(canonicalData({ y: 2, x: 1 }));
  });
});

describe("sign → verify parity (viem, exactly like core)", () => {
  const account = Account.generate();

  it("signed TRANSFER verifies to the signer address via viem verifyMessage", async () => {
    const signed = await signTx(account, {
      type: "TRANSFER",
      to: BOB,
      amount: 100,
      nonce: 0,
      data: { memo: "test" },
    });
    const message = buildSignMessage({
      type: "TRANSFER",
      from: account.address,
      to: BOB,
      amount: 100,
      nonce: 0,
      data: { memo: "test" },
    });
    await expect(
      verifyMessage({
        address: account.address as `0x${string}`,
        message,
        signature: signed.signature as `0x${string}`,
      }),
    ).resolves.toBe(true);
  });

  it("tampering with a covered field breaks verification", async () => {
    const signed = await signTx(account, { type: "TRANSFER", to: BOB, amount: 100, nonce: 1 });
    const tampered = buildSignMessage({
      type: "TRANSFER",
      from: account.address,
      to: BOB,
      amount: 101, // ≠ signed amount
      nonce: 1,
    });
    await expect(
      verifyMessage({
        address: account.address as `0x${string}`,
        message: tampered,
        signature: signed.signature as `0x${string}`,
      }),
    ).resolves.toBe(false);
  });
});