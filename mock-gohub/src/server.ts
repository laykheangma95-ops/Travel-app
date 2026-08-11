import { createApp } from './app';
import { config } from './config';
import { items, listings, state } from './state';

state.load();

const app = createApp();

app.listen(config.port, () => {
  console.log(`
┌─ mock-gohub ───────────────────────────────────────────────────────────────
│ Listening on   http://localhost:${config.port}
│ Base URL       http://localhost:${config.port}/api
│ X-Partner      ${config.partnerId}
│ X-Authorization${' '.repeat(1)}${config.apiKey}
│
│ Catalog        ${listings.length} listings, ${items.length} items
│ Balance        ${state.balance.toLocaleString('en-US')} VND
│ Orders         ${state.orders.size} restored from ${config.statePath}
│
│ Webhooks    →  ${state.webhookUrl ?? config.webhookUrl}
│ Fulfilment     ${config.fulfilDelayMs}ms per stage${config.webhookDuplicate ? ' (duplicating every webhook)' : ''}
│
│ Failure cases  EKHM3DPY01GB03D_FAIL  fulfilment fails, empty orderDetails
│                EKHM3DPY01GB03D_SLOW  ${config.slowFulfilDelayMs}ms per stage
│                EKHM3DPY01GB03D_HANG  no webhook ever fires
│                POST /dev/balance {"balance":0}  → insufficient balance
└────────────────────────────────────────────────────────────────────────────
`);
});
