# Photo diary API production rollout

- [x] Confirm requested main merge commit and read deployment documentation.
- [x] Check new migration application history.
- [ ] Apply only the new migration once — source SQL corrected to reference public.profiles(user_id) and set service-only privileges before enabling RLS. Actual Cloud preflight and application remain pending.
- [ ] Deploy only api and its imported dependencies — waits for migration success.
- [ ] Independently fetch and verify production OpenAPI 1.1.0 — waits for api deployment.
- [ ] Production PostgREST write tests in isolated dedicated environment/account — no dedicated environment/account established.
- [ ] User-designated single-target API readback and FlowLog image display — waits for user-designated date, block ID, and image URL; separate later step. No owner production writes or canary apply performed.