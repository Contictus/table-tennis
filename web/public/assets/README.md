# Blender asset pipeline

The MVP currently ships with generated low-poly `.glb` assets. Replace them with
final Blender exports and keep their public paths in `manifest.json`:

```json
{
  "version": 1,
  "assets": {
    "table": "/assets/table.glb",
    "net": "/assets/net.glb",
    "paddleHome": "/assets/paddle-home.glb",
    "paddleAway": "/assets/paddle-away.glb",
    "ball": "/assets/ball.glb"
  }
}
```

Supported keys are `table`, `net`, `paddleHome`, `paddleAway` and `ball`. The runtime normalizes
each model into the game coordinate system and keeps the procedural placeholder
when a key is missing or its model cannot be loaded.

Recommended Blender export settings:

- Format: glTF Binary (`.glb`)
- Include: Selected Objects
- Transform: +Y Up
- Geometry: Apply Modifiers
- Compression: leave disabled for the first prototype export
