# CLIProxyAPI Provider for DeepSeek Harness

Adds a `CLIProxyAPI` model provider based on the OpenAI Responses API to DeepSeek Harness.

The plugin automatically retrieves the model list from CLIProxyAPI, so models do not need to be added or maintained manually.

## Features

- **Automatic model sync**: reads the catalog from CLIProxyAPI's Codex catalog endpoint (context windows, thinking levels) and refreshes it periodically.
- **Model filtering**: **Fetch model list** on the settings page opens the fetched catalog in a modal where models can be checked individually; only checked models appear in the model picker. With no selection saved, the whole catalog is served.
- **Fast mode**: models whose catalog entries advertise priority service tiers (`service_tiers`) — the GPT family — can be dispatched on the priority tier. A speed chip at the bottom of the composer shows the current state for Fast-capable selections (click to toggle); the default lives on the settings page. Fast dispatches requests with `service_tier: "priority"`.
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
5. Optionally click **Fetch model list** and uncheck models you do not need; with no selection saved, all catalog models are served.
6. Save the configuration. The model list is retrieved automatically and refreshed periodically.

For Fast-capable models you can flip **Speed** anytime from the composer speed chip; the choice applies to all sessions. Set `CPA_DEBUG=1` on the `dsh web` process to log the dispatched model and reasoning effort of every request for debugging.

## Tool-call compatibility

The provider enables pi-ai's `compat.supportsStrictMode` capability so ordinary function tools explicitly send **`strict: false`**, matching the built-in OpenAI provider. Enabling this capability does not turn strict validation on. Omitting `strict` lets the Responses backend enforce strict schemas, which can force optional fields such as bash's `sandbox_permissions` and `justification` into otherwise ordinary calls.

The regression tests compare serialized requests against the built-in provider, including explicit High effort, optional bash arguments, and tool-result history. `scripts/probe-tool-strict.mjs` is a manual live A/B probe: it sends two small requests that differ only in the tool's `strict` field, prints the returned arguments, and **never executes the returned tool calls**. It uses `OPENAI_API_KEY` or `DSH_CLIPROXY_API_KEY`; `CPA_TEST_BASE_URL` and `CPA_TEST_MODEL` optionally override its endpoint and model. It is not run by `npm test`.

## Upgrade notes

Earlier versions worked through a provider profile of the built-in `llm-pi-ai` plugin (`llm-pi-ai.providers.CLIProxyAPI`). The current version owns the `CLIProxyAPI` route itself and no longer migrates the old profile: if you configured CLIProxyAPI through an older version, open the built-in **pi-ai** settings page, remove its `CLIProxyAPI` provider entry, then configure the connection on this plugin's settings page.

Uninstall the plugin:

```powershell
npx @deepseek-ai/dsh plugin --profile web remove @router-for-me/dsh-cliproxyapi-provider
```

Restart DeepSeek Harness Web after uninstalling the plugin.
