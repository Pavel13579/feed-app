export function parseNumericId(gid: string | null | undefined): string | null {
  if (!gid) return null;
  const last = gid.split("/").pop();
  return last && /^\d+$/.test(last) ? last : null;
}

export function adminProductUrl(shopDomain: string, productGid: string): string | null {
  const numericId = parseNumericId(productGid);
  return numericId ? `https://${shopDomain}/admin/products/${numericId}` : null;
}