declare module "ipfs-only-hash" {
  const Hash: {
    of(content: Uint8Array | Buffer | string, options?: { cidVersion?: 0 | 1; rawLeaves?: boolean }): Promise<string>;
  };
  export default Hash;
}
