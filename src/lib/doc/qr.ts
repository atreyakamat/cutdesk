/** QR code → a compound cut path of dark-module squares, sized in millimetres. */
import qrcode from "qrcode-generator";

export interface QrResult {
  d: string;
  width: number;
  height: number;
  modules: number;
}

export function qrPath(text: string, opts: { sizeMm?: number; ecc?: "L" | "M" | "Q" | "H" } = {}): QrResult {
  const size = opts.sizeMm && opts.sizeMm > 0 ? opts.sizeMm : 40;
  const qr = qrcode(0, opts.ecc ?? "M");
  qr.addData(text && text.length ? text : " ");
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / n;
  const parts: string[] = [];
  const f = (v: number) => Number(v.toFixed(2));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      const x = c * cell;
      const y = r * cell;
      parts.push(`M${f(x)} ${f(y)}L${f(x + cell)} ${f(y)}L${f(x + cell)} ${f(y + cell)}L${f(x)} ${f(y + cell)}Z`);
    }
  }
  return { d: parts.join(""), width: size, height: size, modules: n };
}
