# CLIProxyAPI Provider for DeepSeek Harness

Adds a `CLIProxyAPI` model provider based on the OpenAI Responses API to DeepSeek Harness.

The plugin automatically retrieves the model list from CLIProxyAPI, so models do not need to be added or maintained manually.

## Features

- **Automatic model sync**: reads the catalog from CLIProxyAPI's Codex catalog endpoint (context windows, thinking levels) and refreshes it periodically.
- **Fast mode**: models whose catalog entries advertise priority service tiers (`service_tiers`) — the GPT family — offer a **Speed: Standard / Fast** choice right in the model picker. Fast dispatches requests with `service_tier: "priority"`.
- **Server-side web search**: for models flagged `supports_search_tool` in the catalog, requests carry the built-in `web_search` tool and CLIProxyAPI performs the search upstream — no extra search API key needed. Can be turned off on the settings page.
- **Keyless deployments**: the API key can be left empty when CLIProxyAPI has no authentication.

## Usage

Install the plugin:

```powershell
npx @deepseek-ai/dsh plugin --profile web add github:router-for-me/dsh-cliproxyapi-provider
```

Start or restart DeepSeek Harness Web:

```powershell
npx @deepseek-ai/dsh web
```

After opening Harness:

1. Open **Settings** and choose **CLIProxyAPI** in the left navigation.
2. Enter the CLIProxyAPI **API URL**, for example
   `http://127.0.0.1:8317/v1`.
3. Enter the **API key**. Leave it empty if the service does not require authentication.
4. Choose **Speed** (Standard / Fast) and the **server-side web search** toggle as needed.
5. Save the configuration. The model list is retrieved automatically and refreshed periodically.

For Fast-capable models you can also switch **Speed** directly from the model picker in the composer; the choice applies to all sessions.

## Upgrade notes

Earlier versions worked through a provider profile of the built-in `llm-pi-ai` plugin (`llm-pi-ai.providers.CLIProxyAPI`). The current version owns the `CLIProxyAPI` route itself: on first start after the upgrade it automatically migrates the API URL out of the old profile and removes that entry — no manual steps needed.

Uninstall the plugin:

```powershell
npx @deepseek-ai/dsh plugin --profile web remove @router-for-me/dsh-cliproxyapi-provider
```

Restart DeepSeek Harness Web after uninstalling the plugin.
