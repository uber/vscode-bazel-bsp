# vscode-bazel-bsp README

This is the README for VS Code + Bazel BSP Extension.

## Features

This extension is designed to provide integration between VS Code and Bazel BSP.  It is inspired by the [New Bazel Plugin](https://lp.jetbrains.com/new-bazel-plugin/) for JetBrains products, allowing VS Code to leverage Bazel BSP as well.

- [Build Server Protocol](https://code.visualstudio.com/api/extension-guides/testing)
- [Bazel BSP](https://github.com/JetBrains/bazel-bsp)

The initial focus will be to build out several core workflows for to integrate Bazel BSP with VS Code's Test Explorer [Test Explorer](https://code.visualstudio.com/api/extension-guides/testing), including the following:
- Server install, launch, initialization, and process management
- Syncing available test targets and discovery of test cases beneath them
- Execution of test targets and parsing/display of test results and run history
- Support for debugging test targets and overlay of code coverage

In the future, we may consider exploring other areas of the Build Server Protocol and integrating them with VS Code.  If you have ideas, feel free to start a discussion.

## Requirements
- VS Code 1.86 or newer
- [Bazel BSP](https://github.com/JetBrains/bazel-bsp). See install instructions there.
  - Coming soon: This launch/setup will be set up as a script with this extension.

## Extension Settings
- No settings yet

## Known Issues
- Coming Soon

## Release Notes
- Coming soon
