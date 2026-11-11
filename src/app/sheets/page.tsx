import type { Metadata } from "next";
import Link from "next/link";
import { SheetMaker } from "@/components/sheets/SheetMaker";

export const metadata: Metadata = {
  title: "Sticker sheets · CutDesk",
  description: "Pack outlined stickers onto Cricut A4 Print Then Cut sheets for Design Space. Runs in the browser; nothing is uploaded.",
};

/**
 * Cricut Design Space sheets: drop in sticker PNGs, say how many of each, and get
 * transparent 300 DPI sheets that fill Design Space's A4 Print Then Cut area.
 * Stock Cricut machines only cut through Design Space, so this is the path for them;
 * the editor's own print-then-cut export is for open-firmware cutters.
 */
export default function SheetsPage() {
  return (
    <div className="sheets h-full overflow-y-auto bg-bench text-ink">
      <main className="mx-auto max-w-[90rem] space-y-6 px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight">Sticker sheets for Cricut</h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-soft">
              Drop in your outlined stickers and say how many of each. They&apos;re turned and packed by their real shape on Cricut Design Space&apos;s A4 Print
              Then Cut area, with no overlaps, spill onto more sheets as needed, and download as transparent PNGs.
            </p>
          </div>
          <Link href="/" className="btn btn-ghost !py-2 text-sm">
            ← Back to the editor
          </Link>
        </div>
        <SheetMaker />
      </main>
    </div>
  );
}
