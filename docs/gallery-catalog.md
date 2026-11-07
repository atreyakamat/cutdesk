# Remote gallery catalog

Point CutDesk's **Gallery → Catalog** tab at a JSON manifest and your whole
library loads in — no bundling, no limit. This is how you get thousands of your
real Stix N Vibes designs into the tool.

## Manifest format

```json
{
  "version": 1,
  "name": "Stix N Vibes",
  "items": [
    { "id": "heart-1", "name": "Heart", "category": "Love", "type": "path",
      "d": "M 30 8 L 52 30 L 30 56 L 8 30 Z", "width": 60, "height": 60 },

    { "id": "logo-1", "name": "Stix logo", "category": "Brand", "type": "image",
      "url": "https://cdn.stixnvibes.com/designs/logo.svg", "width": 80, "height": 40 }
  ]
}
```

Per item:

| field | required | notes |
| --- | --- | --- |
| `id` | yes | unique string |
| `name` | yes | shown on hover, used as the layer name |
| `type` | yes | `"path"` or `"image"` |
| `category` | no | used by search |
| `d` | for `path` | SVG path data, bounding box starting at `(0,0)`, in **mm** |
| `url` | for `image` | absolute URL to a PNG or SVG |
| `width`, `height` | recommended | size in **mm**; images fall back to their natural size scaled to 80 mm |

- **`path`** items drop straight onto the mat as cut lines.
- **`image`** items are fetched and placed as reference images — trace them to cut.

## Hosting requirements

- Serve the manifest and any image URLs with **CORS** enabled
  (`Access-Control-Allow-Origin`). The browser fetches both; image items are read
  into a data URL so they trace cleanly and travel with saved projects, which
  needs CORS.
- Any static host works: an S3/R2 bucket, your shop's API, a plain file.

## Build a manifest from a folder

Don't hand-write the JSON — point the builder at a folder of your art:

```bash
cd scripts && npm install           # once (installs svgpath + bounds)
cd ..
node scripts/build-catalog.mjs \
  --in ./assets \
  --out ./catalog.json \
  --base-url https://cdn.stixnvibes.com/designs \
  --name "Stix N Vibes" \
  --size 60
```

What it does:

- **SVGs → cut-ready `path` items.** Geometry is extracted, moved to a (0,0)
  origin and scaled so the longest side is `--size` mm. Arcs are expanded to
  curves so circles cut as real curves. An SVG that uses `transform=` or has no
  plain geometry falls back to an `image` item instead (safe, never wrong).
- **PNG/JPG/WEBP → `image` items** at `--base-url` + their path (PNG dimensions
  are read automatically). Host those files at that base URL with CORS.
- A **sub-folder name becomes the item's `category`**, so `assets/Love/heart.svg`
  lands in a "Love" category.

Upload the resulting `catalog.json` (and any raster files) to your CORS-enabled
host, then paste its URL into the Catalog tab.

## Try it now

A same-origin sample ships at `public/sample-catalog.json`. In the Catalog tab,
load:

```
/sample-catalog.json
```

(Serve a real library the same way, from your shop, when it's ready.)
