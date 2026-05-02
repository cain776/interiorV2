# SketchUp Bridge

This folder contains a local-only SketchUp Ruby bridge for the 3D model menu.

## Load in SketchUp

Open SketchUp Ruby Console and run:

```ruby
load "C:/workspace/인테리어-v2/tools/sketchup/interior_v2_bridge.rb"
```

The bridge listens on:

```text
http://127.0.0.1:43434/command
```

## Supported commands

```json
{
  "command": "generate_model",
  "payload": {
    "project": {},
    "rooms": []
  }
}
```

The bridge is deliberately small:

- localhost only
- no arbitrary Ruby eval
- allowlisted commands only
- generated rooms are grouped under the active SketchUp model
