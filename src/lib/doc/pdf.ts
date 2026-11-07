/**
 * A tiny single-page PDF that embeds one JPEG, sized to the page in points.
 * Just enough of the PDF format to place a raster faithfully — no dependency.
 * JPEG bytes go in verbatim via the DCTDecode filter, which is why we rasterise
 * the design to a JPEG first (see files.ts).
 */

function fmt(n: number): string {
  return String(Number(n.toFixed(2)));
}

export function jpegToPdf(jpeg: Uint8Array, pxW: number, pxH: number, pageWpt: number, pageHpt: number): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  let length = 0;
  const offsets: number[] = [];
  const push = (data: string | Uint8Array) => {
    const u = typeof data === "string" ? enc.encode(data) : data;
    parts.push(u);
    length += u.length;
  };
  const startObject = () => offsets.push(length);

  push("%PDF-1.4\n%âãÏÓ\n");

  startObject(); // 1: Catalog
  push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  startObject(); // 2: Pages
  push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  startObject(); // 3: Page
  push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(pageWpt)} ${fmt(pageHpt)}] ` +
      `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );

  startObject(); // 4: Image XObject (the JPEG)
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push("\nendstream\nendobj\n");

  startObject(); // 5: Contents — draw the image to fill the page
  const content = `q\n${fmt(pageWpt)} 0 0 ${fmt(pageHpt)} 0 0 cm\n/Im0 Do\nQ\n`;
  push(`5 0 obj\n<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);

  const xrefStart = length;
  const count = offsets.length + 1;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const part of parts) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

/** Millimetres to PDF points (72 per inch). */
export function mmToPt(mm: number): number {
  return (mm / 25.4) * 72;
}
