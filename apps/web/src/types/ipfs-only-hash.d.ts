declare module "ipfs-only-hash" {
  const Hash: {
    of(input: Uint8Array | string, options?: { cidVersion?: 0 | 1 }): Promise<string>;
  };
  export default Hash;
}
