# `desktop/build/` — packaging assets

This folder holds the icon assets that **electron-builder** embeds into native
installers (`.dmg`, `.exe`, `.AppImage`). electron-builder reads them via the
`icon:` paths in [`../electron-builder.yml`](../electron-builder.yml).

## Icon files needed

| File | Platform | Minimum size | Notes |
| --- | --- | --- | --- |
| `icon.icns` | macOS (`dmg`, `zip`) | 512×512 px (recommend a 1024×1024 master) | Apple icon set. Should contain multiple resolutions (16, 32, 64, 128, 256, 512, 1024). |
| `icon.ico` | Windows (`nsis`) | 256×256 px | Multi-resolution `.ico` (16/32/48/64/128/256) looks crispest in Explorer / taskbar. |
| `icon.png` | Linux (`AppImage`) + system tray | 512×512 px | PNG with alpha. Also used as the fallback tray icon by `main.cjs`. |

Source the icons from a single 1024×1024 master PNG and convert:

```sh
# .icns (mac) — from a 1024×1024 png named icon_1024.png
npx icon-gen -i icon_1024.png -o . -m icns   # or use `iconutil`

# .ico (windows)
npx icon-gen -i icon_1024.png -o . -m ico

# .png — just downscale the master to 512×512
```

## Until icons are provided

electron-builder ships with a **default Electron icon** and will use it when the
files above are missing, so packaging works out of the box. The generated
installers will simply show the generic Electron icon, not CompanyBrain
branding. Drop the real assets here before publishing a release.

The macOS `.icns` is also what the Dock, Spotlight, and the `.app` bundle badge
use — branded icons matter most on Mac. The tray icon (`main.cjs` `createTray`)
reads `build/icon.png` directly at runtime; an empty/missing icon there falls
back to a transparent 1×1 tray entry, so provide at least that one for a
usable tray.
