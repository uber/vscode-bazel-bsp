# Getting Started Guide

## Core Functionality
- Download, install, and launch of Bazel BSP (https://github.com/JetBrains/bazel-bsp)
- Syncing Bazel targets and browsing test cases within source files
- Executing test runs, with filtering by test case
- Code coverage overlay via VS Code's new Coverage API
- Test failure display and overlay on the code
- Browsing run history

## Overall Extension Structure
The BSP extension consists of two parts:

1. The VS Code extension, considered the "client", which integrates directly with VS Code's extension API.
2. The "server" process (Bazel BSP), which is a separate locally running process that handles most of the Bazel interaction.

As you interact with the VS Code UI, the client sends requests to this server over Build Server Protocol, which standardizes the interaction between IDE's and build tooling.
- The client extension will download and install a copy of the server when launched for the first time in a repo.
- A file, ./.bsp/bazelbsp.json  is placed at the root of the repo with instructions for the client to launch the server as needed.
- Only the extension ("client") needs to be installed directly in VS Code.  The client then includes logic to download, install, and launch the server as necessary.

## Supported Languages
- Python (via Pylance language server)
- Java (via basic text discovery)
- _Others to be added in the future_

## Getting Started
### Extension Installation
- Download a recent release of this extension
- Install it via the "Install from VSIX..." option
  
  ![image](https://github.com/uber/vscode-bazel-bsp/assets/92764374/8f5f746a-2a33-4c19-87b4-269052c18879)

### Setup Process
1. Launch a workspace that contains .py or .java files, which will trigger extension activation.
2. Accept the prompt to install the build server in the repo	
3. Go to the "Testing" ![image](https://github.com/uber/vscode-bazel-bsp/assets/92764374/536205bd-6908-4184-9620-292aa2dfe7f6) panel in VS Code
4. Adjust the project scope.  See "Adjusting Project Scope" section below.
5. Let the sync process complete.  See "Sync Process" section below.

### Adjusting Project Scope
1. Open Project View file: click on the file icon next to the "Bazel Test Targets" root test item
   ![image](https://github.com/uber/vscode-bazel-bsp/assets/92764374/795baab9-ec42-4b7d-9b1a-2e4033731b64)
2. Adjust Targets: In the .bazelproject file that launches, specify one or more target patterns to be included in the sync scope
3. Click the "Refresh Tests" Button:  Wait for the sync process to complete.

   ![image](https://github.com/uber/vscode-bazel-bsp/assets/92764374/bdbf80ad-485f-464b-b728-cdd86c42f0e5)

### Sync Process
1. Expand root test item:  When the root item is initially expanded, the sync process will begin.
   
  ![image](https://github.com/uber/vscode-bazel-bsp/assets/92764374/555c29b5-2f47-4e24-b24b-f6dea4f0df85)

3. Wait for sync:  Give the initial sync time to complete, during which the message below will be displayed.

  ![image](https://github.com/uber/vscode-bazel-bsp/assets/92764374/6fdd8643-bf53-42f2-8075-b312f00dfd30)

3. View progress:  Check on sync progress via the output channel

   ![image](https://github.com/uber/vscode-bazel-bsp/assets/92764374/deb6491d-3b74-4e0a-a38e-2ea68b544f70)

### Resync Process
1. Make modifications:  Examples of actions that will require a resync include...
   - Creating and removing targets
   - Adding/deleting files
   - Moving files between targets
   - Switching between branches where the above are different
2. Click "Refresh Tests" button:  Wait for the sync process to complete.

### Browsing Test Cases
1. Ensure sync process is completed above.
2. Expand a test target

   ![image](https://github.com/uber/vscode-bazel-bsp/assets/92764374/354ef789-31fa-4113-975f-b262c10302e3)


4. Give the test cases a moment to load, then browse through individual test cases in the tree
   
   ![image](https://github.com/uber/vscode-bazel-bsp/assets/92764374/36efcc43-30ba-4a78-9032-0db38a51ce80)  ![image](https://github.com/uber/vscode-bazel-bsp/assets/92764374/01f52a36-3833-486f-9bde-c9ec9fdb110d)

6. Hover over a test item, and click the file icon to jump to the corresponding location in the file

   ![image](https://github.com/uber/vscode-bazel-bsp/assets/92764374/f3dfe88f-c8b8-4468-bee2-45549c53a4fb)

  
8. Run arrow is also available within the test file
9. Jump to the test item in the tree by right clicking on the run arrow and clicking "Reveal in Test Explorer"

   ![image](https://github.com/uber/vscode-bazel-bsp/assets/92764374/e13d4d45-f101-4ca4-94f1-6b69a26c583e)

### Modifying Test Cases (within a file)	
1. Make changes in the file and save
2. Test arrow will appear next to the new or renamed item

### Running a Test
Run a test case via one of the following available locations:
- Test Document Gutter: arrow next to each test case
- Test Explorer Tree:  arrow next to teach test item
- Right-click context menu: options vary based on location in document

To run with coverage, use the "Run with Coverage" option appearing next to the run arrow.

### Key Settings
- `bazelBinaryPath`: If you have a specific Bazel binary to be used, set it here.  This will only be used when generating a new .bazelproject file to set the bazel_binary field.
- `bazelProjectFilePath`: If you already have an existing project view file that you would prefer to use, point this setting to that location instead.  Be sure to reinstall the BSP server (Cmd+Shift+P → Install BSP Server) and reload the window to begin indexing based on the updated file.
- `serverInstallMode`: Can be set to 'Auto' to install automatically in a new repo.
- `serverVersion`: Determines which version of Bazel BSP will be installed.

## FAQ
### I tried to sync, but no targets have been loaded.
- Ensure you have completed the steps in the "Getting Started" section above.
- Check your .bazelproject file.  Ensure that the targets: field matches a valid Bazel target pattern, and that the bazel_binary value matches the accurate path to the repo's Bazel binary.

### How do I ensure that I'm running tests via this extension, and not via some other extension (e.g. the main Python extension)?
- Multiple extensions may contribute to VS Code's test explorer.  To ensure you're looking at tests from this specific extension, look for the "Bazel Test Targets" root item, which appears as below:

  ![image](https://github.com/uber/vscode-bazel-bsp/assets/92764374/fc353fc7-d130-45aa-b8d9-5ddb3cf32445)
  
- If you see multiple root nodes, ensure you are looking at "Bazel BSP Tests".
  
  ![image](https://github.com/uber/vscode-bazel-bsp/assets/92764374/d9c376b8-74e8-4981-a400-ae2fb70ec2ae)

- If a test is located under a different root node, or none, it may be coming a different extension.


