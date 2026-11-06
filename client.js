// dsh-account-glance — browser half.
//
// A compact card registered into `sidebar.footer.action`, directly above the
// sidebar's account avatar: account balance, the current off-peak/peak billing
// window with a countdown to the next switch, and the rate of both windows.
//
// Balance comes from the account Remote namespace (`remote.account.getState`
// then `getBalance`), refreshed once a minute and whenever the window becomes
// visible again. The billing window is computed locally in Beijing time:
// DeepSeek charges peak prices on workdays 09:00-12:00 and 14:00-18:00 and
// off-peak prices at half the peak rate for every other time, weekends included.
window.__ModuleLoader__.load({
  id: '@kang7897/dsh-account-glance',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'accountGlance'
    const DAY_MS = 24 * 60 * 60 * 1000
    const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
    /** Workday peak windows in Beijing wall-clock minutes after midnight. */
    const PEAK_WINDOWS = [
      [9 * 60, 12 * 60],
      [14 * 60, 18 * 60],
    ]
    const PEAK_BOUNDARIES = [9 * 60, 12 * 60, 14 * 60, 18 * 60]
    const COUNTDOWN_TICK_MS = 20 * 1000
    const BALANCE_REFRESH_MS = 60 * 1000
    const FALLBACK_VERSION = '0.2.1-rc.5'

    const en = {
      balance: 'Balance',
      window: 'Window',
      rate: 'Rate',
      peak: 'Peak',
      idle: 'Off-peak',
      toIdle: 'Off-peak in',
      toBusy: 'Peak in',
      offPeakRate: 'Off-peak 50%',
      peakRate: 'Peak full',
      signedOut: 'Sign in to view',
      unavailable: 'Unavailable',
      loading: 'Loading',
      reason: 'Reason',
      bonus: 'Bonus',
      updated: 'Updated',
      tipSchedule:
        'Peak runs Mon-Fri 09:00-12:00 and 14:00-18:00 (Beijing time). Every other time, including weekends, is off-peak at 50% of the peak rate.',
      tipRefresh: 'The balance refreshes automatically every 60 seconds.',
    }
    const zh = {
      balance: '余额',
      window: '时段',
      rate: '费率',
      peak: '忙时',
      idle: '闲时',
      toIdle: '距闲时',
      toBusy: '距忙时',
      offPeakRate: '闲时 5 折',
      peakRate: '忙时 原价',
      signedOut: '登录后查看',
      unavailable: '暂不可用',
      loading: '读取中',
      reason: '原因',
      bonus: '赠送余额',
      updated: '更新于',
      tipSchedule:
        '忙时：周一至周五 09:00-12:00、14:00-18:00（北京时间）。其余时间及周六、周日为闲时，闲时费率为忙时的 5 折。',
      tipRefresh: '余额每 60 秒自动刷新。',
    }

    /** The DSH client version, read from the boot graph when present. */
    function dshVersion() {
      try {
        const release = globalThis.__DSH_BOOT__ && globalThis.__DSH_BOOT__.release
        if (release && typeof release.version === 'string' && release.version) return release.version
      } catch {
        /* the boot graph is optional */
      }
      return FALLBACK_VERSION
    }

    function isChinese(locale) {
      return typeof locale === 'string' && locale.toLowerCase().startsWith('zh')
    }

    /** Beijing wall-clock fields for one instant; Shanghai has no DST. */
    function beijingClock(ms) {
      const d = new Date(ms + BEIJING_OFFSET_MS)
      return {
        weekday: d.getUTCDay(),
        minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
        midnight: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - BEIJING_OFFSET_MS,
      }
    }

    function isPeakAt(ms) {
      const { weekday, minutes } = beijingClock(ms)
      if (weekday === 0 || weekday === 6) return false
      return PEAK_WINDOWS.some(([start, end]) => minutes >= start && minutes < end)
    }

    /** The next instant at which the billing window changes. */
    function nextSwitchAt(ms) {
      const { midnight } = beijingClock(ms)
      let best = Infinity
      for (let day = 0; day < 10; day += 1) {
        const dayStart = midnight + day * DAY_MS
        const weekday = new Date(dayStart + BEIJING_OFFSET_MS).getUTCDay()
        if (weekday === 0 || weekday === 6) continue
        for (const minutes of PEAK_BOUNDARIES) {
          const at = dayStart + minutes * 60 * 1000
          if (at > ms && at < best) best = at
        }
      }
      return best
    }

    function formatRemaining(ms, chinese) {
      if (!Number.isFinite(ms) || ms <= 0) return chinese ? '即将切换' : 'switching now'
      const total = Math.max(1, Math.ceil(ms / 60000))
      if (total < 60) return chinese ? `${total} 分钟` : `${total} min`
      const hours = Math.floor(total / 60)
      const minutes = total % 60
      if (minutes === 0) return chinese ? `${hours} 小时` : `${hours} h`
      return chinese ? `${hours} 小时 ${minutes} 分` : `${hours} h ${minutes} min`
    }

    function amountOf(text) {
      if (typeof text !== 'string' || text.trim() === '') return undefined
      const value = Number(text)
      return Number.isFinite(value) ? value : undefined
    }

    /** Platform-like money formatting: two decimals, positive sub-cent shown as <0.01. */
    function formatAmount(wallet) {
      const currency = wallet && typeof wallet.currency === 'string' ? wallet.currency : ''
      const prefix = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : currency ? `${currency} ` : ''
      const value = amountOf(wallet && wallet.balance)
      if (value === undefined) {
        const raw = wallet && typeof wallet.balance === 'string' ? wallet.balance : '—'
        return prefix + raw
      }
      const negative = value < 0
      const abs = Math.abs(value)
      let text
      if (abs > 0 && abs < 0.01) text = negative ? '0.01' : '<0.01'
      else {
        // Truncate positive amounts to cents (round negatives) like Platform Web,
        // with a small epsilon so 2.55 does not truncate to 2.54.
        const scaled = abs * 100 + 1e-7
        const cents = negative ? Math.round(scaled) : Math.floor(scaled)
        text = (cents / 100).toLocaleString('zh-CN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      }
      return `${negative ? '-' : ''}${prefix}${text}`
    }

    function walletsText(wallets) {
      if (!Array.isArray(wallets) || wallets.length === 0) return '—'
      return wallets.map(formatAmount).join(' / ')
    }

    function positiveWallets(wallets) {
      if (!Array.isArray(wallets)) return []
      return wallets.filter((wallet) => {
        const value = amountOf(wallet && wallet.balance)
        return value !== undefined && value > 0
      })
    }

    /** Short human-readable reason from a failed RemoteResult. */
    function remoteReason(result, fallback) {
      const error = result && result.error
      if (error && typeof error === 'object') {
        const code = typeof error.code === 'string' ? error.code : ''
        const message = typeof error.message === 'string' ? error.message : ''
        const text = [code, message].filter(Boolean).join(': ')
        if (text) return text
      }
      return fallback
    }

    const styles = {
      card: {
        boxSizing: 'border-box',
        flex: '0 0 100%',
        maxWidth: '100%',
        margin: '8px 0 0',
        padding: '8px 10px',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        borderRadius: 'var(--dsw-radius-md, 10px)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        fontVariantNumeric: 'tabular-nums',
      },
      row: {
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: '8px',
        minWidth: 0,
      },
      label: {
        flex: 'none',
        fontSize: '11px',
        lineHeight: '16px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      value: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '4px',
        minWidth: 0,
        fontSize: '11px',
        lineHeight: '16px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      },
      amount: {
        fontSize: '15px',
        lineHeight: '20px',
        fontWeight: 600,
        letterSpacing: '0.01em',
      },
      dot: {
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        flex: 'none',
      },
      muted: {
        color: 'var(--dsw-alias-label-secondary)',
      },
      separator: {
        color: 'var(--dsw-alias-label-secondary)',
        opacity: 0.7,
      },
    }

    /** Build the slot component so it closes over the plugin context. */
    function createPanel(ctx) {
      return function AccountGlance(props) {
        const wide = props.wide !== false
        const t = typeof props.t === 'function' ? props.t : (key) => key
        const locale = ctx.locale.getSnapshot().active
        const chinese = isChinese(locale)
        const [now, setNow] = React.useState(() => Date.now())
        const [balance, setBalance] = React.useState({ status: 'loading' })
        const alive = React.useRef(true)
        const loadedAt = React.useRef(0)

        const load = React.useCallback(async () => {
          if (document.visibilityState === 'hidden') return
          const metadata = {
            version: dshVersion(),
            locale: ctx.locale.getSnapshot().active,
            timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
          }
          try {
            const account = ctx.remote.account
            let view
            if (typeof account.getState === 'function') {
              const state = await account.getState()
              if (!state || state.ok !== true) throw new Error(remoteReason(state, 'account state unavailable'))
              view = state.value
              if (!view || view.status !== 'credential-stored') {
                if (alive.current) setBalance({ status: 'signed-out' })
                return
              }
            }
            const result = await account.getBalance(metadata)
            if (!alive.current) return
            if (!result || result.ok !== true) throw new Error(remoteReason(result, 'balance request failed'))
            const value = result.value
            if (value === null || value === undefined) {
              setBalance({ status: 'signed-out' })
              return
            }
            if (value.status !== 'ready') throw new Error('platform balance failed')
            loadedAt.current = Date.now()
            setBalance({
              status: 'ready',
              wallets: Array.isArray(value.value) ? value.value : [],
              bonusWallets: Array.isArray(value.bonusWallets) ? value.bonusWallets : [],
              at: loadedAt.current,
            })
          } catch (error) {
            if (!alive.current) return
            const reason = error && error.message ? String(error.message).replace(/\s+/g, ' ').slice(0, 120) : 'unknown'
            setBalance((previous) =>
              previous.status === 'ready' ? { ...previous, stale: true, reason } : { status: 'failed', reason },
            )
          }
        }, [])

        React.useEffect(() => {
          alive.current = true
          load()
          const refresh = setInterval(load, BALANCE_REFRESH_MS)
          const onFocus = () => {
            if (Date.now() - loadedAt.current > 30 * 1000) load()
          }
          const onVisibility = () => {
            if (document.visibilityState === 'visible') onFocus()
          }
          window.addEventListener('focus', onFocus)
          document.addEventListener('visibilitychange', onVisibility)
          return () => {
            alive.current = false
            clearInterval(refresh)
            window.removeEventListener('focus', onFocus)
            document.removeEventListener('visibilitychange', onVisibility)
          }
        }, [load])

        React.useEffect(() => {
          const tick = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS)
          return () => clearInterval(tick)
        }, [])

        if (!wide) return null

        const peak = isPeakAt(now)
        const remaining = formatRemaining(nextSwitchAt(now) - now, chinese)
        const statusColor = peak
          ? 'var(--dsw-alias-state-warn-primary)'
          : 'var(--dsw-alias-state-success-primary)'

        let balanceText = t('loading')
        if (balance.status === 'ready') {
          balanceText = walletsText(balance.wallets)
        } else if (balance.status === 'signed-out') {
          balanceText = t('signedOut')
        } else if (balance.status === 'failed') {
          balanceText = t('unavailable')
        }

        const bonus = balance.status === 'ready' ? positiveWallets(balance.bonusWallets) : []
        const tips = [t('tipSchedule'), t('tipRefresh')]
        if (balance.reason) tips.push(`${t('reason')} ${balance.reason}`)
        if (bonus.length > 0) tips.push(`${t('bonus')} ${walletsText(bonus)}`)
        if (balance.status === 'ready' && balance.at) {
          const time = new Date(balance.at).toLocaleTimeString(chinese ? 'zh-CN' : 'en-US', {
            hour: '2-digit',
            minute: '2-digit',
          })
          tips.push(`${t('updated')} ${time}`)
        }

        return h(
          'div',
          {
            'data-plugin': 'account-glance',
            role: 'group',
            'aria-label': t('balance'),
            title: tips.join('\n'),
            style: styles.card,
          },
          h(
            'div',
            { style: styles.row },
            h('span', { style: styles.label }, t('balance')),
            h(
              'span',
              {
                style: {
                  ...styles.value,
                  ...styles.amount,
                  color:
                    balance.status === 'ready'
                      ? 'var(--dsw-alias-label-primary)'
                      : balance.status === 'failed'
                        ? 'var(--dsw-alias-state-error-primary)'
                        : 'var(--dsw-alias-label-secondary)',
                  fontWeight: balance.status === 'ready' ? 600 : 400,
                  opacity: balance.status === 'ready' && balance.stale ? 0.6 : 1,
                },
              },
              balanceText,
            ),
          ),
          h(
            'div',
            { style: styles.row },
            h('span', { style: styles.label }, t('window')),
            h(
              'span',
              { style: styles.value },
              h('span', {
                style: { ...styles.dot, background: statusColor },
                'aria-hidden': true,
              }),
              h(
                'span',
                { style: { color: statusColor, fontWeight: 500, flex: 'none' } },
                t(peak ? 'peak' : 'idle'),
              ),
              h('span', { style: styles.separator }, '·'),
              h(
                'span',
                { style: { ...styles.muted, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } },
                `${t(peak ? 'toIdle' : 'toBusy')} ${remaining}`,
              ),
            ),
          ),
          h(
            'div',
            { style: styles.row },
            h('span', { style: styles.label }, t('rate')),
            h(
              'span',
              { style: { ...styles.value, gap: '2px' } },
              h(
                'span',
                {
                  style: {
                    color: peak ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-state-success-primary)',
                    fontWeight: peak ? 400 : 500,
                  },
                },
                t('offPeakRate'),
              ),
              h('span', { style: styles.separator }, '·'),
              h(
                'span',
                {
                  style: {
                    color: peak ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-label-secondary)',
                    fontWeight: peak ? 500 : 400,
                  },
                },
                t('peakRate'),
              ),
            ),
          ),
        )
      }
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'account-glance: dictionaries')
      // The footer action row lays its children out inline; this card needs a
      // full row of its own above the account avatar.
      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-plugin', 'account-glance')
        style.textContent = 'div[class*="_footerActions"]{flex-wrap:wrap}'
        document.head.appendChild(style)
        return () => style.remove()
      }, 'account-glance: footer row wrap')

      const AccountGlance = createPanel(ctx)
      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register(
          {
            name: 'sidebar.footer.action',
            id: 'account-glance',
            order: 100,
            locale: NS,
          },
          AccountGlance,
        ),
      )
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.account'],
      apply,
    }
  },
})
