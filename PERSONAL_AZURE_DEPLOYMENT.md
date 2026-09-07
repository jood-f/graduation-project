# Personal Azure deployment — September 5, 2026

## Current status

The personal Azure infrastructure and Container App are deployed. The working
database connection uses the Supabase Session pooler. Secrets are stored as
Container App secrets and referenced by environment variables.

Supabase REST access succeeded (HTTP 200), and the backend and frontend reference
the same Supabase project. No database records were changed during preparation.

## Target resources

| Setting | Value |
| --- | --- |
| Subscription | `414bcb8f-68cb-45df-94ce-98069e2a833c` |
| Resource group | `solarsense-personal-rg` |
| Region | `centralindia` |
| Container registry | `solarsensepersonal414bcb.azurecr.io` |
| Container Apps environment | `solarsense-personal-env` |
| Image pull identity | `solarsense-image-pull` |
| Container App | `solarsense-backend` |
| Frontend origin | `https://solarsense1.netlify.app` |
| Backend URL | `https://solarsense-backend.salmonforest-610dfccd.centralindia.azurecontainerapps.io` |

Image:

```text
solarsensepersonal414bcb.azurecr.io/solarsense-backend:personal-20260905-cpu-v1
```

Pushed manifest digest:

```text
sha256:6dd0a7b34f0f1ce400eddde4b5697397cc3ffcef6c8a0ace459a13ffdfa9648f
```

The managed identity has `AcrPull` scoped to this registry. The planned app uses
2 vCPU, 4 GiB RAM, one replica, HTTPS ingress on container port 8000, and explicit
startup, readiness, and liveness probes. The registry and monitoring resources
may incur charges while the app is pending.

## Verification completed

- Backend test suite: 40 passed.
- Linux AMD64 Docker image built successfully with CPU-only PyTorch 2.6.0.
- Isolated image check under 2 CPU / 4 GiB limits: CV classifier loaded and ran
  inference; telemetry model and saved scalers loaded and produced 20 finite
  predictions. The image check had no network access or production credentials.
- Existing scaler artifacts produce a scikit-learn version warning (training
  1.7.2 versus runtime 1.5.2); the inference check passed, but this is not a
  validation of model accuracy.
- Azure registry push completed successfully.
- Azure revision `solarsense-backend--ht5j9yg` is running and provisioned successfully.
- Live `/health` returned HTTP 200.
- Live `/api/v1/cv/status` returned HTTP 200 with the classifier available.
- An authenticated database-backed `/api/v1/sites` request returned HTTP 200 and two rows.
- A CORS preflight from `https://solarsense1.netlify.app` returned HTTP 200 with credentials allowed.
- Applied `backend/migrations/0004_add_mission_source.sql` after live logs exposed
  that the database predated the model's `missions.source` field. The migration
  added the nullable column, its `MANUAL` default, and its allowed-value check.
- Live mission listing returned HTTP 200 with 70 rows after migration. A delete
  lookup against a guaranteed nonexistent UUID returned the expected HTTP 404,
  confirming the previous undefined-column error is resolved without deleting data.

## Frontend cutover

The tracked frontend fallback and local frontend environment files now use the
new backend URL. Netlify must rebuild the frontend with `VITE_API_BASE_URL` set to:

```text
https://solarsense-backend.salmonforest-610dfccd.centralindia.azurecontainerapps.io/api/v1
```

Session helpers and non-secret resource state are in the ignored `.tmp/`
directory. The helper pins every Azure write to the personal subscription and
removes temporary secret configuration after deployment. Credentials and local
Azure sessions are excluded from Docker builds and Git.
