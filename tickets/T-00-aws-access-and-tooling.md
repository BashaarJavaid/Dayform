# T-00 · AWS access and tooling

| Field | Value |
|---|---|
| Wave | 0: Setup and smoke tests |
| Demo importance | ENABLER |
| Size | S |
| Depends on | — |
| Owns | `smoke/env/`, `.gitignore`, `.env.example` |
| Approval needed | Yes: package installs, AWS Budget, CDK bootstrap, ARM64 build setup |
| Status | BLOCKED: IAM user hirz-operator has no Bedrock, CloudFormation or Budgets permissions; CDK bootstrap awaiting approval |

## Goal
Make AWS, Bedrock and the local tools ready, so every smoke test can run.

## Why it matters for the demo
No scene works without AWS access. First-time AWS setup is slow, so it goes first.

## Read first
- [PLAN.md §1.5 Approval rule](../PLAN.md#15-approval-rule) and [§1.6 Human steps](../PLAN.md#16-human-steps)
- [DESIGN.md §9 Environment variables](../DESIGN.md#9-environment-variables) and [§10 Services and fallbacks](../DESIGN.md#10-services-and-fallbacks)

## Facts at plan time (2026-10-23)
- **AWS (re-checked 2026-10-22 by the orchestrator):** `~/.aws/config` has profiles `hirz-login`, `hirz`, `hirz-bootstrap`, `hirz-operator-login`, `hirz-operator` for account 661550216013, region us-east-1. Use `hirz-operator` (an IAM user; the user signs in with `aws login --profile hirz-operator-login`). Login sessions were expired at check time; the user re-logs in as a human step. Skip the SSO/access-key setup.
- **AWS CLI:** v2.37.0 at `/usr/local/bin/aws` already. Skip task 5.
- **Present:** git, docker 29.7 (daemon running), node 23.11, npm 10.9, `gh`.
- **Missing:** `cdk`, `sam`.

## Tasks
1. Run `git init` in `dayform/`. Make one first commit with the plan files. This lets later tickets use git worktrees.
2. Write `.gitignore`. It ignores `.env*` (except `.env.example`), `node_modules/`, `dist/`, `cdk.out/`, `*.raw.csv` and `video/raw/`.
3. Write `smoke/env/wizard.sh`. It walks the user through each human step below, one at a time, and checks the result of each step before it moves on.
4. **Human step.** The user signs in to AWS. Prefer `aws configure sso`; use access keys only if SSO isn't possible. Region: `us-east-1`.
5. **Approval needed.** Install AWS CLI v2 for the user only, and put it first in `PATH`. Keep v1 in place.
6. Check identity: `aws sts get-caller-identity`.
7. **Human step.** In the Bedrock console (us-east-1), request access to (DESIGN.md D21: Nova only, no Claude):
   - Amazon Nova 2.5 Sonic and Amazon Nova 2 Sonic
   - Amazon Nova 2 Pro (or the strongest Nova reasoning model listed) and Amazon Nova 2 Lite

   If Bedrock asks for model terms, the user completes it.
8. Find the exact IDs, and record them in `.env.local` and in [SMOKE-RESULTS.md](../SMOKE-RESULTS.md) §T-00:
   - `aws bedrock list-foundation-models --by-provider amazon --region us-east-1` and `aws bedrock list-inference-profiles --region us-east-1`: find the Nova reasoning model IDs (Nova 2 Pro, Nova 2 Lite; some need a `us.` inference profile) and the Nova Sonic IDs. The known Sonic ID is `amazon.nova-2-sonic-v1:0`.
   - `aws bedrock get-foundation-model-availability --model-id <id> --region us-east-1` for each model.
9. **Approval needed.** Create an AWS Budget with an email alert. The user picks the limit (suggest USD 50).
10. **Approval needed.** Install AWS CDK, either globally with `npm i -g aws-cdk` or through `npx aws-cdk`. Run `cdk bootstrap aws://<account>/us-east-1`.
11. **Approval needed.** Make ARM64 images buildable, because AgentCore needs them. Choose one:
    - **Local:** `docker buildx` plus QEMU binfmt. Test with `docker buildx build --platform linux/arm64` on a hello-world Dockerfile.
    - **Cloud:** AWS CodeBuild. This makes no change to the laptop; the AgentCore starter toolkit uses it.
12. Optional, **approval needed**: install `gh`, for T-50.
13. Write `.env.example` with every variable from DESIGN.md §9, and no values.
14. Write `smoke/env/check.sh`. It prints PASS or FAIL for:
    - credentials and region
    - each model's availability
    - the CDK bootstrap stack
    - the ARM64 build path
    - the Docker daemon

## Acceptance criteria
- [ ] `aws sts get-caller-identity` returns the account.
- [ ] One Nova reasoning model (D21) and one Nova Sonic model are available in us-east-1. Their IDs are recorded.
- [ ] The CDK bootstrap stack exists in us-east-1.
- [ ] One ARM64 build path is chosen and tested.
- [ ] The budget alert exists, if the user approved it.
- [ ] `.env.example` lists every variable, and `.env.local` is ignored by git.
- [ ] `smoke/env/check.sh` shows every line as PASS, or names a fallback.

## Test scenario
1. Run `bash smoke/env/check.sh`.
2. Expect every line PASS. A FAIL line must name its fallback (below), and the fallback must PASS.

## Fallbacks
- **Nova 2 Pro not available:** Nova 2 Lite, then any other Nova reasoning model (Nova Pro, Nova Premier). Never Claude (D21).
- **Nova Sonic not available in us-east-1:** use us-west-2 for voice only.
- **SSO not possible:** an IAM user with access keys, limited to the services in DESIGN.md §10.
- **ARM64 local build fails or is slow:** CodeBuild.

## Result
2026-10-22. Details and IDs: [SMOKE-RESULTS.md §T-00](../SMOKE-RESULTS.md); friction: FRICTION.md F-001.
- Done: `.gitignore` (`.env.local` ignored, `.env.example` not), `.env.example` (all §9 names plus `AWS_PROFILE`, `REASONING_MODEL_FALLBACK_ID`, `VOICE_MODEL_FALLBACK_ID`), `.env.local` (profile, region, provisional IDs), `smoke/env/wizard.sh`, `smoke/env/check.sh`, `smoke/env/Dockerfile.arm64`.
- Identity: `aws sts get-caller-identity` returns account 661550216013 as user/hirz-operator.
- ARM64: native linux/arm64 buildx on Apple Silicon, tested (built, container printed `aarch64`). No machine change.
- Blocked: every Bedrock, CloudFormation, Budgets, Account and IAM read call is AccessDenied for hirz-operator, so model availability, the CDK stack check and the budget cannot be done. Nova 2 Pro ID `amazon.nova-2-pro-v1:0` is rejected as invalid; Nova Premier is end-of-life.
- Not verified: check.sh full run (its model and CDK lines will FAIL until permissions land).
- Deviation: .env.example adds three names not in DESIGN.md §9 (AWS_PROFILE and two fallback IDs); orchestrator to accept or drop.
