# Deploying to AWS from the WorkSpace

How to deploy the Facilities Helpdesk to AWS from the workshop WorkSpace (VDI), and what to expect along the way. The organizers' setup guide is [docs/validation.md](docs/validation.md); what each script does is in [bin/README.md](bin/README.md).

Run every command from the repo root. The READMEs in `infra/` and elsewhere write `../bin/...` because they assume you are inside a subfolder.

## Why deploy from the WorkSpace, not the Mac

Terraform builds the Lambda zip by running `pip` on the machine that runs it. On a Mac that gives macOS builds of `psycopg-binary` and `pydantic-core`, which fail on Lambda. The WorkSpace runs Linux, so it builds packages that work.

The WorkSpace also has `terraform`, `aws`, `jq` and `dig` installed by `./bin/setup-environment.sh -d`. The Mac does not have Terraform.

## Before you switch

The deploy uses the code on the machine that runs it. Commit and push your work on the Mac, then pull it on the WorkSpace:

```sh
git pull
```

## One-time setup on the WorkSpace

Your IDs and code come from the organizers' email. Check they are in `~/.bashrc`:

```sh
grep -E "AWS_REGION|EVENT_ID|PARTICIPANT_ID|PARTICIPANT_CODE" ~/.bashrc
```

Add any that are missing, then reload:

```sh
echo "export AWS_REGION='your-region'" >> ~/.bashrc
echo "export EVENT_ID='event-id'" >> ~/.bashrc
echo "export PARTICIPANT_ID='your-id'" >> ~/.bashrc
echo "export PARTICIPANT_CODE='your-code'" >> ~/.bashrc
source ~/.bashrc
```

Install the frontend packages. The frontend deploy runs `npm run build`, which needs them. Run this again whenever `package.json` changes:

```sh
cd frontend && npm install && cd ..
```

## Temporary AWS credentials

[bin/setup-participant.sh](bin/setup-participant.sh) gets short-lived AWS credentials for your participant account:

1. It looks up the DNS TXT record on `codingworkshop.net` for your `EVENT_ID`, which gives it the organizers' credentials URL.
2. It calls that URL with your `PARTICIPANT_ID` and `PARTICIPANT_CODE` and gets back an access key, secret key and session token.
3. It writes them to your **default** AWS CLI profile and to `ENVIRONMENT.config` in the repo root. That file also sets `TF_VAR_aws_app_code` (your participant ID) and the Terraform state bucket.

Things to know:

- **Both deploy scripts run it for you** before they do anything else. You only run it yourself when you want to use `aws` or `terraform` by hand.
- **The credentials expire.** If a command fails with `ExpiredToken` or `InvalidClientTokenId`, run it again:

  ```sh
  ./bin/setup-participant.sh
  aws sts get-caller-identity    # should print your account
  ```

- **For `terraform` by hand**, also load the file in that terminal so Terraform gets your participant ID: `source ENVIRONMENT.config`.
- **Never commit `ENVIRONMENT.config`.** It holds live credentials. It is gitignored.
- [bin/README.md](bin/README.md) says the script creates a `coding-workshop-<id>` profile and a `BACKEND.config` file. It creates neither.

## Deploy

### 1. Backend

```sh
./bin/deploy-backend.sh
```

This runs `terraform apply -auto-approve` with no confirmation prompt. It creates or updates the `core` Lambda, Aurora PostgreSQL, the S3 bucket and CloudFront.

- The first run is slow: Aurora and CloudFront can take 10 to 20 minutes.
- Later runs only change what changed. A code-only change takes seconds to a minute.
- Terraform generates `JWT_SECRET` once and keeps it across deploys, so redeploying does not sign anyone out.

### 2. Frontend

Deploy the backend first. The frontend reads the bucket name and URLs from its Terraform outputs.

```sh
./bin/deploy-frontend.sh
```

It builds the app, uploads `frontend/dist/` to S3, clears the CloudFront cache and ends with:

```
CloudFront URL: https://xxxxxxxx.cloudfront.net
```

That is the app's address. The API is on the same domain under `/api/core`, so no CORS setup is needed. CloudFront can take a few minutes to serve the new files.

### 3. Check it

```sh
URL=https://xxxxxxxx.cloudfront.net       # from the step above
curl $URL/api/core/health                 # {"status":"ok"}  -> Lambda is reachable
curl $URL/api/core/health/db              # {"status":"ok","db":"ok"}  -> Aurora is reachable
```

## The database starts empty

**Nothing in the deploy creates the tables.** Terraform creates an empty `codingworkshop` database, and the backend doesn't run `backend/core/sql/schema.sql` or `seed.sql`. Until the tables exist, `/health` and `/health/db` pass, but sign-in, registration and every ticket request return 500.

To fix it, run `schema.sql` then `seed.sql` against Aurora once. The connection details are in the Lambda's settings:

```sh
source ENVIRONMENT.config
aws lambda get-function-configuration \
  --function-name coding-workshop-core-$PARTICIPANT_ID \
  --query 'Environment.Variables'
```

Aurora is inside the workshop VPC, so it's not yet confirmed that the WorkSpace can reach it with `psql`. If it can't, the backend needs a one-off setup step to run the SQL.

After that:

- `seed.sql` only loads buildings, floors and seats. Create users through the app's **Register** page.
- Everyone registers as an employee. To make someone an engineer or admin, set their `role_id` in the `users` table to the matching row in `roles`.

## Where things go wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| `ERROR: PARTICIPANT_URL not found for event ID` | `EVENT_ID` not set in this terminal | `source ~/.bashrc` |
| `ERROR: PARTICIPANT_ID not found` / `PARTICIPANT_CODE not found` | Missing from `~/.bashrc` | Add them (see one-time setup) |
| `ExpiredToken`, `InvalidClientTokenId` | Temporary credentials ran out | `./bin/setup-participant.sh` |
| `ERROR: Could not get S3 bucket name from Terraform outputs` | Frontend deployed before the backend | `./bin/deploy-backend.sh` first |
| `vite: not found` during frontend deploy | Frontend packages not installed | `cd frontend && npm install` |
| Site loads but API calls return 500 | Tables missing, or a backend error | See [The database starts empty](#the-database-starts-empty), then check the logs |
| `/api/core/health/db` returns 503 | Lambda can't reach Aurora | Check the logs. Aurora scales to zero when idle, so the first request after a pause can time out; try again |
| Old version still showing | CloudFront or browser cache | Wait a few minutes, then hard-refresh |

### Logs

```sh
aws logs tail /aws/lambda/coding-workshop-core-$PARTICIPANT_ID --follow --format short
```

## Redeploying after changes

| What changed | Run |
|---|---|
| Backend code (`backend/core/`) | `./bin/deploy-backend.sh` |
| Frontend code (`frontend/`) | `./bin/deploy-frontend.sh` |
| Both, or `infra/` | Backend, then frontend |
| `backend/core/requirements.txt` | `./bin/deploy-backend.sh` (it reinstalls the packages) |
| `sql/schema.sql` | Deploy, then apply the change to Aurora by hand (nothing migrates it) |

## Tearing it down

```sh
./bin/cleanup-environment.sh
```

This runs `terraform destroy` and deletes everything, **including the Aurora database and all its data**. You can't undo it. Only run it when you are done, or when you want to start again from scratch.
