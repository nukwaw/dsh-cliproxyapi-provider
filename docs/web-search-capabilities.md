# Native web search: the upstream capability contract and what to change here

Investigation of CLIProxyAPI's per-model native web search support (checked against
**v7.3.3**, 2026-09-14) and what this plugin should do about it.

## 1. What upstream changed

The capability contract landed in **v7.3.1** (2026-09-13), PR
[#5797](https://github.com/router-for-me/CLIProxyAPI/pull/5797) plus two follow-up
commits (`4311ae87` "require explicit per-model native search support", `678da561`
"sync verified native search capability metadata").

### 1.1 A new catalog field, gated on a new client identity

`GET /v1/models?client_version=cpa` answers the Codex catalog envelope as before, but
each entry now carries:

```json
{ "slug": "grok-4.6", "cpa_capabilities": { "web_search": true } }
```

* Emitted **only** for the exact lowercase value `cpa`
  (`applyCPAWebSearchCapability` returns early otherwise; `server_routes.go` only wires
  the capability source when `clientVersion == "cpa"`). `CPA`, `pi`, `0.153.4` and an
  empty value all get the legacy shape — there is an upstream test asserting that a
  non-`cpa` response never exposes `cpa_capabilities`.
* **Tri-state**: `true`, `false`, or the field is *absent* meaning "unknown".
  Absent is deliberate and must be treated conservatively.
* Requires the Home integration to be enabled, like the rest of the Codex catalog.

### 1.2 How upstream computes it

Per-model static metadata `native_capabilities.web_search` in
`internal/registry/models/models.json`, one entry per provider section, resolved by
`registry.ResolveResponsesWebSearchCapability` across **every registered route** that can
serve the public model:

* an explicit `false` on any route wins outright;
* otherwise a provider whose Responses path cannot carry the tool forces `false`;
* unknown metadata anywhere (or an unrecognised provider name) → omitted;
* all routes known-capable → `true`.

Provider path support is a hardcoded table:

| verdict | providers |
|---|---|
| capable | `codex`, `xai`, `claude` |
| incapable | `openai`, `openai-compatibility`, `gemini`, `aistudio`, `vertex`, `antigravity`, `kimi`, `interactions`, `gemini-interactions`, anything starting with `openai-compatible-` |
| unknown | everything else |

Shipped metadata currently marks every codex-family model in `codex-free`/`codex-team`/
`codex-plus`/`codex-pro`, plus exactly `grok-4.6` (xai) and `claude-opus-5` (claude).
Gemini/Vertex/AI Studio/Kimi/Antigravity and the plain OpenAI-compatible routes are
explicitly `false`; the proxy now *refuses to guess* where it has no verified data.

### 1.3 `supports_search_tool` did not change, but it is not a capability feed

It remains the legacy Codex CLI field. In practice it is `true` only for the eight
entries of the `codex_client_models.json` template catalog, and only when the model is
served exclusively by the `codex` provider:

* template match (e.g. `gpt-5.5`, `gpt-6-astra`, `gpt-5.6-sol/terra/luna`,
  `gpt-5.3-codex-spark`, `gpt-reserve`, `codex-auto-review`) → keeps the template value;
* every **non-template** model is cloned from the `gpt-5.5` default template and then
  explicitly forced to `supports_search_tool: false`.

So `supports_search_tool` answers "is this a codex template model on a pure codex
route?", not "does native search work for this model?".

## 2. What that meant for this plugin (before this change)

`src/catalog.js` asked as `client_version=pi` ("matching the reference integration"). `pi`
is not special-cased anywhere upstream — it is just an opaque value that selects the Codex
catalog path — but it is **not** `cpa`, so the plugin never received
`cpa_capabilities`.

Consequences:

1. **The newly supported models were invisible to the plugin.** `capabilitiesOf()` read
   `supports_search_tool`, which is false/absent for `grok-4.6` and `claude-opus-5`
   (they are not templates). With **Server-side web search** enabled and one of those
   models selected, the plugin keeps DSH's local `web_search` function in the request
   and never declares the native `web_search` tool. If no local search credential is
   configured that surfaces as `WEB_PROVIDER_CREDENTIAL_MISSING`; if one is, the user
   silently pays for a local search round-trip instead of the upstream native path the
   proxy now advertises.
2. **"Explicitly unsupported" and "unknown" are indistinguishable.** A gemini model
   (upstream: `web_search: false`) and a model the proxy has no metadata for (field
   omitted) both look like "no capability". The new field exists precisely to separate
   those two cases, and each warrants different messaging.
3. **Widening search must not silently remove `web_fetch`.** `src/provider.js` sets
   `nativeFetch = model.reasoning === true`; when native search is routed, reasoning
   models lose DSH's local `web_fetch` and are told to use *open_page / find_in_page*.
   That guidance is correct for the OpenAI/Codex hosted search tool, which really does
   expose those actions. It is **not** correct for the other two newly capable paths:

   | path | native tool | page retrieval |
   |---|---|---|
   | OpenAI / Codex | `web_search` with `search` / `open_page` / `find_in_page` actions | yes, via actions |
   | xAI (grok) | `web_search`; options are `allowed_domains`, `excluded_domains`, `enable_image_search`, `enable_image_understanding` | browsing happens *inside* the tool call, but there is no `open_page`/`find_in_page` action and CPA strips `external_web_access` |
   | Anthropic (claude) | CPA maps Responses `web_search` → `web_search_20250305` (query only; `max_uses`, `filters.allowed_domains`, `user_location`) | no — page fetch is a *separate* Anthropic server tool that CPA does not map from a Responses `web_search` declaration |

   So flipping `claude-opus-5` to native search without also narrowing the fetch reroute
   would delete the only working page-retrieval path for that model.

## 3. What was implemented

The switch in the settings page is gone: routing is derived per model per request from the
catalog, with a tiered fallback and no user decision to get wrong.

### A. The explicit capability is now the primary signal (done)

* `catalogURL()` asks with `client_version=cpa`; `capabilitiesOf()` reads
  `cpa_capabilities.web_search` and falls back to `supports_search_tool` only when the
  verdict is absent, so pre-7.3.1 proxies behave exactly as before.
* The verdict is tri-state and the distinction is preserved: `true` declares the native
  tool, `false` never does, and absent falls back rather than guessing. Unsupported and
  unknown now only differ in messaging, which is what the field was added for.
* Compatibility is unaffected: any `client_version` value already selected the Codex
  catalog path, and `cpa` is not a dotted version, so reasoning levels, visibility and
  `service_tiers` (Fast mode) serialize identically to the previous `pi` identity.

### B. Page retrieval is gated on the search family, not on reasoning alone (done)

* `capabilitiesOf()` also reports `browsing`: `search && supports_search_tool`, i.e. the
  OpenAI/Codex hosted search family, the only one whose action set includes
  `open_page`/`find_in_page`.
* `webRoutingOf(model, prefs)` routes page retrieval upstream only for `browsing` models
  that are reasoning models (the previously verified combination). xAI and Anthropic
  models keep DSH `web_fetch` and receive guidance that says so instead of naming actions
  their upstream does not implement.
* This is what makes widening search safe: without it, flipping `claude-opus-5` to native
  search would have deleted the model's only working page-retrieval path.

### C. Diagnostics (done)

* The catalog sync line now reports how many models carry native search and how many the
  proxy declares unsupported.
* The first dispatch of each model per catalog revision logs the tier it landed in, and a
  model that falls back to the local tools also reports whether a usable local search
  provider is registered — the `WEB_PROVIDER_CREDENTIAL_MISSING` trap, stated before the
  model hits it.

### D–F. Not implemented, deliberately

* **Native tool options** (`filters.allowed_domains`, `max_uses`, `search_context_size`,
  `enable_image_search`, …) are path-specific: CPA forwards some to Claude, strips
  `external_web_access` for xAI, and passes others straight through. They are worth a
  setting only if a domain allowlist or a context budget is actually wanted.
* **`x_search`** is injected server-side by CPA (`inject-x-search`) and never appears in
  the catalog, so the plugin cannot detect or control it. It works without client changes.
* **A CPA-backed DSH search provider** (registering a provider on the `ctx.web` seam for
  models without native search) was evaluated and rejected: DSH resolves exactly one
  usable provider and raises `WEB_PROVIDER_AMBIGUOUS` otherwise, so adding one would break
  every setup that already has a search provider configured. The harness-side tier stays
  whatever the user configured.

### G. Live verification harness (done)

`scripts/probe-native-search.mjs` reads the catalog under both identities, prints the
verdict, the legacy flag and the routing tier per model, flags the models where the
verdict overturns the legacy flag, and optionally dispatches one tiny request per model
(`--dispatch`) or asks the model to open a URL (`--browse`) to exercise the upstream
tool for real.

## 4. Open questions that remain

* The family marker for page retrieval reuses the legacy `supports_search_tool` flag
  rather than the catalog's `owned_by`, because the former is exactly "Codex template model
  on a pure codex route" while `owned_by` is less reliable for user-configured models. If
  upstream ever drops the legacy flag, this needs a new signal.
* The pi-ai adapter still drops structured native citation annotations, so the routing
  instruction keeps asking for Markdown source links (unchanged by any of the above).
* Upstream's hardcoded "`openai` provider is incapable" verdict looks conservative for a
  genuine OpenAI API-key route; the plugin simply trusts whatever the proxy reports rather
  than second-guessing it.
* Anthropic page fetch through a passthrough `web_fetch_*` server-tool declaration is
  plausible (the Responses→Claude translator only blocks `image_generation`, `file_search`,
  `code_interpreter` and `computer_use_preview`) but unverified, provider-specific, and
  invalid on every other path. `scripts/probe-native-search.mjs --browse` is the starting
  point if it is ever worth chasing.

## 5. Changed files

| file | change |
|---|---|
| `src/catalog.js` | `client_version=cpa`; tri-state `capabilitiesOf` including the `browsing` family marker |
| `src/settings-contract.js` | the `webSearch` preference is gone |
| `src/provider.js` | `webRoutingOf` tier decision; family-gated page-retrieval reroute; per-tier guidance wording; `onDispatch` hook |
| `src/index.js` | catalog capability sets and counts, sync log, once-per-model routing diagnostics, local search tier probe |
| `client.js` | the toggle is gone; a hint explains automatic routing |
| `test/*.test.js` | explicit true/false/absent, verdict-beats-legacy, tier table, end-to-end unsupported-model fallback, no-opt-out coverage |
| `scripts/probe-native-search.mjs` | new manual live verification probe |
| `README.md` | routing table, capability contract, troubleshooting, overhead and upgrade notes |

