# Asset tools

`create_blender_assets.py` regenerates the low-poly fallback `.glb` files under
`web/public/assets/` from Blender primitives (table, net, home/away paddles,
ball). It needs Blender with its bundled Python:

```powershell
blender --background --python tools/create_blender_assets.py
```

The script also refreshes `tools/last_asset_source.blend` as an editing
starting point. The curated `improved_table_tennis_assets/` set is versioned
separately and selected via `web/public/assets/manifest.json`.
