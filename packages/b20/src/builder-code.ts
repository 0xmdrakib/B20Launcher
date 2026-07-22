import { concatHex, isHex, stringToHex, type Hex } from "viem";

const BUILDER_CODE_PATTERN = /^[a-z0-9_]{1,32}$/;
const ERC_8021_MARKER = "0x80218021802180218021802180218021" as Hex;

export function assertBuilderCode(code: string): string {
  if (!BUILDER_CODE_PATTERN.test(code)) {
    throw new Error(
      "Builder Code must match ^[a-z0-9_]{1,32}$: lowercase letters, digits, and underscores only."
    );
  }
  return code;
}

export function encodeBuilderCodeDataSuffix(code: string): Hex {
  const normalized = assertBuilderCode(code);
  const codeHex = stringToHex(normalized);
  const byteLength = (codeHex.length - 2) / 2;
  const lengthByte = `0x${byteLength.toString(16).padStart(2, "0")}` as Hex;
  return concatHex([lengthByte, codeHex, "0x00", ERC_8021_MARKER]);
}

export function appendBuilderCodeSuffix(data: Hex, code?: string): Hex {
  if (!code) return data;
  if (!isHex(data)) throw new Error("Transaction data must be hex");
  return concatHex([data, encodeBuilderCodeDataSuffix(code)]);
}

export function hasErc8021Marker(data: Hex): boolean {
  return data.toLowerCase().endsWith(ERC_8021_MARKER.toLowerCase().slice(2));
}

export const BUILDER_CODE_REGEX = BUILDER_CODE_PATTERN;
export const ERC8021_MARKER = ERC_8021_MARKER;
