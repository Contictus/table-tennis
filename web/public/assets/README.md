# Blender asset pipeline

Export static Blender models as `.glb` files into this directory and register
their public paths in `manifest.json`:

```json
{
  "version": 1,
  "assets": {
    "table": "/assets/table.glb",
    "net": "/assets/net.glb",
    "paddle": "/assets/paddle.glb",
    "ball": "/assets/ball.glb"
  }
}
```

Supported keys are `table`, `net`, `paddle` and `ball`. The runtime normalizes
each model into the game coordinate system and keeps the procedural placeholder
when a key is missing or its model cannot be loaded.

Recommended Blender export settings:

- Format: glTF Binary (`.glb`)
- Include: Selected Objects
- Transform: +Y Up
- Geometry: Apply Modifiers
- Compression: leave disabled for the first prototype export
