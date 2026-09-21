# Sales returns and voids rollout

## Deployment order

1. Deploy the database migrations, including `20260919170000_non_cash_adjustment_refunds`.
2. Deploy the API with `SALES_ADJUSTMENTS_ENABLED=false`.
3. Deploy the web app with `VITE_SALES_ADJUSTMENTS_ENABLED=false`.
4. Run the focused contract, API integration, component, and Playwright checks.
5. Enable the API first, then rebuild/deploy the web app with both flags set to `true`.

Both flags default to enabled for local development and existing environments. Production rollout should set them explicitly.

## Rollback

Set `SALES_ADJUSTMENTS_ENABLED=false` to reject new return/void commands with HTTP 503, then rebuild the web app with `VITE_SALES_ADJUSTMENTS_ENABLED=false` to hide the actions. Sales and adjustment history remain readable. Do not roll back or delete append-only adjustment, inventory, or cash ledger rows.

The schema migration is forward-only: `PENDING` enum values and nullable adjustment shift references remain compatible with completed cash adjustments.
