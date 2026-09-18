# Blender asset pipeline

The MVP currently ships with generated low-poly `.glb` assets. Replace them with
final Blender exports and keep their public paths in `manifest.json`:

```json
{
  "version": 2,
  "assets": {
    "table": "/assets/improved_table_tennis_assets/table.glb",
    "net": "/assets/improved_table_tennis_assets/net.glb",
    "paddleHome": "/assets/improved_table_tennis_assets/paddle-home.glb",
    "paddleAway": "/assets/improved_table_tennis_assets/paddle-away.glb",
    "ball": "/assets/improved_table_tennis_assets/ball.glb"
  }
}
```

Supported keys are `table`, `net`, `paddleHome`, `paddleAway` and `ball`. The runtime normalizes
each model into the game coordinate system and keeps the procedural placeholder
when a key is missing or its model cannot be loaded.

Current set (`improved_table_tennis_assets`, real-world scale, Y-up):

- `table`: 4.5 x 8.1 top with lines, apron and legs; top surface sits at y=0.
- `net`: base at table level, tape around y=0.43 after normalization.
- `paddle-home`: red rubber faces +Z (camera side), handle points +Y (flipped down at runtime).
- `paddle-away`: black rubber faces +Z, same handle layout.
- `ball`: r=0.16 sphere, normalized to match ball diameter.

Recommended Blender export settings:

- Format: glTF Binary (`.glb`)
- Include: Selected Objects
- Transform: +Y Up
- Geometry: Apply Modifiers
- Compression: leave disabled for the first prototype export
