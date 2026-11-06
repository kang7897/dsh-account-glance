# dsh-account-glance

A compact DeepSeek account panel in the sidebar footer, directly above the account avatar. One card shows the account balance, the current off-peak/peak billing window with a countdown to the next switch, and the rate of both windows.

English | [中文](#中文)

## Features

- **Balance** — the signed-in DeepSeek account balance (top-up plus bonus wallets). Refreshed once a minute, on window focus, and when the page becomes visible again. Shows a short reason on failure and keeps the last good value when a refresh fails.
- **Billing window** — peak or off-peak, computed locally in Beijing time without any network request: peak on workdays 09:00–12:00 and 14:00–18:00, off-peak at half the peak rate at all other times (weekends included). A live countdown shows the time to the next switch.
- **Rate** — off-peak 50% / peak full price, with the active one highlighted.
- **Locale** — zh/en copy, following the client locale.
- Zero runtime dependencies; the host half is an empty module, all behaviour lives in the web client and uses the shipped `remote.account` namespace.

## Install

Settings → Plugins → Install:

```
github:kang7897/dsh-account-glance
```

Requires DeepSeek Harness 0.2.x and a signed-in DeepSeek account. Nothing is written back or sent anywhere except reading the account state and balance through the built-in Remote API.

## How it works

`index.js` is the host half (no-op). `client.js` registers a `sidebar.footer.action` slot via the module loader, injects `slots`, `locale`, `remote` and `remote.account`, and calls `remote.account.getState()` / `getBalance(metadata)`. The billing schedule is pure local arithmetic on Beijing wall-clock time, so the card works even when the balance endpoint is unavailable.

## License

MIT

## 中文

侧栏左下角头像上方的紧凑账户卡片：显示 DeepSeek 账户余额、当前闲时/忙时计费时段及切换倒计时、以及两种时段的费率。余额每 60 秒自动刷新，窗口重新可见或获得焦点时也会刷新；闲忙时段按北京时间本地计算，不发起网络请求。支持中英文，无运行时依赖。
