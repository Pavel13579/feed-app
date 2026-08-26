export const CURRENCY_EXPONENTS: Record<string, number> = {
  HUF: 0,
  JPY: 0,
  KRW: 0,
  CLP: 0,
  BHD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  USD: 2,
  EUR: 2,
  GBP: 2,
  PLN: 2,
  CZK: 2,
  UAH: 2,
};

export function getCurrencyExponent(currencyCode: string): number {
  const code = currencyCode.toUpperCase();
  return CURRENCY_EXPONENTS[code] ?? 2;
}

export function toMinor(decimalString: string, exponent: number): number {
  const cleanStr = decimalString.trim();
  if (!cleanStr) return 0;

  const parts = cleanStr.split(".");
  const integerPart = parts[0] || "0";
  let fractionPart = parts[1] || "";

  if (exponent === 0) {
    return parseInt(integerPart, 10);
  }

  if (fractionPart.length < exponent) {
    fractionPart = fractionPart.padEnd(exponent, "0");
  } else if (fractionPart.length > exponent) {
    fractionPart = fractionPart.slice(0, exponent);
  }

  const sign = integerPart.startsWith("-") ? -1 : 1;
  const absInteger = integerPart.replace("-", "");

  const combined = `${absInteger}${fractionPart}`;
  return sign * parseInt(combined, 10);
}

export function formatMinor(minor: number, exponent: number): string {
  if (exponent === 0) {
    return Math.round(minor).toString();
  }

  const isNegative = minor < 0;
  const absMinor = Math.abs(Math.round(minor)).toString();

  const padded = absMinor.padStart(exponent + 1, "0");

  const integerPart = padded.slice(0, padded.length - exponent);
  const fractionPart = padded.slice(padded.length - exponent);

  const result = `${integerPart}.${fractionPart}`;
  return isNegative ? `-${result}` : result;
}