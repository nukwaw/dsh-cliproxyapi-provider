# CLIProxyAPI Provider for DeepSeek Harness

Adds a `CLIProxyAPI` model provider based on the OpenAI Responses API to DeepSeek Harness.

The plugin automatically retrieves the model list from CLIProxyAPI, so models do not need to be added or maintained manually.

## Features

- **Automatic model sync**: reads the catalog from CLIProxyAPI's Codex catalog endpoint (context windows, thinking levels) and refreshes it periodically.
- **Model filtering**: **Fetch model list** on the settings page opens the fetched catalog in a modal where models can be checked individually; only checked models appear in the model picker. With no selection saved, the whole catalog is served.
- **Fast mode**: models whose catalog entries advertise priority service tiers (`service_tiers`) — the GPT family — can be dispatched on the priority tier. A speed chip at the bottom of the composer shows the current state for Fast-capable selections (click to toggle); the default lives on the settings page. Fast dispatches requests with `service_tier: "priority"`.
- **Server-side web search**: for models flagged `supports_search_tool` in the catalog, the native Responses `web_search` tool replaces DSH's local search function — no extra search API key needed. For reasoning models, native page-open/find also replaces local `web_fetch`, keeping browsing upstream instead of using local DNS. Can be turned off on the settings page.
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

## Web tool routing and troubleshooting

The server-side toggle selects **which tools the model is offered**, not credentials for DSH's separate web service:

| CLIProxyAPI request | Search | Page retrieval |
|---|---|---|
| Search enabled, catalog supports search, reasoning model | Native upstream search | Native upstream page-open/find |
| Search enabled, catalog supports search, non-reasoning model | Native upstream search | DSH `web_fetch` |
| Search disabled or model lacks search support | DSH `web_search` | DSH `web_fetch` |

Only the matching local function declarations are removed from supported requests. A request-local instruction directs the model away from the old function schemas, including in conversations with failed web calls. Existing call/result history, unrelated tools, and other providers remain unchanged. Caller payload hooks cannot reintroduce the conflicting declarations. This does not unregister DSH tools globally or disable their safety checks; native browsing is performed by the upstream model/backend, whose access limits still apply.

- **`WEB_PROVIDER_CREDENTIAL_MISSING`** means the model called DSH's local `web_search`, not native search. Earlier plugin versions added native search without removing that competing function. Update the installed plugin and restart DSH Web. With search off or an unsupported model, the local search provider still needs its own credential.
- **`WEB_BLOCKED_URL: ... resolves to a non-public IP address`** comes from the local HTTP fetcher's URL safety check. Proxy/VPN synthetic DNS can cause a public hostname to resolve to a non-public address (for example `198.18.0.220`). Do not allow private addresses globally. Native browsing on supported reasoning models avoids local resolution. If local `web_fetch` is needed, correct the DNS configuration or configure the user's HTTP(S) proxy in DSH's launch environment (`HTTPS_PROXY`/`HTTP_PROXY` or `ALL_PROXY`, with applicable `NO_PROXY` settings), then restart DSH. DSH uses proxy-side DNS on its supported proxied fetch path; it does not automatically read OS proxy settings or accept SOCKS/PAC URLs.

Native web actions are not local DSH tool executions, so they need not appear as `web_search`/`web_fetch` tool cards. The routing instruction asks for direct source links because the current pi-ai adapter does not preserve structured native citation annotations.

## Server-side search overhead

When **server-side web search** is enabled, the plugin declares the native Responses `web_search` tool on every request for supported models. The upstream model includes its tool context in input-token usage even when the prompt does not require browsing. This also affects auxiliary requests such as session-title generation; the current pi-ai adapter does not expose their purpose to this provider.

For a like-for-like token comparison with the built-in OpenAI provider, turn this toggle **off** and save. This restores local web tools without changing reasoning effort or non-web DSH function tools. A controlled GPT-6-Astra High probe measured **327 input tokens** with both built-in OpenAI and this plugin with search off, versus **4,685** with search on: **4,358 extra input tokens** from declaring the native tool. The amount is model/backend-dependent; cached tokens still count toward total input tokens.

Run `scripts/probe-search-tokens.mjs` manually to repeat that comparison. It uses the same API-key and endpoint/model environment variables as the strict-mode probe below, makes three small model requests, checks that the payloads differ only by the native search declaration, and prints total input usage including cached input. It is not part of `npm test`.

## Tool-call compatibility

The provider enables pi-ai's `compat.supportsStrictMode` capability so ordinary function tools explicitly send **`strict: false`**, matching the built-in OpenAI provider. Enabling this capability does not turn strict validation on. Omitting `strict` lets the Responses backend enforce strict schemas, which can force optional fields such as bash's `sandbox_permissions` and `justification` into otherwise ordinary calls.

The regression tests compare serialized requests against the built-in provider, including explicit High effort, optional bash arguments, and tool-result history. `scripts/probe-tool-strict.mjs` is a manual live A/B probe: it sends two small requests that differ only in the tool's `strict` field, prints the returned arguments, and **never executes the returned tool calls**. It uses `OPENAI_API_KEY` or `DSH_CLIPROXY_API_KEY`; `CPA_TEST_BASE_URL` and `CPA_TEST_MODEL` optionally override its endpoint and model. It is not run by `npm test`.

## Upgrade notes

Starting with **0.5.3**, the package name is **`dsh-cliproxyapi-provider`**, without the `@router-for-me/` scope. If you installed the scoped package, remove it before installing the renamed package using the installation command above, then restart DSH Web:

```powershell
npx @deepseek-ai/dsh plugin --profile web remove @router-for-me/dsh-cliproxyapi-provider
```

Earlier versions worked through a provider profile of the built-in `llm-pi-ai` plugin (`llm-pi-ai.providers.CLIProxyAPI`). The current version owns the `CLIProxyAPI` route itself and no longer migrates the old profile: if you configured CLIProxyAPI through an older version, open the built-in **pi-ai** settings page, remove its `CLIProxyAPI` provider entry, then configure the connection on this plugin's settings page.

Uninstall the plugin:

```powershell
npx @deepseek-ai/dsh plugin --profile web remove dsh-cliproxyapi-provider
```

Restart DeepSeek Harness Web after uninstalling the plugin.
