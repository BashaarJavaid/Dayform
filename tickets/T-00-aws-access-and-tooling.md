# T-00 · AWS access and tooling

| Field | Value |
|---|---|
| Wave | 0: Setup and smoke tests |
| Demo importance | ENABLER |
| Size | S |
| Depends on | — |
| Owns | `smoke/env/`, `.gitignore`, `.env.example` |
| Approval needed | Yes: package installs, AWS Budget, CDK bootstrap, ARM64 build setup |
| Status | TODO |

## Goal
Make AWS, Bedrock and the local tools ready, so every smoke test can run.

## Why it matters for the demo
No scene works without AWS access. First-time AWS setup is slow, so it goes first.

## Read first
- [PLAN.md §1.5 Approval rule](../PLAN.md#15-approval-rule) and [§1.6 Human steps](../PLAN.md#16-human-steps)
- [DESIGN.md §9 Environment variables](../DESIGN.md#9-environment-variables) and [§10 Services and fallbacks](../DESIGN.md#10-services-and-fallbacks)

## Facts at plan time (2026-10-23)
- **AWS:** no credentials, no `~/.aws` folder, no `AWS_*` variables.
- **AWS CLI:** v1.44.7 (Python), at `~/.local/bin/aws`.
- **Present:** git 2.43, docker 27.1 (daemon not checked), node 26.7, npm 11.19.
- **Missing:** `gh`, `cdk`, `sam`.

## Tasks
1. Run `git init` in `dayform/`. Make one first commit with the plan files. This lets later tickets use git worktrees.
2. Write `.gitignore`. It ignores `.env*` (except `.env.example`), `node_modules/`, `dist/`, `cdk.out/`, `*.raw.csv` and `video/raw/`.
3. Write `smoke/env/wizard.sh`. It walks the user through each human step below, one at a time, and checks the result of each step before it moves on.
4. **Human step.** The user signs in to AWS. Prefer `aws configure sso`; use access keys only if SSO isn't possible. Region: `us-east-1`.
5. **Approval needed.** Install AWS CLI v2 for the user only, and put it first in `PATH`. Keep v1 in place.
6. Check identity: `aws sts get-caller-identity`.
7. **Human step.** In the Bedrock console (us-east-1), request access to:
   - Claude Opus 5.5 and Claude Sonnet 5.5
   - Amazon Nova 2.5 Sonic and Amazon Nova 2 Sonic
   - Amazon Nova 2 Lite

   If Bedrock asks for an Anthropic use-case form or model terms, the user completes it.
8. Find the exact IDs, and record them in `.env.local` and in [SMOKE-RESULTS.md](../SMOKE-RESULTS.md) §T-00:
   - `aws bedrock list-inference-profiles --region us-east-1`: find the `global.` or `us.` profile for Opus 5.5 and Sonnet 5.5. The 5.5 models have no in-region IDs.
   - `aws bedrock list-foundation-models --by-provider amazon --region us-east-1`: find the Nova Sonic IDs. The known ID is `amazon.nova-2-sonic-v1:0`.
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
- [ ] Opus 5.5 (or its fallback) and one Nova Sonic model are available in us-east-1. Their IDs are recorded.
- [ ] The CDK bootstrap stack exists in us-east-1.
- [ ] One ARM64 build path is chosen and tested.
- [ ] The budget alert exists, if the user approved it.
- [ ] `.env.example` lists every variable, and `.env.local` is ignored by git.
- [ ] `smoke/env/check.sh` shows every line as PASS, or names a fallback.

## Test scenario
1. Run `bash smoke/env/check.sh`.
2. Expect every line PASS. A FAIL line must name its fallback (below), and the fallback must PASS.

## Fallbacks
- **Opus 5.5 not available:** Sonnet 5.5, then Nova 2 Lite. The last resort is the Anthropic API, but it's outside the Amazon stack; the orchestrator decides.
- **Nova Sonic not available in us-east-1:** use us-west-2 for voice only.
- **SSO not possible:** an IAM user with access keys, limited to the services in DESIGN.md §10.
- **ARM64 local build fails or is slow:** CodeBuild.

## Result
_The agent fills this in: what was done, IDs found, deviations._
