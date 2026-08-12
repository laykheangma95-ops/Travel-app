/**
 * Domner fulfilment worker — entrypoint and scheduler.
 *
 * SCAFFOLD (Phase 1). Phase 3 builds the real scheduler:
 *   - fulfil  every 30s   claim `paid` orders, at most 10 per tick
 *   - balance hourly      prepaid supplier balance check
 *   - usage   every 15m   usage sync
 *   - HTTP    POST /webhooks/gohub and GET /health, nothing else
 *   - SIGTERM graceful shutdown that releases claim locks
 *
 * This process holds the only copy of the GoHub credentials. It polls
 * Postgres for work; Vercel never calls it.
 */

function main(): void {
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'worker scaffold — no jobs registered yet',
      phase: 1,
    }),
  );
}

main();
