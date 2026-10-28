# Photo diary API production rollout

- [x] Confirm requested main merge commit and read deployment documentation.
- [x] Check new migration application history.
- [ ] Apply only the new migration once — blocked: main SQL references auth.users from event_api_receipts and enables RLS before required grants, contrary to mandatory Cloud schema rules; corrected main migration is needed.
- [ ] Deploy only api and its imported dependencies — waits for migration success.
- [ ] Independently fetch and verify production OpenAPI 1.1.0 — waits for api deployment.
- [ ] Production PostgREST write tests in isolated dedicated environment/account — no dedicated environment/account established.
- [ ] User-designated single-target API readback and FlowLog image display — waits for user-designated date, block ID, and image URL; separate later step. No owner production writes or canary apply performed.