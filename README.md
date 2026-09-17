# Prediction markets AAs

Oscript autonomous agents for [Prophet](https://prophet.ooo) prediction markets.

| File | Purpose |
|---|---|
| `factory.oscript` | Deploys market AAs. Validates the parameters and picks the base AA: token or tokenless |
| `agent.oscript` | Token market. YES/NO (optionally DRAW) positions are issued as Obyte assets |
| `agent-tokenless.oscript` | Tokenless market. Positions are kept as balances inside the AA (`balance_<address>` state vars), sold with negative amounts and moved with `transfer` |
| `aa-lib.oscript` | Shared AMM math: reserve curve, exchange pricing, fees and arbitrage profit tax. Used by both agents |

The factory creates a tokenless market when `is_tokenless: true` is passed. Both markets share the same trading API (`type`, `yes_amount`, `no_amount`, `draw_amount`, `add_liquidity`, `commit`, `claim_profit`); see the `doc_url` of each agent for the field descriptions.

## Tests

Tests use [aa-testkit](https://github.com/valyakin/aa-testkit) and run a local Obyte network.

| Suite | Files | What it covers |
|---|---|---|
| Token markets | `test/base.test.oscript.js`, `test/draw-base.test.oscript.js`, `test/draw-asset.test.oscript.js`, `test/draw-asset-no-winner.test.oscript.js` | Base and custom reserve asset, with and without DRAW, no-winner flow |
| Tokenless markets | `test/tokenless-base.test.oscript.js`, `test/tokenless-draw-base.test.oscript.js`, `test/tokenless-draw-asset.test.oscript.js`, `test/tokenless-draw-asset-no-winner.test.oscript.js` | Same scenarios on the tokenless agent, plus balance checks, transfers and selling with negative amounts |
| Factory | `test/factory.test.oscript.js` | Creates token and tokenless markets from one factory, checks the asset definition chain, payments, addresses and validation |

```bash
npm install

npm test                # all suites
npm run test:token      # token markets only
npm run test:tokenless  # tokenless markets only
npm run test:factory    # factory only
```

`npm run test:all` is an alias of `npm test`.

### Lint test files

```bash
npm run lint
```


## Donations

We accept donations through [Kivach](https://kivach.org) and forward a portion of the donations to other open-source projects that made Prophet possible.

[![Kivach](https://kivach.org/api/banner?repo=byteball/prediction-markets-aa)](https://kivach.org/repo/byteball/prediction-markets-aa)
