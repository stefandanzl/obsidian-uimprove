# Obsidian community plugin template

### Key advantages over standard templates

-   **Minimal configuration**: Everything works out of the box with sensible defaults
-   **Environment-based**: Easily switch between development and production vaults
-   **Integrated release management**: From development to GitHub release in one command
-   **Production-ready**: Includes best practices for plugin development, settings, and commands

## 1. Initial Setup:

This template includes **Taskfile** - a powerful task runner that simplifies common development workflows. Taskfile provides a more developer-friendly interface than raw npm scripts.

#### 1. Install Task - Follow instructions at https://taskfile.dev/installation/

#### 2. Clone this repository or use Github's template feature

#### 3. Modify environment variables file `.env`

Ideally you should create a new, separate Obsidian vault for testing and development to not risk destroying any data

Copy `.env-example` to `.env` (filename required by the template Taskfile), then edit `.env` and set `VAULTS_DIR` to the directory you're keeping all your Obsidian vaults in and `VAULT_NAME` to the vault you're using for plugin development.

```env
# .env file
VAULTS_DIR=/path/to/your/vaults
VAULT_NAME=your-vault-name
```

#### 4. Add your data to `Taskfile.yml`

```yaml
PLUGIN_ID: awesome-plugin
PLUGIN_NAME: Awesome Plugin
PLUGIN_DESCRIPTION: This is very awesome Plugin
AUTHOR: Thomas Jefferson
AUTHOR_URL: https://github.com/tjeff
```

#### 5. Run initialization sequence

The `task init` command automatically:

-   Replaces all placeholder values (`PLUGIN_ID`, `PLUGIN_NAME`, etc.) across all files
-   Installs and updates dependencies with `npm update`
-   Creates the plugin directory in your dev vault

#### 6. Set up git

```bash
# Setup git repository
task setup-repo
```

## 2. Regular Development:

Use the default task for automatic build and copy `main.js`, `styles.css` and `manifest.json` to your vault (if template variables are properly configured)

```bash
task
```

Alternatively you can also manually copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.

Remember to reload Obsidian after issuing this bash command from Obsidian's command palette (opens on Ctrl+P) "Reload app without saving" for your latest version to be loaded by the app

## 3. Release Process:

When you're ready to release a version use each of these commands:

```bash
# Build to ensure latest main.js is compiled
task
# Increase version number one minor step
task bump
# Upload all files for publishing your plugin
task release
# Requires installation of github cli and logging in
```

> You can simplify the version bump process by running `npm version patch`, `npm version minor` or `npm version major` after updating `minAppVersion` manually in `manifest.json`.
> The command will bump version in `manifest.json` and `package.json`, and add the entry for the new version to `versions.json`

If you want to start out from version `0.0.0` instead of `1.0.0`, manually change `versions.json`, `package.json` and `manifest.json`

# General Plugin Development guidelines

## Security, privacy, and compliance

Follow Obsidian's **Developer Policies** and **Plugin Guidelines**. In particular:

-   Default to local/offline operation. Only make network requests when essential to the feature.
-   No hidden telemetry. If you collect optional analytics or call third-party services, require explicit opt-in and document clearly in `README.md` and in settings.
-   Never execute remote code, fetch and eval scripts, or auto-update plugin code outside of normal releases.
-   Minimize scope: read/write only what's necessary inside the vault. Do not access files outside the vault.
-   Clearly disclose any external services used, data sent, and risks.
-   Respect user privacy. Do not collect vault contents, filenames, or personal information unless absolutely necessary and explicitly consented.
-   Avoid deceptive patterns, ads, or spammy notifications.
-   Register and clean up all DOM, app, and interval listeners using the provided `register*` helpers so the plugin unloads safely.

## UX & copy guidelines (for UI text, commands, settings)

-   Prefer sentence case for headings, buttons, and titles.
-   Use clear, action-oriented imperatives in step-by-step copy.
-   Use **bold** to indicate literal UI labels. Prefer "select" for interactions.
-   Use arrow notation for navigation: **Settings → Community plugins**.
-   Keep in-app strings short, consistent, and free of jargon.

## Performance

-   Keep startup light. Defer heavy work until needed.
-   Avoid long-running tasks during `onload`; use lazy initialization.
-   Batch disk access and avoid excessive vault scans.
-   Debounce/throttle expensive operations in response to file system events.

## Coding conventions

-   TypeScript with `"strict": true` preferred.
-   **Keep `main.ts` minimal**: Focus only on plugin lifecycle (onload, onunload, addCommand calls). Delegate all feature logic to separate modules.
-   **Split large files**: If any file exceeds ~200-300 lines, consider breaking it into smaller, focused modules.
-   **Use clear module boundaries**: Each file should have a single, well-defined responsibility.
-   Bundle everything into `main.js` (no unbundled runtime deps).
-   Avoid Node/Electron APIs if you want mobile compatibility; set `isDesktopOnly` accordingly.
-   Prefer `async/await` over promise chains; handle errors gracefully.

## Mobile

-   Where feasible, test on iOS and Android.
-   Don't assume desktop-only behavior unless `isDesktopOnly` is `true`.
-   Avoid large in-memory structures; be mindful of memory and storage constraints.

## Agent do/don't

**Do**

-   Add commands with stable IDs (don't rename once released).
-   Provide defaults and validation in settings.
-   Write idempotent code paths so reload/unload doesn't leak listeners or intervals.
-   Use `this.register*` helpers for everything that needs cleanup.

**Don't**

-   Introduce network calls without an obvious user-facing reason and documentation.
-   Ship features that require cloud services without clear disclosure and explicit opt-in.
-   Store or transmit vault contents unless essential and consented.

## References

-   Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
-   API documentation: https://docs.obsidian.md
-   API code: https://github.com/obsidianmd/obsidian-api
-   Developer policies: https://docs.obsidian.md/Developer+policies
-   Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
-   Style guide: https://help.obsidian.md/style-guide

## Improve code quality with eslint (optional)

-   [ESLint](https://eslint.org/) is a tool that analyzes your code to quickly find problems. You can run ESLint against your plugin to find common bugs and ways to improve your code.
-   To use eslint with this project, make sure to install eslint from terminal:
    -   `npm install -g eslint`
-   To use eslint to analyze this project use this command:
    -   `eslint main.ts`
    -   eslint will then create a report with suggestions for code improvement by file and line number.
-   If your source code is in a folder, such as `src`, you can use eslint with this command to analyze all files in that folder:
    -   `eslint ./src/`
