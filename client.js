window.__ModuleLoader__.load({
  id: '@router-for-me/dsh-cliproxyapi-provider',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const {
      useEffect,
      useId,
      useMemo,
      useRef,
      useState,
      useSyncExternalStore,
    } = React

    // Mirrored from src/settings-contract.js: the browser bundle is a single
    // file with no relative imports, so the contract is restated literally.
    const SETTINGS_NS = 'llm-cliproxyapi'
    const BASE_URL_FIELD = 'baseURL'
    const SPEED_MODE_FIELD = 'speedMode'
    const SPEED_MODE_STANDARD = 'standard'
    const SPEED_MODE_FAST = 'fast'
    const WEB_SEARCH_FIELD = 'webSearch'
    const MODELS_FIELD = 'models'
    const CREDENTIAL_REF = 'DSH_CLIPROXY_API_KEY'
    const PROVIDER = 'CLIProxyAPI'
    const DEFAULT_BASE_URL = 'http://127.0.0.1:8317/v1'
    const SETTINGS_SLOT = 'settings.section'
    const SETTINGS_SECTION_ID = 'cliproxyapi'
    const SETTINGS_SECTION_ORDER = 20
    const SETTINGS_LOCALE_NS = 'settings.cliProxyApi'
    const MODEL_SLOT = 'conversation.input.model'
    // The runner gates activation on this declaration: apply only runs once
    // every listed service exists, which is what makes the directory and
    // session lookups below race-free (dynamic plugins have no ctx.inject).
    const inject = [
      'slots',
      'locale',
      'remote',
      'remote.credentials',
      'remote.llm',
      'remote.settings',
      'settingsScope',
      'modelDirectories',
      'sessions',
    ]

    // Fast mode is a predefined property of the served family (gpt-* models);
    // the server additionally gates dispatch on the catalog's service_tiers,
    // so a proxy that dropped the flag simply answers at standard speed.
    const supportsFastMode = (modelId) => typeof modelId === 'string' && /^gpt-/iu.test(modelId)

    const copy = {
      en: {
        tab: 'CLIProxyAPI',
        title: 'CLIProxyAPI',
        intro: 'Connect a CLIProxyAPI server and synchronize its model catalog.',
        loading: 'Loading CLIProxyAPI settings…',
        unavailable: 'CLIProxyAPI settings are unavailable in this Web profile.',
        readOnly: 'Settings are read-only for this connection.',
        statusConfigured: 'Connected',
        modelsSynced: 'models discovered',
        notConfigured: 'CLIProxyAPI is not configured yet.',
        baseURL: 'Base URL',
        apiKey: 'API key',
        apiKeyPlaceholder: 'Optional for a keyless CLIProxyAPI server',
        apiKeyConfiguredPlaceholder: 'API key already saved',
        credentialConfiguredLabel: 'Configured',
        speedMode: 'Speed',
        speedStandard: 'Standard',
        speedStandardHint: 'Default service tier',
        speedFast: 'Fast',
        speedFastHint: 'Priority service tier for supported models',
        webSearch: 'Server-side web search',
        webSearchHint: 'Let supported models search the web through CLIProxyAPI',
        save: 'Save & Sync',
        saving: 'Saving…',
        saved: 'Saved. The CLIProxyAPI model catalog is synchronizing.',
        remove: 'Remove',
        removing: 'Removing…',
        removed: 'The CLIProxyAPI provider was removed.',
        baseRequired: 'Base URL is required.',
        baseInvalid: 'Base URL must be a valid HTTP or HTTPS URL.',
        noModels: 'CLIProxyAPI returned no usable models.',
        modelLabel: 'Model',
        modelMenuAria: 'Model menu',
        modelsLoading: 'Loading models…',
        modelsEmpty: 'No models available',
        modelFailed: 'Failed to load models: {value}',
        modelRetry: 'Retry',
        groupFailed: '{name}: {value}',
        effortLabel: 'Thinking effort',
        effortsEmpty: 'No thinking levels available',
        providerDefault: 'Provider default',
        selectModel: 'Select model',
        speedTitle: 'Speed',
        speedIndicator: 'Speed: {value} (click to toggle)',
        modelsLabel: 'Models',
        modelsAll: 'All catalog models',
        modelsSelected: '{count} selected',
        fetchModels: 'Fetch model list',
        modelsModalTitle: 'Select models',
        modelsModalHint: 'Only checked models appear in the model picker. Save the settings to apply.',
        selectAll: 'Select all',
        selectNone: 'Select none',
        applySelection: 'Apply',
        cancel: 'Cancel',
      },
      zh: {
        tab: 'CLIProxyAPI',
        title: 'CLIProxyAPI',
        intro: '连接 CLIProxyAPI 服务并同步其模型目录。',
        loading: '正在读取 CLIProxyAPI 设置…',
        unavailable: '当前 Web 配置中无法访问 CLIProxyAPI 设置。',
        readOnly: '当前连接的设置为只读。',
        statusConfigured: '已连接',
        modelsSynced: '个模型已发现',
        notConfigured: '尚未配置 CLIProxyAPI。',
        baseURL: 'Base URL',
        apiKey: 'API Key',
        apiKeyPlaceholder: '无鉴权的 CLIProxyAPI 可留空',
        apiKeyConfiguredPlaceholder: '已保存 API Key',
        credentialConfiguredLabel: '已配置',
        speedMode: '速度',
        speedStandard: '标准',
        speedStandardHint: '默认服务层级',
        speedFast: 'Fast',
        speedFastHint: '为支持的模型启用优先级服务层级',
        webSearch: '服务端联网搜索',
        webSearchHint: '让支持的模型通过 CLIProxyAPI 联网搜索',
        save: '保存并同步',
        saving: '保存中…',
        saved: '已保存，CLIProxyAPI 模型目录正在同步。',
        remove: '移除',
        removing: '移除中…',
        removed: '已移除 CLIProxyAPI 供应商。',
        baseRequired: '请填写 Base URL。',
        baseInvalid: 'Base URL 必须是有效的 HTTP 或 HTTPS 地址。',
        noModels: 'CLIProxyAPI 未返回可用模型。',
        modelLabel: '模型',
        modelMenuAria: '模型菜单',
        modelsLoading: '正在加载模型…',
        modelsEmpty: '暂无可用模型',
        modelFailed: '模型加载失败：{value}',
        modelRetry: '重试',
        groupFailed: '{name}：{value}',
        effortLabel: '思考强度',
        effortsEmpty: '没有可用的思考档位',
        providerDefault: '供应商默认',
        selectModel: '选择模型',
        speedTitle: '速度',
        speedIndicator: '速度：{value}（点击切换）',
        modelsLabel: '模型',
        modelsAll: '全部目录模型',
        modelsSelected: '已选 {count} 个',
        fetchModels: '获取模型列表',
        modelsModalTitle: '选择模型',
        modelsModalHint: '只有勾选的模型会出现在模型选择器中。保存设置后生效。',
        selectAll: '全选',
        selectNone: '全不选',
        applySelection: '应用',
        cancel: '取消',
      },
    }

    const STYLE = `
.cpaModelSelect{position:relative;min-width:0}.cpaModelSelectTrigger{display:flex;align-items:center;gap:4px;min-width:0;max-width:min(360px,45cqw);height:28px;padding:0 4px 0 8px;border:0;border-radius:24px;outline:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;line-height:20px;cursor:pointer}.cpaModelSelectTrigger:hover:not(:disabled),.cpaModelSelectTrigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}.cpaModelSelectTrigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.cpaModelSelectTrigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.cpaModelSelectBolt{flex:none;font-size:11px;line-height:1;color:var(--dsw-alias-label-primary)}.cpaModelSelectLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cpaModelSelectEffort{flex:none;color:var(--dsw-alias-label-caption)}.cpaModelSelectChevron{flex:none;color:var(--dsw-alias-label-caption);transition:transform 120ms;font-size:10px}.cpaModelSelectTrigger[aria-expanded=true] .cpaModelSelectChevron{transform:rotate(180deg)}
.cpaModelSelectMenu,.cpaModelSelectSubmenu{position:absolute;z-index:30;box-sizing:border-box;width:max-content;min-width:min(240px,calc(100vw - 32px));max-width:min(420px,calc(100vw - 32px));max-height:min(360px,calc(100vh - 96px));padding:4px;border:1px solid var(--dsw-alias-border-inverted);border-radius:12px;background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);overflow:hidden}.cpaModelSelectMenu{right:0;bottom:calc(100% + 8px);overflow:visible}.cpaModelSelectSubmenu{right:calc(100% + 8px);bottom:0;min-width:min(230px,calc(100vw - 32px))}.cpaModelSelectCell{display:flex;align-items:center;gap:8px;width:100%;min-width:100%;height:40px;box-sizing:border-box;padding:0 10px;border:0;border-radius:10px;background:transparent;color:inherit;font-size:14px;line-height:22px;text-align:left;cursor:pointer}.cpaModelSelectCell:hover,.cpaModelSelectCell:focus-visible,.cpaModelSelectCell[data-open=true]{background:var(--dsw-alias-interactive-bg-hover);outline:0}.cpaModelSelectCell:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.cpaModelSelectCellLabel{flex:none;white-space:nowrap}.cpaModelSelectCellValue{flex:auto;min-width:0;overflow:hidden;color:var(--dsw-alias-label-tertiary);text-align:right;text-overflow:ellipsis;white-space:nowrap}.cpaModelSelectCellChevron{flex:none;color:var(--dsw-alias-label-tertiary);font-size:10px}.cpaModelSelectGroups{min-height:0;max-height:352px;overflow-y:auto}.cpaModelSelectGroup+.cpaModelSelectGroup{margin-top:4px}.cpaModelSelectGroupTitle{position:sticky;top:0;z-index:1;padding:5px 8px 3px;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:500;line-height:18px}.cpaModelSelectOption{display:flex;align-items:center;gap:8px;width:100%;min-width:100%;min-height:38px;box-sizing:border-box;padding:6px 8px;border:0;border-radius:10px;outline:0;background:transparent;color:inherit;text-align:left;cursor:pointer}.cpaModelSelectOption:hover:not(:disabled),.cpaModelSelectOption:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}.cpaModelSelectOption:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.cpaModelSelectOptionCopy{display:flex;flex:1;min-width:0;flex-direction:column}.cpaModelSelectOptionName{overflow:hidden;color:inherit;font-size:14px;font-weight:500;line-height:20px;text-overflow:ellipsis;white-space:nowrap}.cpaModelSelectOptionDescription{overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}.cpaModelSelectCheck{display:grid;place-items:center;flex:0 0 18px;color:var(--dsw-alias-label-primary);font-size:12px}.cpaModelSelectStatus,.cpaModelSelectEmpty{padding:10px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.cpaModelSelectError,.cpaModelSelectWarning{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px;padding:7px 8px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}.cpaModelSelectWarning{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label)}.cpaModelSelectRetry{flex:none;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}
.cpaSpeedChip{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border:1px solid var(--dsw-alias-border-l4);border-radius:12px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:500;line-height:1;cursor:pointer}.cpaSpeedChip:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.cpaSpeedChip[data-fast=true]{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-interactive-bg-hover)}.cpaSpeedChip:disabled{cursor:default;opacity:.5}
.cpaModalOverlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.32)}
.cpaModal{box-sizing:border-box;width:min(520px,calc(100vw - 48px));max-height:min(480px,calc(100vh - 96px));display:flex;flex-direction:column;gap:8px;padding:16px;border-radius:12px;background:var(--dsw-specific-menu,#fff);box-shadow:var(--dsw-shadow-lv3,0 8px 32px rgba(0,0,0,.18));color:var(--dsw-alias-label-primary,#1f2329)}
.cpaModalTitle{margin:0;font-size:15px;font-weight:600}
.cpaModalHint{margin:0;color:var(--dsw-alias-label-tertiary,#8f959e);font-size:12px;line-height:1.5}
.cpaModalList{flex:1;min-height:120px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;padding:4px;border:1px solid var(--dsw-alias-border-l4,rgba(31,35,41,.14));border-radius:8px}
.cpaModalRow{display:flex;align-items:center;gap:8px;padding:6px 8px;border:0;border-radius:6px;color:inherit;font-size:13px;line-height:1.5;text-align:left;cursor:pointer;background:transparent;width:100%}
.cpaModalRow:hover{background:var(--dsw-alias-interactive-bg-hover)}
.cpaModalRowId{color:var(--dsw-alias-label-tertiary,#8f959e);font-size:12px}
.cpaModalToolbar{display:flex;gap:8px;align-items:center}
.cpaModalActions{display:flex;gap:8px;justify-content:flex-end}
.cpaModalStatus{padding:12px;color:var(--dsw-alias-label-tertiary,#8f959e);font-size:13px}
.cpaModalError{padding:12px;color:var(--dsw-alias-state-error-primary,#d84a4a);font-size:12px}
.cpaModalButton{appearance:none;cursor:pointer;border:1px solid var(--dsw-alias-border-l2,rgba(31,35,41,.14));border-radius:8px;background:none;color:var(--dsw-alias-label-secondary,#717782);padding:4px 12px;font:inherit;font-size:13px;line-height:1.5}
.cpaModalButtonPrimary{background:var(--dsw-alias-label-primary,#1f2329);color:var(--dsw-alias-bg-layer-3,#fff);border-color:transparent}
.cpaModalButton:disabled{cursor:default;opacity:.4}
`

    const styles = {
      section: {
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        width: '100%',
        maxWidth: '760px',
        color: 'var(--dsw-alias-label-primary, #1f2329)',
      },
      heading: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      },
      title: {
        margin: 0,
        fontSize: '18px',
        fontWeight: 600,
        lineHeight: 1.4,
      },
      intro: {
        margin: 0,
        color: 'var(--dsw-alias-label-tertiary, #8f959e)',
        fontSize: '13px',
        lineHeight: 1.5,
      },
      status: {
        margin: 0,
        color: 'var(--dsw-alias-label-tertiary, #8f959e)',
        fontSize: '13px',
        lineHeight: 1.5,
        overflowWrap: 'anywhere',
      },
      statusError: {
        margin: 0,
        color: 'var(--dsw-alias-label-error, #d84a4a)',
        fontSize: '13px',
        lineHeight: 1.5,
        overflowWrap: 'anywhere',
      },
      form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      },
      field: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '12px 0',
      },
      fieldRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 0',
      },
      label: {
        fontSize: '13px',
        fontWeight: 500,
        lineHeight: 1.5,
      },
      labelRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      },
      hint: {
        color: 'var(--dsw-alias-label-tertiary, #8f959e)',
        fontSize: '12px',
        fontWeight: 400,
        lineHeight: 1.5,
      },
      input: {
        boxSizing: 'border-box',
        width: '100%',
        height: '34px',
        border: '0.5px solid var(--dsw-alias-border-l4, rgba(31, 35, 41, 0.14))',
        borderRadius: '8px',
        background: 'var(--dsw-alias-bg-layer-3, transparent)',
        color: 'var(--dsw-alias-label-primary, #1f2329)',
        padding: '0 12px',
        font: 'inherit',
        fontSize: '13px',
        lineHeight: 1.5,
      },
      actions: {
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: '8px',
        paddingTop: '12px',
      },
      button: {
        appearance: 'none',
        cursor: 'pointer',
        border: '1px solid transparent',
        borderRadius: '8px',
        background: 'var(--dsw-alias-label-primary, #1f2329)',
        color: 'var(--dsw-alias-bg-layer-3, #fff)',
        padding: '5px 14px',
        font: 'inherit',
        fontSize: '13px',
        lineHeight: 1.5,
      },
      buttonSecondary: {
        appearance: 'none',
        cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l2, rgba(31, 35, 41, 0.14))',
        borderRadius: '8px',
        background: 'none',
        color: 'var(--dsw-alias-label-secondary, #717782)',
        padding: '5px 14px',
        font: 'inherit',
        fontSize: '13px',
        lineHeight: 1.5,
      },
      buttonDisabled: {
        cursor: 'default',
        opacity: 0.4,
      },
    }

    const fill = (template, values) => template.replace(/\{(\w+)\}/g, (match, key) => {
      const value = values?.[key]
      return value === undefined || value === null ? match : String(value)
    })

    function validBaseURL(value, messages) {
      if (!value) throw new Error(messages.baseRequired)
      let parsed
      try {
        parsed = new URL(value)
      } catch {
        throw new Error(messages.baseInvalid)
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(messages.baseInvalid)
      }
    }

    /**
     * Validate the draft against the live catalog, store the credential, then
     * persist the namespace. The server plugin owns the route and syncs the
     * catalog itself once baseURL lands; no profile handoff is needed.
     * `preferences.models` is the model whitelist: an empty array serves the
     * whole catalog.
     */
    async function installConfiguration(operations, baseURL, apiKey, preferences, messages) {
      const credential = await operations.describeCredential(CREDENTIAL_REF)
      const discovered = await operations.discoverModels(SETTINGS_NS, {
        provider: PROVIDER,
        baseURL,
        api: 'openai-responses',
        ...(apiKey ? { apiKey } : {}),
      })
      if (!discovered.length) throw new Error(messages.noModels)
      if (apiKey) await operations.storeCredential(CREDENTIAL_REF, apiKey)
      await operations.mutateSettings(SETTINGS_NS, [
        { op: 'set', path: [BASE_URL_FIELD], value: baseURL },
        { op: 'set', path: [SPEED_MODE_FIELD], value: preferences.speedMode },
        { op: 'set', path: [WEB_SEARCH_FIELD], value: preferences.webSearch },
        { op: 'set', path: [MODELS_FIELD], value: preferences.models ?? [] },
      ])
      return { discovered, hasCredential: Boolean(apiKey || credential?.configured) }
    }

    async function removeConfiguration(operations) {
      await operations.mutateSettings(SETTINGS_NS, [
        { op: 'unset', path: [BASE_URL_FIELD] },
        { op: 'unset', path: [MODELS_FIELD] },
      ])
    }

    function messagesOf(t) {
      return {
        baseRequired: t('baseRequired'),
        baseInvalid: t('baseInvalid'),
        noModels: t('noModels'),
      }
    }

    function SettingsSection({ operations, remote, preference, t }) {
      const snapshot = useSyncExternalStore(preference.subscribe, preference.getSnapshot, preference.getSnapshot)
      const configured = typeof snapshot.baseURL === 'string' && snapshot.baseURL.length > 0
      const [baseURL, setBaseURL] = useState(DEFAULT_BASE_URL)
      const [apiKey, setApiKey] = useState('')
      const [speedMode, setSpeedMode] = useState(SPEED_MODE_STANDARD)
      const [webSearch, setWebSearch] = useState(true)
      const [modelFilter, setModelFilter] = useState(null)
      const [modalOpen, setModalOpen] = useState(false)
      const [loadedRevision, setLoadedRevision] = useState(undefined)
      const [credentialStatus, setCredentialStatus] = useState('unknown')
      const [saving, setSaving] = useState(false)
      const [removing, setRemoving] = useState(false)
      const [feedback, setFeedback] = useState({ text: '', error: false })
      const messages = useMemo(() => messagesOf(t), [t])
      const readOnly = snapshot.status === 'ready' && !snapshot.writable
      const busy = saving || removing
      const canWrite = snapshot.status === 'ready' && snapshot.writable && !busy

      useEffect(() => {
        if (snapshot.status !== 'ready' || snapshot.revision === undefined) return
        if (snapshot.revision === loadedRevision) return
        setBaseURL(configured ? snapshot.baseURL : DEFAULT_BASE_URL)
        setSpeedMode(snapshot.speedMode)
        setWebSearch(snapshot.webSearch)
        setModelFilter(snapshot.models)
        setApiKey('')
        setLoadedRevision(snapshot.revision)
      }, [loadedRevision, configured, snapshot.baseURL, snapshot.speedMode, snapshot.webSearch, snapshot.models, snapshot.revision, snapshot.status])

      useEffect(() => {
        let active = true
        const refresh = async () => {
          let status = 'unknown'
          try {
            const info = await operations.describeCredential(CREDENTIAL_REF)
            status = info?.configured === true ? 'configured' : 'missing'
          } catch {
            status = 'unknown'
          }
          if (active) setCredentialStatus(status)
        }
        void refresh()
        const dispose = remote.$on('credentials/reference-updated', (ref) => {
          if (ref === CREDENTIAL_REF) void refresh()
        })
        return () => {
          active = false
          dispose()
        }
      }, [operations, remote])

      const fetchModelList = async () => {
        const draftBaseURL = baseURL.trim().replace(/\/+$/, '')
        validBaseURL(draftBaseURL, messages)
        const draftApiKey = apiKey.trim()
        const discovered = await operations.discoverModels(SETTINGS_NS, {
          provider: PROVIDER,
          baseURL: draftBaseURL,
          api: 'openai-responses',
          ...(draftApiKey ? { apiKey: draftApiKey } : {}),
        })
        if (!discovered.length) throw new Error(messages.noModels)
        return discovered
      }

      const submit = async (event) => {
        event.preventDefault()
        if (!canWrite) return
        const nextBaseURL = baseURL.trim().replace(/\/+$/, '')
        const nextApiKey = apiKey.trim()
        setSaving(true)
        setFeedback({ text: '', error: false })
        try {
          validBaseURL(nextBaseURL, messages)
          const result = await installConfiguration(operations, nextBaseURL, nextApiKey, { speedMode, webSearch, models: modelFilter ?? [] }, messages)
          setApiKey('')
          setFeedback({ text: t('saved') + ' ' + result.discovered.length + ' ' + t('modelsSynced'), error: false })
        } catch (error) {
          setFeedback({
            text: error instanceof Error ? error.message : String(error),
            error: true,
          })
        } finally {
          setSaving(false)
        }
      }

      const remove = async () => {
        if (!canWrite || !configured) return
        setRemoving(true)
        setFeedback({ text: '', error: false })
        try {
          await removeConfiguration(operations)
          setFeedback({ text: t('removed'), error: false })
        } catch (error) {
          setFeedback({
            text: error instanceof Error ? error.message : String(error),
            error: true,
          })
        } finally {
          setRemoving(false)
        }
      }

      return React.createElement(
        'div',
        { style: styles.section, 'aria-busy': busy || snapshot.status === 'loading' },
        React.createElement(
          'div',
          { style: styles.heading },
          React.createElement('h2', { style: styles.title }, t('title')),
          React.createElement('p', { style: styles.intro }, t('intro')),
        ),
        snapshot.status === 'unavailable'
          ? React.createElement('p', { style: styles.statusError, role: 'alert' }, t('unavailable'))
          : null,
        snapshot.status === 'loading'
          ? React.createElement('p', { style: styles.status, role: 'status' }, t('loading'))
          : null,
        readOnly
          ? React.createElement('p', { style: styles.status, role: 'status' }, t('readOnly'))
          : null,
        snapshot.status === 'ready'
          ? React.createElement(
            'p',
            { style: styles.status, role: 'status' },
            configured ? t('statusConfigured') + ' · ' + snapshot.baseURL : t('notConfigured'),
          )
          : null,
        React.createElement(
          'form',
          { style: styles.form, onSubmit: submit, noValidate: true },
          React.createElement(
            'label',
            { style: styles.field },
            React.createElement('span', { style: styles.label }, t('baseURL')),
            React.createElement('input', {
              style: styles.input,
              type: 'url',
              value: baseURL,
              autoComplete: 'url',
              disabled: !canWrite,
              onChange: (event) => setBaseURL(event.currentTarget.value),
            }),
          ),
          React.createElement(
            'label',
            { style: styles.field },
            React.createElement(
              'span',
              { style: styles.labelRow },
              React.createElement('span', { style: styles.label }, t('apiKey')),
              credentialStatus === 'configured'
                ? React.createElement(
                  'span',
                  { style: styles.hint, role: 'status' },
                  t('credentialConfiguredLabel'),
                )
                : null,
            ),
            React.createElement('input', {
              style: styles.input,
              type: 'password',
              value: apiKey,
              placeholder: credentialStatus === 'configured'
                ? t('apiKeyConfiguredPlaceholder')
                : t('apiKeyPlaceholder'),
              autoComplete: 'off',
              disabled: !canWrite,
              onChange: (event) => setApiKey(event.currentTarget.value),
            }),
          ),
          React.createElement(
            'label',
            { style: styles.field },
            React.createElement('span', { style: styles.label }, t('speedMode')),
            React.createElement(
              'select',
              {
                style: styles.input,
                value: speedMode,
                disabled: !canWrite,
                onChange: (event) => setSpeedMode(event.currentTarget.value),
              },
              React.createElement('option', { value: SPEED_MODE_STANDARD }, t('speedStandard') + ' — ' + t('speedStandardHint')),
              React.createElement('option', { value: SPEED_MODE_FAST }, t('speedFast') + ' — ' + t('speedFastHint')),
            ),
          ),
          React.createElement(
            'label',
            { style: styles.fieldRow },
            React.createElement('input', {
              type: 'checkbox',
              checked: webSearch,
              disabled: !canWrite,
              onChange: (event) => setWebSearch(event.currentTarget.checked),
            }),
            React.createElement('span', { style: styles.label }, t('webSearch')),
            React.createElement('span', { style: styles.hint }, t('webSearchHint')),
          ),
          React.createElement(
            'div',
            { style: styles.fieldRow },
            React.createElement('span', { style: styles.label }, t('modelsLabel')),
            React.createElement(
              'span',
              { style: styles.hint, role: 'status' },
              modelFilter === null ? t('modelsAll') : fill(t('modelsSelected'), { count: modelFilter.length }),
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                style: canWrite ? styles.buttonSecondary : { ...styles.buttonSecondary, ...styles.buttonDisabled },
                disabled: !canWrite,
                onClick: () => setModalOpen(true),
              },
              t('fetchModels'),
            ),
          ),
          modalOpen
            ? React.createElement(ModelFilterModal, {
              fetchModels: fetchModelList,
              initialSelection: modelFilter,
              onApply: (selection) => {
                setModelFilter(selection)
                setModalOpen(false)
              },
              onClose: () => setModalOpen(false),
              t,
            })
            : null,
          feedback.text
            ? React.createElement(
              'p',
              { style: feedback.error ? styles.statusError : styles.status, role: feedback.error ? 'alert' : 'status' },
              feedback.text,
            )
            : null,
          React.createElement(
            'div',
            { style: styles.actions },
            configured
              ? React.createElement(
                'button',
                {
                  type: 'button',
                  style: canWrite
                    ? styles.buttonSecondary
                    : { ...styles.buttonSecondary, ...styles.buttonDisabled },
                  disabled: !canWrite,
                  onClick: remove,
                },
                removing ? t('removing') : t('remove'),
              )
              : null,
            React.createElement(
              'button',
              {
                type: 'submit',
                style: canWrite ? styles.button : { ...styles.button, ...styles.buttonDisabled },
                disabled: !canWrite,
              },
              saving ? t('saving') : t('save'),
            ),
          ),
        ),
      )
    }

    /**
     * Slim read/write handle over this plugin's settings namespace for the
     * model picker: memoized so useSyncExternalStore never sees a fresh
     * snapshot for an unchanged section.
     */
    function createPreference(scope, operations) {
      let cachedKey
      let cachedSnapshot
      return {
        subscribe: (listener) => scope.subscribe(listener),
        getSnapshot: () => {
          const snap = scope.getSnapshot()
          const value = snap?.value ?? {}
          const models = Array.isArray(value?.[MODELS_FIELD])
            ? value[MODELS_FIELD].filter((id) => typeof id === 'string' && id.length > 0)
            : []
          const key = [
            snap?.status ?? 'loading',
            snap?.revision ?? '',
            snap?.writable === true,
            value?.[SPEED_MODE_FIELD] ?? '',
            value?.[WEB_SEARCH_FIELD] ?? '',
            JSON.stringify(models),
          ].join(':')
          if (key === cachedKey) return cachedSnapshot
          cachedKey = key
          cachedSnapshot = Object.freeze({
            status: snap?.status ?? 'loading',
            revision: snap?.revision,
            writable: snap?.writable === true,
            baseURL: typeof value?.[BASE_URL_FIELD] === 'string' ? value[BASE_URL_FIELD] : undefined,
            speedMode: value?.[SPEED_MODE_FIELD] === SPEED_MODE_FAST ? SPEED_MODE_FAST : SPEED_MODE_STANDARD,
            webSearch: value?.[WEB_SEARCH_FIELD] !== false,
            // null = no filter: the whole catalog is served.
            models: models.length > 0 ? models : null,
          })
          return cachedSnapshot
        },
        set: async (patch) => {
          const revision = scope.getSnapshot()?.revision
          await operations.mutateSettings(SETTINGS_NS, Object.entries(patch).map(([path, value]) => ({
            op: 'set',
            path: [path],
            value,
          })), revision)
        },
      }
    }

    function usePreferenceSnapshot(preference) {
      return useSyncExternalStore(preference.subscribe, preference.getSnapshot, preference.getSnapshot)
    }

    /**
     * The conversation model picker, shadowing the built-in one (a later,
     * lower-priority registration wins the seat) so CLIProxyAPI's Speed
     * preference can sit beside Model and Thinking effort for gpt-* routes.
     */
    function CliProxyModelSelect({ locked, available, directory, load, select, preference, t }) {
      const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
      const preferenceSnapshot = usePreferenceSnapshot(preference)
      const [open, setOpen] = useState(false)
      const [pane, setPane] = useState('root')
      const rootRef = useRef(null)
      const triggerRef = useRef(null)
      const id = useId()
      const choices = useMemo(() => state.groups.flatMap((group) => group.models.map((model) => ({
        group,
        model,
        selection: {
          provider: group.id,
          model: model.id,
          ...(model.reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: model.reasoning.defaultEffort }),
        },
      }))), [state.groups])
      const currentChoice = choices.find((choice) => choice.selection.provider === state.current?.provider && choice.selection.model === state.current?.model)
      const reasoning = currentChoice?.model.reasoning
      const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
      const effortLabel = reasoning === undefined
        ? undefined
        : effectiveEffort === undefined
          ? t('providerDefault')
          : reasoning.efforts.find((level) => level.id === effectiveEffort)?.name ?? effectiveEffort
      const effortChoices = useMemo(() => reasoning === undefined ? [] : [
        ...(reasoning.defaultEffort === undefined ? [{ key: 'provider-default', effort: undefined, label: t('providerDefault') }] : []),
        ...reasoning.efforts.map((effort) => ({
          key: `effort:${effort.id}`,
          effort: effort.id,
          label: effort.name,
          ...(effort.description === undefined ? {} : { description: effort.description }),
        })),
      ], [reasoning, t])
      const modelLabel = currentChoice?.model.name ?? t('selectModel')
      const speedSupported = state.current?.provider === PROVIDER && supportsFastMode(state.current?.model)
      const speedWritable = preferenceSnapshot.status === 'ready' && preferenceSnapshot.writable === true
      const fast = speedSupported && preferenceSnapshot.speedMode === SPEED_MODE_FAST
      const busy = state.status === 'selecting'

      useEffect(() => {
        if (available) load()
      }, [available, load])
      useEffect(() => {
        if (!open) return undefined
        const closeOutside = (event) => {
          if (!rootRef.current?.contains(event.target)) {
            setOpen(false)
            setPane('root')
          }
        }
        document.addEventListener('mousedown', closeOutside)
        return () => document.removeEventListener('mousedown', closeOutside)
      }, [open])
      useEffect(() => {
        if (!speedSupported && pane === 'speed') setPane('root')
      }, [pane, speedSupported])
      if (!available) return null

      const close = (restoreFocus = false) => {
        setOpen(false)
        setPane('root')
        if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus())
      }
      const settleSelection = (accepted) => {
        if (accepted) close(true)
      }
      const chooseModel = (selection) => {
        if (state.current?.provider === selection.provider && state.current.model === selection.model) {
          close(true)
          return
        }
        void select(selection).then(settleSelection)
      }
      const chooseEffort = (effort) => {
        if (state.current === null) return
        if (effectiveEffort === effort) {
          close(true)
          return
        }
        void select({
          provider: state.current.provider,
          model: state.current.model,
          ...(effort === undefined ? {} : { reasoningEffort: effort }),
        }).then(settleSelection)
      }
      const chooseSpeed = (speedMode) => {
        close(true)
        void preference.set({ [SPEED_MODE_FIELD]: speedMode })
      }
      const option = ({ key, label, description, selected, disabled, onClick }) => React.createElement(
        'button',
        {
          key,
          type: 'button',
          role: 'menuitemradio',
          'aria-checked': selected,
          className: 'cpaModelSelectOption',
          disabled,
          onClick,
        },
        React.createElement(
          'span',
          { className: 'cpaModelSelectOptionCopy' },
          React.createElement('span', { className: 'cpaModelSelectOptionName' }, label),
          description === undefined ? null : React.createElement('span', { className: 'cpaModelSelectOptionDescription' }, description),
        ),
        React.createElement('span', { className: 'cpaModelSelectCheck' }, selected ? '✓' : null),
      )
      const cell = (target, label, value) => React.createElement(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          className: 'cpaModelSelectCell',
          'data-open': pane === target,
          'aria-haspopup': 'menu',
          'aria-expanded': pane === target,
          onClick: () => setPane((current) => current === target ? 'root' : target),
        },
        React.createElement('span', { className: 'cpaModelSelectCellLabel' }, label),
        React.createElement('span', { className: 'cpaModelSelectCellValue' }, value),
        React.createElement('span', { className: 'cpaModelSelectCellChevron' }, '▸'),
      )

      let submenu = null
      if (pane === 'model') {
        submenu = React.createElement(
          'div',
          { className: 'cpaModelSelectSubmenu', role: 'menu', 'aria-label': t('modelLabel') },
          state.status === 'loading' ? React.createElement('div', { className: 'cpaModelSelectStatus' }, t('modelsLoading')) : null,
          state.error === null ? null : React.createElement(
            'div',
            { className: 'cpaModelSelectError' },
            React.createElement('span', null, fill(t('modelFailed'), { value: state.error })),
            React.createElement('button', { className: 'cpaModelSelectRetry', type: 'button', onClick: load }, t('modelRetry')),
          ),
          state.failures.map((failure) => React.createElement('div', { className: 'cpaModelSelectWarning', key: failure.id }, fill(t('groupFailed'), { name: failure.name, value: failure.message }))),
          React.createElement(
            'div',
            { className: 'cpaModelSelectGroups scrollable' },
            state.groups.map((group) => React.createElement(
              'section',
              { className: 'cpaModelSelectGroup', role: 'group', 'aria-labelledby': `${id}-${group.id}`, key: group.id },
              React.createElement('div', { className: 'cpaModelSelectGroupTitle', id: `${id}-${group.id}` }, group.name),
              group.models.map((model) => option({
                key: model.id,
                label: model.name,
                description: model.description,
                selected: state.current?.provider === group.id && state.current.model === model.id,
                disabled: busy,
                onClick: () => chooseModel({ provider: group.id, model: model.id }),
              })),
            )),
          ),
          state.status === 'ready' && choices.length === 0 ? React.createElement('div', { className: 'cpaModelSelectEmpty' }, t('modelsEmpty')) : null,
        )
      } else if (pane === 'effort') {
        submenu = React.createElement(
          'div',
          { className: 'cpaModelSelectSubmenu', role: 'menu', 'aria-label': t('effortLabel') },
          effortChoices.length === 0
            ? React.createElement('div', { className: 'cpaModelSelectEmpty' }, t('effortsEmpty'))
            : effortChoices.map((level) => option({
              key: level.key,
              label: level.label,
              description: level.description,
              selected: effectiveEffort === level.effort,
              disabled: busy,
              onClick: () => chooseEffort(level.effort),
            })),
        )
      } else if (pane === 'speed') {
        submenu = React.createElement(
          'div',
          { className: 'cpaModelSelectSubmenu', role: 'menu', 'aria-label': t('speedTitle') },
          option({ key: SPEED_MODE_STANDARD, label: t('speedStandard'), description: t('speedStandardHint'), selected: !fast, disabled: !speedWritable, onClick: () => chooseSpeed(SPEED_MODE_STANDARD) }),
          option({ key: SPEED_MODE_FAST, label: t('speedFast'), description: t('speedFastHint'), selected: fast, disabled: !speedWritable, onClick: () => chooseSpeed(SPEED_MODE_FAST) }),
        )
      }

      return React.createElement(
        'div',
        {
          className: 'cpaModelSelect',
          ref: rootRef,
          onKeyDown: (event) => {
            if (event.key !== 'Escape' || !open) return
            event.preventDefault()
            if (pane === 'root') close(true)
            else setPane('root')
          },
        },
        React.createElement(
          'button',
          {
            ref: triggerRef,
            type: 'button',
            className: 'cpaModelSelectTrigger',
            'aria-label': modelLabel,
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            'aria-controls': open ? `${id}-menu` : undefined,
            title: modelLabel,
            disabled: locked,
            onClick: () => open ? close() : (setPane('root'), setOpen(true), load()),
          },
          fast ? React.createElement('span', { className: 'cpaModelSelectBolt', 'aria-hidden': 'true' }, '⚡') : null,
          React.createElement('span', { className: 'cpaModelSelectLabel' }, modelLabel),
          effortLabel === undefined ? null : React.createElement('span', { className: 'cpaModelSelectEffort' }, effortLabel),
          React.createElement('span', { className: 'cpaModelSelectChevron' }, '▾'),
        ),
        open ? React.createElement(
          'div',
          {
            className: 'cpaModelSelectMenu',
            id: `${id}-menu`,
            role: 'menu',
            'aria-label': t('modelMenuAria'),
            'aria-busy': state.status === 'loading' || busy,
          },
          cell('model', t('modelLabel'), modelLabel),
          reasoning === undefined ? null : cell('effort', t('effortLabel'), effortLabel),
          speedSupported ? cell('speed', t('speedTitle'), t(fast ? 'speedFast' : 'speedStandard')) : null,
          submenu,
        ) : null,
      )
    }

    /**
     * Composer-side speed state: a chip beside the composer actions, rendered
     * whenever the selected model is a Fast-capable CLIProxyAPI route. Clicking
     * toggles the global speedMode preference directly.
     */
    function SpeedIndicator({ directory, preference, t }) {
      const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
      const snapshot = usePreferenceSnapshot(preference)
      if (state.current?.provider !== PROVIDER || !supportsFastMode(state.current?.model)) return null
      const fast = snapshot.speedMode === SPEED_MODE_FAST
      const writable = snapshot.status === 'ready' && snapshot.writable === true
      const label = t(fast ? 'speedFast' : 'speedStandard')
      return React.createElement(
        'button',
        {
          type: 'button',
          className: 'cpaSpeedChip',
          'data-fast': fast,
          'aria-pressed': fast,
          title: fill(t('speedIndicator'), { value: label }),
          disabled: !writable,
          onClick: () => {
            if (!writable) return
            void preference.set({ [SPEED_MODE_FIELD]: fast ? SPEED_MODE_STANDARD : SPEED_MODE_FAST })
          },
        },
        fast ? '⚡ ' : '',
        label,
      )
    }

    /**
     * The fetch-then-filter flow of the built-in provider editors: discovery
     * runs against the draft connection, the modal stages a checkbox selection,
     * and Apply hands it to the form (Save persists).
     */
    function ModelFilterModal({ fetchModels, initialSelection, onApply, onClose, t }) {
      const [status, setStatus] = useState('loading')
      const [error, setError] = useState('')
      const [models, setModels] = useState([])
      const [checked, setChecked] = useState(() => new Set())

      useEffect(() => {
        let active = true
        fetchModels().then((list) => {
          if (!active) return
          setModels(list)
          const selected = initialSelection
          setChecked(new Set(selected === null ? list.map((model) => model.id) : list.filter((model) => selected.includes(model.id)).map((model) => model.id)))
          setStatus('ready')
        }, (fetchError) => {
          if (!active) return
          setError(fetchError instanceof Error ? fetchError.message : String(fetchError))
          setStatus('error')
        })
        return () => {
          active = false
        }
      }, [])

      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [onClose])

      const toggle = (id) => {
        setChecked((current) => {
          const next = new Set(current)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }
      const apply = () => {
        // Checking every fetched model is equivalent to serving the catalog.
        onApply(checked.size >= models.length ? null : [...checked])
      }

      return React.createElement(
        'div',
        { className: 'cpaModalOverlay', role: 'presentation', onMouseDown: (event) => {
          if (event.target === event.currentTarget) onClose()
        } },
        React.createElement(
          'div',
          { className: 'cpaModal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('modelsModalTitle') },
          React.createElement('h3', { className: 'cpaModalTitle' }, t('modelsModalTitle')),
          React.createElement('p', { className: 'cpaModalHint' }, t('modelsModalHint')),
          status === 'loading'
            ? React.createElement('div', { className: 'cpaModalStatus', role: 'status' }, t('modelsLoading'))
            : null,
          status === 'error'
            ? React.createElement('div', { className: 'cpaModalError', role: 'alert' }, error)
            : null,
          status === 'ready'
            ? React.createElement(
              React.Fragment,
              null,
              React.createElement(
                'div',
                { className: 'cpaModalToolbar' },
                React.createElement('button', { type: 'button', className: 'cpaModalButton', onClick: () => setChecked(new Set(models.map((model) => model.id))) }, t('selectAll')),
                React.createElement('button', { type: 'button', className: 'cpaModalButton', onClick: () => setChecked(new Set()) }, t('selectNone')),
                React.createElement('span', { className: 'cpaModalHint' }, fill(t('modelsSelected'), { count: checked.size })),
              ),
              React.createElement(
                'div',
                { className: 'cpaModalList', role: 'group', 'aria-label': t('modelsModalTitle') },
                models.map((model) => React.createElement(
                  'button',
                  {
                    key: model.id,
                    type: 'button',
                    className: 'cpaModalRow',
                    role: 'checkbox',
                    'aria-checked': checked.has(model.id),
                    onClick: () => toggle(model.id),
                  },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: checked.has(model.id),
                    readOnly: true,
                    tabIndex: -1,
                  }),
                  React.createElement('span', null, model.name || model.id),
                  model.name && model.name !== model.id
                    ? React.createElement('span', { className: 'cpaModalRowId' }, model.id)
                    : null,
                )),
              ),
            )
            : null,
          React.createElement(
            'div',
            { className: 'cpaModalActions' },
            React.createElement('button', { type: 'button', className: 'cpaModalButton', onClick: onClose }, t('cancel')),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'cpaModalButton cpaModalButtonPrimary',
                disabled: status !== 'ready' || checked.size === 0,
                onClick: apply,
              },
              t('applySelection'),
            ),
          ),
        ),
      )
    }

    function createOperations(remote) {
      return {
        describeCredential: async (ref) => {
          const response = await remote.credentials.describe([ref])
          if (!response || !response.ok) {
            throw new Error(response?.error?.message || 'Harness request failed')
          }
          return response.value[ref]
        },
        storeCredential: async (ref, value) => {
          const response = await remote.credentials.set(ref, value)
          if (!response || !response.ok) {
            throw new Error(response?.error?.message || 'Harness request failed')
          }
        },
        discoverModels: async (settingsNs, request) => {
          const response = await remote.llm.discoverModels(settingsNs, request)
          if (!response || !response.ok) {
            throw new Error(response?.error?.message || 'Harness request failed')
          }
          return response.value
        },
        mutateSettings: async (ns, ops, expectedRevision) => {
          const response = await remote.settings.mutate(ns, ops, expectedRevision)
          if (!response || !response.ok) {
            throw new Error(response?.error?.message || 'Harness request failed')
          }
          return response.value
        },
      }
    }

    function installModelPicker(ctx, preference, t) {
      // Activation is gated on the inject declaration above, so both services
      // are guaranteed present by the time apply runs.
      const modelDirectories = ctx.get('modelDirectories')
      const sessions = ctx.get('sessions')
      console.info('[dsh-cliproxyapi] composer slots install', {
        modelDirectories: modelDirectories !== undefined,
        sessions: sessions !== undefined,
      })
      if (modelDirectories === undefined) return
      ctx.slots.inject(MODEL_SLOT, () => ctx.slots.register({
        name: MODEL_SLOT,
        // Dynamic registrations are auto-assigned a shadowing priority below
        // any shipped entry, which is what wins this single seat.
        priority: -10,
        locale: SETTINGS_LOCALE_NS,
        inject: (sessionId) => {
          const directory = modelDirectories.directoryFor(sessionId)
          const available = sessions?.subagentAddress(sessionId) === undefined
          return {
            available,
            directory: directory.store,
            load: () => {
              if (available) void directory.load()
            },
            select: (selection) => available
              ? directory.select(selection).then(() => true, () => false)
              : Promise.resolve(false),
            preference,
          }
        },
      }, CliProxyModelSelect))
      // The composer-side speed state chip, rendered only for Fast-capable
      // CLIProxyAPI selections.
      ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
        name: 'conversation.input.right',
        id: 'cliproxyapi-speed',
        order: 15,
        locale: SETTINGS_LOCALE_NS,
        inject: (sessionId) => ({
          directory: modelDirectories.directoryFor(sessionId).store,
          preference,
          t,
        }),
      }, SpeedIndicator))
    }

    function apply(ctx) {
      const remote = ctx.remote
      const locale = ctx.locale
      const settingsScope = ctx.settingsScope
      const t = locale.bind(SETTINGS_LOCALE_NS)
      const scope = settingsScope.bind({ namespace: SETTINGS_NS })
      const operations = createOperations(remote)
      const preference = createPreference(scope, operations)

      ctx.effect(
        () => locale.register(SETTINGS_LOCALE_NS, copy),
        'dsh-provider-cpa: dictionaries',
      )
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-cliproxyapi-provider'
        tag.textContent = STYLE
        document.head.append(tag)
        return () => tag.remove()
      }, 'dsh-provider-cpa: picker style')

      ctx.slots.inject(SETTINGS_SLOT, () => ctx.slots.register({
        name: SETTINGS_SLOT,
        id: SETTINGS_SECTION_ID,
        order: SETTINGS_SECTION_ORDER,
        label: () => t('tab'),
        locale: SETTINGS_LOCALE_NS,
        inject: () => ({ operations, remote, preference, t }),
      }, SettingsSection))

      installModelPicker(ctx, preference, t)
    }

    exports.apply = apply
    exports.inject = inject
    exports.installConfiguration = installConfiguration
    exports.removeConfiguration = removeConfiguration
    exports.supportsFastMode = supportsFastMode
    exports.createPreference = createPreference
    exports.modelSelect = CliProxyModelSelect
    exports.settingsSection = SettingsSection
    return module.exports
  },
})
