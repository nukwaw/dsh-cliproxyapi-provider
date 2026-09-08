window.__ModuleLoader__.load({
  id: '@router-for-me/dsh-cliproxyapi-provider',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const {
      useEffect,
      useMemo,
      useState,
      useSyncExternalStore,
    } = React

    const PI_NS = 'llm-pi-ai'
    const DISCOVERY_NS = 'llm-cliproxyapi'
    const CREDENTIAL_REF = 'DSH_CLIPROXY_API_KEY'
    const PROVIDER = 'CLIProxyAPI'
    const DEFAULT_BASE_URL = 'http://127.0.0.1:8317/v1'
    const PROFILE_SYNC_HEADER = 'x-dsh-provider-cpa-sync'
    const PROFILE_SYNC_TIMEOUT_MS = 30000
    const PLACEHOLDER_AUTHORIZATION = 'Bearer dsh-cliproxyapi-no-key'
    const SETTINGS_SLOT = 'settings.section'
    const SETTINGS_SECTION_ID = 'cliproxyapi'
    const SETTINGS_SECTION_ORDER = 20
    const SETTINGS_LOCALE_NS = 'settings.cliProxyApi'
    const inject = [
      'slots',
      'locale',
      'remote',
      'remote.credentials',
      'remote.llm',
      'remote.settings',
      'settingsScope',
    ]

    const copy = {
      en: {
        tab: 'CLIProxyAPI',
        title: 'CLIProxyAPI',
        intro: 'Connect a CLIProxyAPI server and synchronize its model catalog.',
        loading: 'Loading CLIProxyAPI settings…',
        unavailable: 'CLIProxyAPI settings are unavailable in this Web profile.',
        readOnly: 'Settings are read-only for this connection.',
        statusConfigured: 'Connected',
        modelsSynced: 'models synchronized',
        notConfigured: 'CLIProxyAPI is not configured yet.',
        baseURL: 'Base URL',
        apiKey: 'API key',
        apiKeyPlaceholder: 'Optional for a keyless CLIProxyAPI server',
        apiKeyConfiguredPlaceholder: 'API key already saved',
        credentialConfiguredLabel: 'Configured',
        save: 'Save & Sync',
        saving: 'Saving…',
        saved: 'Saved. The CLIProxyAPI model catalog is synchronized.',
        remove: 'Remove',
        removing: 'Removing…',
        removed: 'The CLIProxyAPI provider was removed.',
        syncTimeout: 'Timed out waiting for CLIProxyAPI to write the complete model catalog.',
        baseRequired: 'Base URL is required.',
        baseInvalid: 'Base URL must be a valid HTTP or HTTPS URL.',
        noModels: 'CLIProxyAPI returned no usable models.',
      },
      zh: {
        tab: 'CLIProxyAPI',
        title: 'CLIProxyAPI',
        intro: '连接 CLIProxyAPI 服务并同步其模型目录。',
        loading: '正在读取 CLIProxyAPI 设置…',
        unavailable: '当前 Web 配置中无法访问 CLIProxyAPI 设置。',
        readOnly: '当前连接的设置为只读。',
        statusConfigured: '已连接',
        modelsSynced: '个模型已同步',
        notConfigured: '尚未配置 CLIProxyAPI。',
        baseURL: 'Base URL',
        apiKey: 'API Key',
        apiKeyPlaceholder: '无鉴权的 CLIProxyAPI 可留空',
        apiKeyConfiguredPlaceholder: '已保存 API Key',
        credentialConfiguredLabel: '已配置',
        save: '保存并同步',
        saving: '保存中…',
        saved: '已保存，CLIProxyAPI 模型目录已同步。',
        remove: '移除',
        removing: '移除中…',
        removed: '已移除 CLIProxyAPI 供应商。',
        syncTimeout: '等待 CLIProxyAPI 写入完整模型目录超时。',
        baseRequired: '请填写 Base URL。',
        baseInvalid: 'Base URL 必须是有效的 HTTP 或 HTTPS 地址。',
        noModels: 'CLIProxyAPI 未返回可用模型。',
      },
    }

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
      credentialStatus: {
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

    function syncValueOf(headers) {
      const key = Object.keys(headers || {}).find((candidate) => {
        return candidate.toLowerCase() === PROFILE_SYNC_HEADER
      })
      return key === undefined ? undefined : String(headers[key])
    }

    function createSyncToken() {
      return globalThis.crypto?.randomUUID?.()
        || String(Date.now()) + '-' + Math.random().toString(36).slice(2)
    }

    function bootstrapProfileOf(baseURL, models, hasCredential, syncToken) {
      return {
        displayName: PROVIDER,
        api: 'openai-responses',
        baseURL,
        models: models.map((model) => ({
          id: model.id,
          name: model.name || model.id,
          contextWindow: model.contextWindow || 262144,
          maxTokens: model.maxTokens || 32768,
        })),
        defaultContextWindow: 262144,
        defaultMaxTokens: 32768,
        defaultInput: ['text'],
        headers: {
          [PROFILE_SYNC_HEADER]: 'rich:' + syncToken,
          ...(hasCredential ? {} : { authorization: PLACEHOLDER_AUTHORIZATION }),
        },
        ...(hasCredential ? { apiKeyEnv: CREDENTIAL_REF } : {}),
      }
    }

    function waitForProfileSynchronization(scope, baseURL, initial, messages) {
      let done = false
      let timeout
      let disposeScope = () => {}
      const initialRevision = Number.isInteger(initial?.revision) ? initial.revision : undefined
      let resolveReady
      let rejectReady
      const ready = new Promise((resolve, reject) => {
        resolveReady = resolve
        rejectReady = reject
      })

      const finish = (error, profile) => {
        if (done) return
        done = true
        if (timeout !== undefined) clearTimeout(timeout)
        disposeScope()
        if (error) rejectReady(error)
        else resolveReady(profile)
      }
      const inspect = (namespace, requireNewRevision) => {
        if (
          requireNewRevision
          && initialRevision !== undefined
          && (!Number.isInteger(namespace?.revision) || namespace.revision <= initialRevision)
        ) return
        const profile = namespace?.value?.providers?.[PROVIDER]
        if (!profile || profile.baseURL !== baseURL) return
        const pending = syncValueOf(profile.headers)
        if (pending !== undefined) return
        finish(undefined, profile)
      }
      const refresh = () => {
        if (!done) inspect(scope.getSnapshot(), true)
      }

      disposeScope = scope.subscribe(refresh)
      timeout = setTimeout(() => finish(new Error(messages.syncTimeout)), PROFILE_SYNC_TIMEOUT_MS)
      inspect(initial, false)
      refresh()
      return ready
    }

    async function installInitialProfile(operations, scope, baseURL, apiKey, messages) {
      const revision = scope.getSnapshot().revision
      const credential = await operations.describeCredential(CREDENTIAL_REF)
      const discovered = await operations.discoverModels(DISCOVERY_NS, {
        provider: PROVIDER,
        baseURL,
        api: 'openai-responses',
        ...(apiKey ? { apiKey } : {}),
      })
      if (!discovered.length) throw new Error(messages.noModels)

      if (apiKey) await operations.storeCredential(CREDENTIAL_REF, apiKey)
      const hasCredential = Boolean(apiKey || credential?.configured)
      const syncToken = createSyncToken()
      const updated = await operations.mutateSettings(PI_NS, [{
        op: 'set',
        path: ['providers', PROVIDER],
        value: bootstrapProfileOf(baseURL, discovered, hasCredential, syncToken),
      }], revision)
      return waitForProfileSynchronization(scope, baseURL, updated, messages)
    }

    async function removeProfile(operations, scope) {
      await operations.mutateSettings(PI_NS, [{
        op: 'unset',
        path: ['providers', PROVIDER],
      }], scope.getSnapshot().revision)
    }

    function profileOf(snapshot) {
      const value = snapshot?.value
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
      const providers = value.providers
      if (!providers || typeof providers !== 'object' || Array.isArray(providers)) return undefined
      return providers[PROVIDER]
    }

    function messagesOf(t) {
      return {
        baseRequired: t('baseRequired'),
        baseInvalid: t('baseInvalid'),
        noModels: t('noModels'),
        syncTimeout: t('syncTimeout'),
      }
    }

    function SettingsSection({ operations, remote, scope, t }) {
      const snapshot = useSyncExternalStore(
        (listener) => scope.subscribe(listener),
        () => scope.getSnapshot(),
        () => scope.getSnapshot(),
      )
      const profile = profileOf(snapshot)
      const modelCount = Array.isArray(profile?.models) ? profile.models.length : 0
      const [baseURL, setBaseURL] = useState(DEFAULT_BASE_URL)
      const [apiKey, setApiKey] = useState('')
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
        setBaseURL(typeof profile?.baseURL === 'string' && profile.baseURL.length > 0
          ? profile.baseURL
          : DEFAULT_BASE_URL)
        setApiKey('')
        setLoadedRevision(snapshot.revision)
      }, [loadedRevision, profile?.baseURL, snapshot.revision, snapshot.status])

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

      const submit = async (event) => {
        event.preventDefault()
        if (!canWrite) return
        const nextBaseURL = baseURL.trim().replace(/\/+$/, '')
        const nextApiKey = apiKey.trim()
        setSaving(true)
        setFeedback({ text: '', error: false })
        try {
          validBaseURL(nextBaseURL, messages)
          await installInitialProfile(operations, scope, nextBaseURL, nextApiKey, messages)
          setApiKey('')
          setFeedback({ text: t('saved'), error: false })
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
        if (!canWrite || !profile) return
        setRemoving(true)
        setFeedback({ text: '', error: false })
        try {
          await removeProfile(operations, scope)
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
            profile
              ? t('statusConfigured') + ' · ' + profile.baseURL + ' · ' + modelCount + ' ' + t('modelsSynced')
              : t('notConfigured'),
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
                  { style: styles.credentialStatus, role: 'status' },
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
            profile
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

    function apply(ctx) {
      const remote = ctx.remote
      const locale = ctx.locale
      const settingsScope = ctx.settingsScope
      const t = locale.bind(SETTINGS_LOCALE_NS)
      const scope = settingsScope.bind({ namespace: PI_NS })
      const operations = createOperations(remote)

      ctx.effect(
        () => locale.register(SETTINGS_LOCALE_NS, copy),
        'dsh-provider-cpa: dictionaries',
      )

      ctx.slots.inject(SETTINGS_SLOT, () => ctx.slots.register({
        name: SETTINGS_SLOT,
        id: SETTINGS_SECTION_ID,
        order: SETTINGS_SECTION_ORDER,
        label: () => t('tab'),
        locale: SETTINGS_LOCALE_NS,
        inject: () => ({ operations, remote, scope, t }),
      }, SettingsSection))
    }

    exports.apply = apply
    exports.inject = inject
    exports.installInitialProfile = installInitialProfile
    exports.removeProfile = removeProfile
    exports.settingsSection = SettingsSection
    return module.exports
  },
})
