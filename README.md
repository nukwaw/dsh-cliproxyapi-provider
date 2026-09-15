# CLIProxyAPI Provider for DeepSeek Harness

Adds a `CLIProxyAPI` model provider based on the OpenAI Responses API to DeepSeek Harness.

The plugin automatically retrieves the model list from CLIProxyAPI, so models do not need to be added or maintained manually.

## Features

- **Automatic model sync**: reads the catalog from CLIProxyAPI's Codex catalog endpoint (context windows, thinking levels) and refreshes it periodically.
- **Model filtering**: **Fetch model list** on the settings page opens the fetched catalog in a modal where models can be checked individually; only checked models appear in the model picker. With no selection saved, the whole catalog is served.
- **Fast mode**: models whose catalog entries advertise priority service tiers (`service_tiers`) — the GPT family — can be dispatched on the priority tier. A speed chip at the bottom of the composer shows the current state for Fast-capable selections (click to toggle); the default lives on the settings page. Fast dispatches requests with `service_tier: "priority"`.
- **Server-side web search, routed automatically**: the plugin reads CLIProxyAPI's per-model native search verdict from the catalog and routes each request accordingly — no switch to set. Search-capable models declare the native Responses `web_search` tool and drop the conflicting local `web_search` function; every other model keeps DSH's local web tools. No extra search API key is needed for the native path.
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
4. Choose **Speed** (Standard / Fast) as needed.
5. Optionally click **Fetch model list** and uncheck models you do not need; with no selection saved, all catalog models are served.
6. Save the configuration. The model list is retrieved automatically and refreshed periodically.

For Fast-capable models you can flip **Speed** anytime from the composer speed chip; the choice applies to all sessions. Set `CPA_DEBUG=1` on the `dsh web` process to log the dispatched model and reasoning effort of every request for debugging.

## Web tool routing

Web search and page retrieval need no configuration: the plugin reads the catalog on every sync and decides per model per request. The relevant log lines are emitted once per model per catalog refresh, so `dsh web` output shows exactly which tier each model you use landed in.

| catalog verdict for the model | Request carries | Page retrieval |
|---|---|---|
| native search supported (OpenAI/Codex family, reasoning model) | native `web_search` tool | native upstream browsing — local `web_fetch` removed |
| native search supported (xAI, Anthropic, non-reasoning, …) | native `web_search` tool | DSH `web_fetch` (native search here is query-only) |
| no verdict, but the legacy Codex flag is set | native `web_search` tool | native upstream browsing when the model is a reasoning model |
| explicitly unsupported, or no capability data | DSH `web_search` | DSH `web_fetch` |

Only the matching local function declarations are removed from supported requests. A request-local instruction directs the model away from the old function schemas, including in conversations with failed web calls. Existing call/result history, unrelated tools, and other providers remain unchanged. Caller payload hooks cannot reintroduce the conflicting declarations. This does not unregister DSH tools globally or disable their safety checks; native browsing is performed by the upstream model/backend, whose access limits still apply.

### Where the verdict comes from

CLIProxyAPI **7.3.1 and later** resolves an explicit per-model verdict across every route that can serve the model and publishes it in the Codex catalog for the `cpa` client identity, as `cpa_capabilities.web_search` — `true`, `false`, or absent when the proxy has no verified metadata. This plugin asks under that identity. A proxy that cannot carry the native tool (Gemini, Vertex, AI Studio, Kimi, Antigravity, plain OpenAI-compatible routes) is reported as `false`; unknown is treated as "keep the local tools" rather than as a guess.

Older proxies, and models the proxy publishes no metadata for, fall back to the legacy `supports_search_tool` flag, which stays `true` only for Codex client template models served exclusively by the codex provider. Nothing needs migrating: an older proxy simply keeps working the way it did.

### Troubleshooting

- **`WEB_PROVIDER_CREDENTIAL_MISSING`** means the model called DSH's local `web_search`, which happens only when the catalog does not report native search for that model. Either the proxy has no verified native search for it (check the routing log line for that model) or it predates 7.3.1. With a native-capable model this should not happen; if it does, update the plugin and restart DSH Web.
- **`WEB_BLOCKED_URL: ... resolves to a non-public IP address`** comes from the local HTTP fetcher's URL safety check. Proxy/VPN synthetic DNS (fake-ip) makes every proxied hostname resolve into the benchmark range (for example `198.18.0.205`), which the check rejects before the proxy client can intercept the connection. This plugin patches the registered fetch provider's resolver at load time — unconditionally and model-independently: stock validation (literals, NAT64, private/loopback/link-local blocks) still runs first, and only a rejection whose complete DNS answer set is fake-ip (`198.18.0.0/15`, the standard transparent-proxy pool) is released; any genuinely private answer keeps the original block. For other non-public setups, correct the DNS configuration or configure the user's HTTP(S) proxy in DSH's launch environment (`HTTPS_PROXY`/`HTTP_PROXY` or `ALL_PROXY`, with applicable `NO_PROXY` settings), then restart DSH. DSH uses proxy-side DNS on its supported proxied fetch path; it does not automatically read OS proxy settings or accept SOCKS/PAC URLs.

Native web actions are not local DSH tool executions, so they need not appear as `web_search`/`web_fetch` tool cards. The routing instruction asks for direct source links because the current pi-ai adapter does not preserve structured native citation annotations.

## Server-side search overhead

Declaring the native Responses `web_search` tool is not free: the upstream model includes its tool context in input-token usage even when the prompt does not require browsing. This applies to every model whose catalog verdict is native-capable, including auxiliary requests such as session-title generation; the current pi-ai adapter does not expose their purpose to this provider.

A controlled GPT-6-Astra High probe measured **327 input tokens** for requests without the native declaration versus **4,685** with it: **4,358 extra input tokens** from declaring the native tool. The amount is model/backend-dependent; cached tokens still count toward total input tokens. If that overhead matters more than upstream browsing for a given model, take it out of the served model list, or remove it from the catalog on the proxy side.

Run `scripts/probe-search-tokens.mjs` manually to repeat that comparison. It uses the same API-key and endpoint/model environment variables as the strict-mode probe below, makes three small model requests (built-in OpenAI, this plugin without the declaration, this plugin with it), checks that the payloads differ only by the native search declaration, and prints total input usage including cached input. It is not part of `npm test`.

Run `scripts/probe-native-search.mjs` to check the catalog verdicts against the upstream itself. Without flags it only reads the catalog (free) and prints one row per model — the verdict, the legacy flag, and which tier the plugin will route — plus a summary highlighting models the explicit verdict overturns. `--dispatch` sends one tiny request per model that declares the native tool, and `--browse` additionally asks the model to open a specific URL, which is how the `open_page` action gets exercised. Both cost model requests and never execute returned tool calls.

## Tool-call compatibility

The provider enables pi-ai's `compat.supportsStrictMode` capability so ordinary function tools explicitly send **`strict: false`**, matching the built-in OpenAI provider. Enabling this capability does not turn strict validation on. Omitting `strict` lets the Responses backend enforce strict schemas, which can force optional fields such as bash's `sandbox_permissions` and `justification` into otherwise ordinary calls.

The regression tests compare serialized requests against the built-in provider, including explicit High effort, optional bash arguments, and tool-result history. `scripts/probe-tool-strict.mjs` is a manual live A/B probe: it sends two small requests that differ only in the tool's `strict` field, prints the returned arguments, and **never executes the returned tool calls**. It uses `OPENAI_API_KEY` or `DSH_CLIPROXY_API_KEY`; `CPA_TEST_BASE_URL` and `CPA_TEST_MODEL` optionally override its endpoint and model. It is not run by `npm test`.

## Upgrade notes

Starting with **0.6.0**, web tool routing is automatic and the settings page no longer offers a **server-side web search** switch. An existing `webSearch` value in the settings document is simply ignored; models the catalog reports as search-capable now always use the native upstream tool.

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
