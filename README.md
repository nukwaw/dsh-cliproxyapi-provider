# CLIProxyAPI Provider for DeepSeek Harness

[English](./README_EN.md) | 简体中文

为 DeepSeek Harness 添加一个基于 OpenAI Responses API 的 `CLIProxyAPI` 模型供应商。

插件会自动从 CLIProxyAPI 获取模型列表，无需手动添加或维护模型。

## 功能

- **自动模型同步**：从 CLIProxyAPI 的 Codex 目录端点读取模型（含上下文窗口、思考档位），定期刷新。
- **Fast 模式**：目录中声明了优先级服务层级（`service_tiers`）的模型（如 GPT 系列）可以在模型选择器中切换 **速度：标准 / Fast**。开启 Fast 后，请求会以 `service_tier: "priority"` 派发。
- **服务端联网搜索**：对目录中标记 `supports_search_tool` 的模型，请求会注入内置 `web_search` 工具，由 CLIProxyAPI 在上游完成搜索，无需额外搜索 API Key。可在设置页关闭。
- **无密钥部署**：CLIProxyAPI 未开启鉴权时 API 密钥可留空。

## 使用方式

安装插件：

```powershell
npx @deepseek-ai/dsh plugin --profile web add github:router-for-me/dsh-cliproxyapi-provider
```

启动或重启 DeepSeek Harness Web：

```powershell
npx @deepseek-ai/dsh web
```

打开 Harness 后：

1. 进入 **设置**，在左侧导航中选择 **CLIProxyAPI**。
2. 填写 CLIProxyAPI 的 **API 地址**，例如
   `http://127.0.0.1:8317/v1`。
3. 填写 **API 密钥**；无鉴权服务可以留空。
4. 按需选择 **速度**（标准 / Fast）与 **服务端联网搜索** 开关。
5. 保存配置，模型列表会自动获取并定期刷新。

对支持 Fast 的模型，也可以直接在会话输入框的模型选择器中切换 **速度**；该选择对所有会话生效。

## 升级说明

早期版本通过内置 `llm-pi-ai` 插件的供应商配置（`llm-pi-ai.providers.CLIProxyAPI`）工作。当前版本由本插件直接持有 `CLIProxyAPI` 路由：升级后首次启动时会自动迁移旧配置中的 API 地址并移除旧的 `llm-pi-ai` 配置项，无需手工操作。

卸载插件：

```powershell
npx @deepseek-ai/dsh plugin --profile web remove @router-for-me/dsh-cliproxyapi-provider
```

卸载后重启 DeepSeek Harness Web 即可。
