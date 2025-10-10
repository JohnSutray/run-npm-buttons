# Run NPM Buttons

Run NPM Buttons is a VS Code / Cursor extension that provides quick access to your most used npm scripts directly from the status bar.  
It remembers which scripts you have executed in the current workspace and creates a persistent toolbar for them.

## Features

- Adds compact buttons in the status bar for npm scripts.
- Scripts appear only after they have been executed at least once (workspace history).
- Supports monorepos: sub-packages show scripts using `folderName:scriptName`.
- Tracks script state:
  - idle → play icon
  - running → spinner animation, automatically reset when finished
- Works both when you start scripts from the extension or from the built-in *NPM Scripts Explorer*.

## Installation

From Open VSX (recommended for Cursor/VSCodium):  
[https://open-vsx.org/extension/johnsutray/run-npm-buttons](https://open-vsx.org/extension/johnsutray/run-npm-buttons)

From VS Code Marketplace:  
[https://marketplace.visualstudio.com/items?itemName=johnsutray.run-npm-buttons](https://marketplace.visualstudio.com/items?itemName=johnsutray.run-npm-buttons)

Or locally with a `.vsix` file:  

```bash
vsce package
code --install-extension run-npm-buttons-0.0.1.vsix
```

## Configuration

| Setting | Type | Default | Description |
|----------|------|----------|-------------|
| `runNpmButtons.spinIcon` | `boolean` | `true` | When a script is running, chooses between showing a spinner icon or a static square icon. |