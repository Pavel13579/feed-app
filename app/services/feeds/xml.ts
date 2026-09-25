export function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return char;
    }
  });
}

export function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

export function tag(name: string, value: string | null | undefined): string | null {
  if (!value) return null;
  return `<${name}>${escapeXml(value)}</${name}>`;
}

export function cdataTag(name: string, value: string | null | undefined): string | null {
  if (!value) return null;
  return `<${name}>${cdata(value)}</${name}>`;
}