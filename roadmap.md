# Photo diary API production rollout

- [x] Confirm PR #7 main merge commit 9ef2caeaa7567e09219d4ee6049948d789278d61 and read deployment documentation; deployment sources match this commit.
- [x] Check new migration application history and prerequisites; migration, revision column, receipts table and RPCs are absent; profiles.user_id is unique.
- [ ] Apply only the new migration once — source SQL corrected to reference public.profiles(user_id) and set service-only privileges before enabling RLS. Actual Cloud preflight and application remain pending.
- [ ] Deploy only api and its imported dependencies — waits for migration success.
- [ ] Independently fetch and verify production OpenAPI 1.1.0 — waits for api deployment.
- [ ] Production PostgREST write tests in isolated dedicated environment/account — no dedicated environment/account established.
- [ ] User-designated single-target API readback and FlowLog image display — waits for user-designated date, block ID, and image URL; separate later step. No owner production writes or canary apply performed.