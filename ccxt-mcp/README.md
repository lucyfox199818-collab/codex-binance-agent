# ccxt-mcp

`ccxt-mcp` 是一个独立的 MCP stdio 服务，用 CCXT 暴露加密货币交易所能力给 Codex 调用。默认交易关闭并启用 dry-run；需要真实下单时必须同时设置 `CCXT_ENABLE_TRADING=true` 和 `CCXT_DRY_RUN=false`。

## 功能

- 市场数据：markets、ticker、tickers、ticker summary、order book、trades、OHLCV、交易所状态、交易所时间、币种、手续费。
- 账户信息：accounts、balance/free/used/total balance、positions、ledger、my trades、充值/提现记录、充值地址、杠杆档位。
- 订单交易：普通下单/批量下单、查询订单、查询全部订单、编辑订单、撤单、批量撤单、全部撤单。
- 条件单和衍生品交易：trigger、stop loss、take profit、stop order、stop limit、stop market、trailing、post-only、reduce-only、TP/SL 组合单。
- 合约/资金费率：funding rate/history、open interest/history、mark price、mark/index/premium index OHLCV。
- 账户变更：set leverage、margin mode、position mode、add/reduce/set margin、transfer、withdraw，全部走交易开关和 dry-run 保护。
- 通用能力：`ccxt_call` 可以调用当前交易所实例上存在的任意 CCXT 方法，包含 unified API 和 exchange-specific implicit API。
- 代理/IP：支持 `TRADINGAGENTS_PROXY_URL` 或 `CCXT_PROXY_URL`，并提供 `ccxt_proxy_ip` 检查当前出口 IP 是否命中配置的白名单 IP。
- Docker：支持构建成独立镜像，通过 stdio 运行 MCP。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `TRADINGAGENTS_PROXY_URL` / `CCXT_PROXY_URL` | HTTP、HTTPS、SOCKS4 或 SOCKS5 代理 URL。 |
| `BINANCE_API_KEY` / `CCXT_API_KEY` | API key。 |
| `BINANCE_API_SECRET` / `CCXT_SECRET` / `CCXT_API_SECRET` | API secret。 |
| `CCXT_EXCHANGE_ID` | CCXT 交易所 ID，默认 `binance`。 |
| `CCXT_DEFAULT_TYPE` | Binance 常用市场类型，例如 `spot`、`future`、`swap`。 |
| `CCXT_SANDBOX` | 是否开启交易所 sandbox/testnet。 |
| `CCXT_ENABLE_TRADING` | 是否允许真实交易类调用，默认 `false`。 |
| `CCXT_DRY_RUN` | 是否强制 dry-run，默认 `true`。 |
| `CCXT_WHITELIST_IPS` / `BINANCE_WHITELIST_IPS` | 逗号分隔的预期出口 IP，用于 `ccxt_proxy_ip` 对比。 |
| `CCXT_IP_CHECK_URL` | 出口 IP 检查地址，默认 `https://api.ipify.org?format=json`。 |

## 本地运行

```bash
cd ccxt-mcp
npm install
npm run build
node dist/index.js
```

Codex MCP stdio 配置示例：

```json
{
  "mcpServers": {
    "ccxt": {
      "command": "node",
      "args": ["/home/adon/codes/codex-binance-agent/ccxt-mcp/dist/index.js"],
      "cwd": "/home/adon/codes/codex-binance-agent/ccxt-mcp"
    }
  }
}
```

## Docker

```bash
cd ccxt-mcp
docker build -t ccxt-mcp:local .
docker run --rm -i --env-file .env ccxt-mcp:local
```

Docker MCP stdio 配置示例：

```json
{
  "mcpServers": {
    "ccxt": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "--env-file", "/home/adon/codes/codex-binance-agent/ccxt-mcp/.env", "ccxt-mcp:local"]
    }
  }
}
```

## 工具列表

当前显式注册 94 个 MCP tools；此外 `ccxt_call` 可以调用当前交易所实例上存在的任意 CCXT 方法。

基础和市场数据：

- `ccxt_get_config`
- `ccxt_list_exchanges`
- `ccxt_exchange_info`
- `ccxt_proxy_ip`
- `ccxt_load_markets`
- `ccxt_fetch_currencies`
- `ccxt_fetch_status`
- `ccxt_fetch_time`
- `ccxt_fetch_ticker`
- `ccxt_fetch_tickers`
- `ccxt_fetch_ticker_summary`
- `ccxt_fetch_order_book`
- `ccxt_fetch_trades`
- `ccxt_fetch_ohlcv`
- `ccxt_fetch_trading_fees`
- `ccxt_fetch_trading_fee`
- `ccxt_fetch_deposit_withdraw_fees`
- `ccxt_fetch_deposit_withdraw_fee`
- `ccxt_call`

账户信息：

- `ccxt_fetch_accounts`
- `ccxt_fetch_balance`
- `ccxt_fetch_free_balance`
- `ccxt_fetch_used_balance`
- `ccxt_fetch_total_balance`
- `ccxt_fetch_positions`
- `ccxt_fetch_positions_for_symbol`
- `ccxt_fetch_positions_risk`
- `ccxt_fetch_positions_history`
- `ccxt_fetch_leverage`
- `ccxt_fetch_leverages`
- `ccxt_fetch_leverage_tiers`
- `ccxt_fetch_market_leverage_tiers`
- `ccxt_fetch_ledger`
- `ccxt_fetch_ledger_entry`
- `ccxt_fetch_my_trades`
- `ccxt_fetch_order_trades`
- `ccxt_fetch_deposit_address`
- `ccxt_fetch_deposit_addresses`
- `ccxt_fetch_deposit_addresses_by_network`
- `ccxt_fetch_deposits`
- `ccxt_fetch_withdrawals`
- `ccxt_fetch_deposits_withdrawals`
- `ccxt_fetch_borrow_interest`

订单和条件单：

- `ccxt_fetch_order`
- `ccxt_fetch_orders`
- `ccxt_fetch_open_orders`
- `ccxt_fetch_open_algo_orders`
- `ccxt_cancel_algo_order`
- `ccxt_cancel_all_algo_orders`
- `ccxt_fetch_closed_orders`
- `ccxt_fetch_canceled_orders`
- `ccxt_fetch_canceled_and_closed_orders`
- `ccxt_create_order`
- `ccxt_create_orders`
- `ccxt_edit_order`
- `ccxt_edit_orders`
- `ccxt_cancel_order`
- `ccxt_cancel_orders`
- `ccxt_cancel_all_orders`
- `ccxt_cancel_all_orders_after`
- `ccxt_cancel_orders_for_symbols`
- `ccxt_create_limit_order`
- `ccxt_create_market_order`
- `ccxt_create_trigger_order`
- `ccxt_create_stop_loss_order`
- `ccxt_create_take_profit_order`
- `ccxt_create_order_with_take_profit_and_stop_loss`
- `ccxt_create_trailing_amount_order`
- `ccxt_create_trailing_percent_order`
- `ccxt_create_stop_order`
- `ccxt_create_stop_limit_order`
- `ccxt_create_stop_market_order`
- `ccxt_create_post_only_order`
- `ccxt_create_reduce_only_order`

Binance USDT-M close-position 保护单默认会跳过同合约、同方向、同仓位方向的重复
`STOP_MARKET` / `TAKE_PROFIT_MARKET` algo 单。需要替换已有保护单时，在创建请求的
`params` 里显式传 `replaceExistingClosePosition: true`；工具会先取消匹配的旧 algo 单，
再提交新的 close-position 保护单，并返回撤单和新单结果。

合约和账户变更：

- `ccxt_fetch_funding_rate`
- `ccxt_fetch_funding_rates`
- `ccxt_fetch_funding_rate_history`
- `ccxt_fetch_funding_history`
- `ccxt_fetch_open_interest`
- `ccxt_fetch_open_interests`
- `ccxt_fetch_open_interest_history`
- `ccxt_fetch_mark_price`
- `ccxt_fetch_mark_prices`
- `ccxt_fetch_mark_ohlcv`
- `ccxt_fetch_index_ohlcv`
- `ccxt_fetch_premium_index_ohlcv`
- `ccxt_set_leverage`
- `ccxt_set_margin_mode`
- `ccxt_set_position_mode`
- `ccxt_add_margin`
- `ccxt_reduce_margin`
- `ccxt_set_margin`
- `ccxt_transfer`
- `ccxt_withdraw`

所有 mutating 工具都会经过交易开关。默认返回 dry-run，不会真实请求下单、撤单、改杠杆、划转或提现类操作。
