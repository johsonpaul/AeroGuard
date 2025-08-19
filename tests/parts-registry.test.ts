import { describe, it, expect, beforeEach } from "vitest";

interface Metadata {
  "serial-number": string;
  manufacturer: string;
  material: string;
  certification: string;
  "manufacture-date": bigint;
  "additional-data"?: Uint8Array | null;
}

interface MockContract {
  admin: string;
  certifier: string;
  paused: boolean;
  lastTokenId: bigint;
  tokenOwners: Map<bigint, string>;
  tokenApprovals: Map<bigint, string>;
  tokenMetadata: Map<bigint, Metadata>;
  serialToToken: Map<string, bigint>;
  MAX_TOKEN_SUPPLY: bigint;

  isAdmin(caller: string): boolean;
  isCertifier(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  transferAdmin(caller: string, newAdmin: string): { value: boolean } | { error: number };
  transferCertifier(caller: string, newCertifier: string): { value: boolean } | { error: number };
  mint(caller: string, recipient: string, metadata: Metadata): { value: bigint } | { error: number };
  burn(caller: string, tokenId: bigint): { value: boolean } | { error: number };
  transfer(caller: string, tokenId: bigint, recipient: string): { value: boolean } | { error: number };
  approve(caller: string, tokenId: bigint, operator: string): { value: boolean } | { error: number };
  revokeApproval(caller: string, tokenId: bigint): { value: boolean } | { error: number };
  getOwner(tokenId: bigint): string | undefined;
  getMetadata(tokenId: bigint): Metadata | undefined;
  getTokenBySerial(serial: string): bigint | undefined;
  verifyPart(tokenId: bigint): boolean;
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  certifier: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  lastTokenId: 0n,
  tokenOwners: new Map<bigint, string>(),
  tokenApprovals: new Map<bigint, string>(),
  tokenMetadata: new Map<bigint, Metadata>(),
  serialToToken: new Map<string, bigint>(),
  MAX_TOKEN_SUPPLY: 1_000_000n,

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  isCertifier(caller: string) {
    return caller === this.certifier;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },

  transferAdmin(caller: string, newAdmin: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (newAdmin === "SP000000000000000000002Q6VF78") return { error: 105 };
    this.admin = newAdmin;
    return { value: true };
  },

  transferCertifier(caller: string, newCertifier: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (newCertifier === "SP000000000000000000002Q6VF78") return { error: 105 };
    this.certifier = newCertifier;
    return { value: true };
  },

  mint(caller: string, recipient: string, metadata: Metadata) {
    if (!this.isCertifier(caller)) return { error: 100 };
    if (this.paused) return { error: 104 };
    if (recipient === "SP000000000000000000002Q6VF78") return { error: 105 };
    // Validate metadata (simplified)
    if (
      metadata["serial-number"].length === 0 ||
      metadata.manufacturer.length === 0 ||
      metadata.material.length === 0 ||
      metadata.certification.length === 0 ||
      metadata["manufacture-date"] <= 0n
    ) {
      return { error: 106 };
    }
    const serial = metadata["serial-number"];
    if (this.serialToToken.has(serial)) return { error: 101 };
    const newTokenId = this.lastTokenId + 1n;
    if (newTokenId > this.MAX_TOKEN_SUPPLY) return { error: 108 };
    this.tokenOwners.set(newTokenId, recipient);
    this.tokenMetadata.set(newTokenId, metadata);
    this.serialToToken.set(serial, newTokenId);
    this.lastTokenId = newTokenId;
    return { value: newTokenId };
  },

  burn(caller: string, tokenId: bigint) {
    const owner = this.tokenOwners.get(tokenId);
    if (!owner) return { error: 102 };
    if (caller !== owner) return { error: 103 };
    if (this.paused) return { error: 104 };
    const serial = this.tokenMetadata.get(tokenId)!["serial-number"];
    this.tokenOwners.delete(tokenId);
    this.tokenMetadata.delete(tokenId);
    this.serialToToken.delete(serial);
    this.tokenApprovals.delete(tokenId);
    return { value: true };
  },

  transfer(caller: string, tokenId: bigint, recipient: string) {
    const owner = this.tokenOwners.get(tokenId);
    if (!owner) return { error: 102 };
    const approved = this.tokenApprovals.get(tokenId) || "SP000000000000000000002Q6VF78";
    if (this.paused) return { error: 104 };
    if (recipient === "SP000000000000000000002Q6VF78") return { error: 105 };
    if (caller !== owner && caller !== approved) return { error: 107 };
    this.tokenOwners.set(tokenId, recipient);
    this.tokenApprovals.delete(tokenId);
    return { value: true };
  },

  approve(caller: string, tokenId: bigint, operator: string) {
    const owner = this.tokenOwners.get(tokenId);
    if (!owner) return { error: 102 };
    if (caller !== owner) return { error: 103 };
    if (operator === "SP000000000000000000002Q6VF78") return { error: 105 };
    this.tokenApprovals.set(tokenId, operator);
    return { value: true };
  },

  revokeApproval(caller: string, tokenId: bigint) {
    const owner = this.tokenOwners.get(tokenId);
    if (!owner) return { error: 102 };
    if (caller !== owner) return { error: 103 };
    this.tokenApprovals.delete(tokenId);
    return { value: true };
  },

  getOwner(tokenId: bigint) {
    return this.tokenOwners.get(tokenId);
  },

  getMetadata(tokenId: bigint) {
    return this.tokenMetadata.get(tokenId);
  },

  getTokenBySerial(serial: string) {
    return this.serialToToken.get(serial);
  },

  verifyPart(tokenId: bigint) {
    return this.tokenMetadata.has(tokenId);
  },
};

describe("AeroGuard Parts Registry Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.certifier = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.lastTokenId = 0n;
    mockContract.tokenOwners = new Map();
    mockContract.tokenApprovals = new Map();
    mockContract.tokenMetadata = new Map();
    mockContract.serialToToken = new Map();
  });

  it("should mint a new part NFT when called by certifier", () => {
    const metadata: Metadata = {
      "serial-number": "ABC123",
      manufacturer: "Boeing",
      material: "Titanium",
      certification: "FAA Approved",
      "manufacture-date": 100n,
      "additional-data": null,
    };
    const result = mockContract.mint(mockContract.certifier, "ST2CY5V39NHDPWSXMW9QDT3tIPqbFsJFDHC5RV563", metadata);
    expect(result).toEqual({ value: 1n });
    expect(mockContract.getOwner(1n)).toBe("ST2CY5V39NHDPWSXMW9QDT3tIPqbFsJFDHC5RV563");
    expect(mockContract.getMetadata(1n)).toEqual(metadata);
    expect(mockContract.getTokenBySerial("ABC123")).toBe(1n);
  });

  it("should prevent minting with duplicate serial", () => {
    const metadata: Metadata = {
      "serial-number": "ABC123",
      manufacturer: "Boeing",
      material: "Titanium",
      certification: "FAA Approved",
      "manufacture-date": 100n,
      "additional-data": null,
    };
    mockContract.mint(mockContract.certifier, "ST2CY5V39NHDPWSXMW9QDT3tIPqbFsJFDHC5RV563", metadata);
    const result = mockContract.mint(mockContract.certifier, "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP", metadata);
    expect(result).toEqual({ error: 101 });
  });

  it("should transfer NFT by owner", () => {
    const metadata: Metadata = {
      "serial-number": "ABC123",
      manufacturer: "Boeing",
      material: "Titanium",
      certification: "FAA Approved",
      "manufacture-date": 100n,
      "additional-data": null,
    };
    mockContract.mint(mockContract.certifier, "ST2CY5V39NHDPWSXMW9QDT3tIPqbFsJFDHC5RV563", metadata);
    const result = mockContract.transfer("ST2CY5V39NHDPWSXMW9QDT3tIPqbFsJFDHC5RV563", 1n, "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP");
    expect(result).toEqual({ value: true });
    expect(mockContract.getOwner(1n)).toBe("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP");
  });

  it("should allow transfer by approved operator", () => {
    const metadata: Metadata = {
      "serial-number": "ABC123",
      manufacturer: "Boeing",
      material: "Titanium",
      certification: "FAA Approved",
      "manufacture-date": 100n,
      "additional-data": null,
    };
    mockContract.mint(mockContract.certifier, "ST2CY5V39NHDPWSXMW9QDT3tIPqbFsJFDHC5RV563", metadata);
    mockContract.approve("ST2CY5V39NHDPWSXMW9QDT3tIPqbFsJFDHC5RV563", 1n, "ST4JTJN52BCHYDRKEP1HFP03A5PWYW2CWFHF3G95");
    const result = mockContract.transfer("ST4JTJN52BCHYDRKEP1HFP03A5PWYW2CWFHF3G95", 1n, "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP");
    expect(result).toEqual({ value: true });
    expect(mockContract.getOwner(1n)).toBe("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP");
  });

  it("should burn NFT by owner", () => {
    const metadata: Metadata = {
      "serial-number": "ABC123",
      manufacturer: "Boeing",
      material: "Titanium",
      certification: "FAA Approved",
      "manufacture-date": 100n,
      "additional-data": null,
    };
    mockContract.mint(mockContract.certifier, "ST2CY5V39NHDPWSXMW9QDT3tIPqbFsJFDHC5RV563", metadata);
    const result = mockContract.burn("ST2CY5V39NHDPWSXMW9QDT3tIPqbFsJFDHC5RV563", 1n);
    expect(result).toEqual({ value: true });
    expect(mockContract.getOwner(1n)).toBeUndefined();
    expect(mockContract.getMetadata(1n)).toBeUndefined();
    expect(mockContract.getTokenBySerial("ABC123")).toBeUndefined();
  });

  it("should not allow actions when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    const metadata: Metadata = {
      "serial-number": "ABC123",
      manufacturer: "Boeing",
      material: "Titanium",
      certification: "FAA Approved",
      "manufacture-date": 100n,
      "additional-data": null,
    };
    const mintResult = mockContract.mint(mockContract.certifier, "ST2CY5V39NHDPWSXMW9QDT3tIPqbFsJFDHC5RV563", metadata);
    expect(mintResult).toEqual({ error: 104 });
  });

  it("should verify part existence", () => {
    const metadata: Metadata = {
      "serial-number": "ABC123",
      manufacturer: "Boeing",
      material: "Titanium",
      certification: "FAA Approved",
      "manufacture-date": 100n,
      "additional-data": null,
    };
    mockContract.mint(mockContract.certifier, "ST2CY5V39NHDPWSXMW9QDT3tIPqbFsJFDHC5RV563", metadata);
    expect(mockContract.verifyPart(1n)).toBe(true);
    expect(mockContract.verifyPart(2n)).toBe(false);
  });
});