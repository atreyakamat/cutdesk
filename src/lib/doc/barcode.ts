/**
 * Code 39 barcode → a compound cut path of bars, in millimetres. Code 39 is
 * self-checking and the pattern table is a well-known standard; each character
 * is 9 elements (bar/space, starting with a bar) of which exactly 3 are wide.
 */

export interface BarcodeResult {
  d: string;
  width: number;
  height: number;
  text: string;
}

// 1 = wide element, 0 = narrow. Order: bar space bar space bar space bar space bar.
export const CODE39: Record<string, string> = {
  "0": "000110100", "1": "100100001", "2": "001100001", "3": "101100000", "4": "000110001",
  "5": "100110000", "6": "001110000", "7": "000100101", "8": "100100100", "9": "001100100",
  A: "100001001", B: "001001001", C: "101001000", D: "000011001", E: "100011000",
  F: "001011000", G: "000001101", H: "100001100", I: "001001100", J: "000011100",
  K: "100000011", L: "001000011", M: "101000010", N: "000010011", O: "100010010",
  P: "001010010", Q: "000000111", R: "100000110", S: "001000110", T: "000010110",
  U: "110000001", V: "011000001", W: "111000000", X: "010010001", Y: "110010000",
  Z: "011010000", "-": "010000101", ".": "110000100", " ": "011000100", $: "010101000",
  "/": "010100010", "+": "010001010", "%": "000101010", "*": "010010100",
};

export function code39Path(input: string, opts: { heightMm?: number; narrowMm?: number } = {}): BarcodeResult {
  const height = opts.heightMm && opts.heightMm > 0 ? opts.heightMm : 20;
  const narrow = opts.narrowMm && opts.narrowMm > 0 ? opts.narrowMm : 0.5;
  const wide = narrow * 3;

  const clean = [...(input ?? "").toUpperCase()].filter((c) => c in CODE39 && c !== "*").join("");
  const chars = `*${clean}*`; // start/stop guard

  const parts: string[] = [];
  const f = (v: number) => Number(v.toFixed(2));
  let x = 0;
  for (const ch of chars) {
    const pat = CODE39[ch];
    for (let i = 0; i < 9; i++) {
      const w = pat[i] === "1" ? wide : narrow;
      if (i % 2 === 0) {
        // even elements are bars
        parts.push(`M${f(x)} 0L${f(x + w)} 0L${f(x + w)} ${f(height)}L${f(x)} ${f(height)}Z`);
      }
      x += w;
    }
    x += narrow; // inter-character gap
  }
  return { d: parts.join(""), width: f(x - narrow), height, text: clean };
}
