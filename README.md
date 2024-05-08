# vscode-bazel-bsp README

This is the README for VS Code + Bazel BSP Extension.

## Features

This extension is designed to provide integration between VS Code and Bazel BSP.  It is inspired by the [New Bazel Plugin](https://lp.jetbrains.com/new-bazel-plugin/) for JetBrains products, allowing VS Code to leverage a subset of Bazel BSP as well.

- [Build Server Protocol](https://code.visualstudio.com/api/extension-guides/testing)
- [Bazel BSP](https://github.com/JetBrains/bazel-bsp)

The initial focus will be to build out several core workflows for to integrate Bazel BSP with VS Code's [Test Explorer](https://code.visualstudio.com/api/extension-guides/testing), including the following:
- Server install, launch, initialization, and process management
- Syncing available test targets and discovery of test cases beneath them
- Execution of test targets and parsing/display of test results and run history
- Support for debugging test targets and overlay of code coverage

In the future, we may consider exploring other areas of the Build Server Protocol and integrating them with VS Code.  If you have ideas, feel free to start a discussion.

## Getting Started
1. Launch this extension and open a supported file type.
2. If this is your first time using Bazel BSP in the repo, you will be prompted to install it. Accept the notification to proceed.
3. View the "Testing" panel, which will show progress of the load, and show available test targets once the load is complete.

### Adjusting project scope
1. Click on the top level test case to open the .bazelproject that is in use.
2. Adjust the "targets" entry to include desired targets.
3. Click the refresh (circular arrow) icon at the top of the "testing" panel to re-sync available targets.

### Syncing changes to targets
- Click the refresh button at the top of the "testing" panel. This will pull in new/renamed targets, and updated source files, within the scope defined by the .bazelproject file.

## Extension Output
- `Bazel BSP (client)`: Shows results of server notifications to the client, including sync and build progress.
- `Bazel BSP (extension)`: Shows general extension launch related info, such as install progress and other potential issues with the extension itself.

## Requirements
- VS Code 1.89 or newer

## Extension Settings
- Please see the `bazelbsp` section in VS Code settings.

## Known Issues
- Coming soon

## Release Notes
- Coming soon
