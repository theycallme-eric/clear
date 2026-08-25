> **AUTH-02** · Layer `ui` · Milestone `M0` · Carry-over `rebuild`

Email OTP request and verify flow per the design system. Typed error states; resend with cooldown.

## Acceptance

- [ ] Full round-trip works on a deployed preview URL (D-gate for M0)
- [ ] Wrong/expired code shows a typed, human error — not a raw Supabase message
- [ ] Resend disabled during cooldown with visible countdown
- [ ] Public-only: authenticated users are redirected away

---

**Depends on:** AUTH-01, DS-04
**Blocks:** —

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
