# Contributing

## Iterating on the extension
- Launch configurations are available in the .vscode directory
- Launch the extension by using the "Run and Debug" tab in VS Code, and selecting the "Run Extension" task.
- Extension will launch in a new window and stop at any breakpoints in the code.  Open a compatible repo to experiment with the extension.

## Controlling version of Bazel BSP server
- If you need to launch a specific version of Bazel BSP, install that version at the root of the repo where the extension will be used.
- See Bazel BSP installation instructions for further details:  https://github.com/JetBrains/bazel-bsp?tab=readme-ov-file#installation
- Once this is installed, this version will be launched by the extension.

## Packaging the extension
`yarn package`

## Running tests
- Run the extension tests by using the "Run and Debug" tab in VS Code, and selecting the "Extension Tests" task.
