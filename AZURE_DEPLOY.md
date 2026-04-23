# Azure Deployment

This project is best deployed to Azure Container Apps using Azure Container Registry (ACR).

## What changed in this repo

- The Docker image now copies only the runtime ML/CV artifacts instead of the full `CV/` dataset.
- `.dockerignore` now excludes large training data and frontend files from the Azure build context.
- The backend no longer crashes on startup when `DATABASE_URL` is missing; it starts and returns `503` on DB-backed routes instead.

## Required Azure settings

Set these environment variables in your Container App:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_BUCKET=mission_images`
- `CORS_ALLOWED_ORIGINS`

Optional:

- `CV_CLASSIFICATION_MODEL_PATH=/app/CV/best-cls.pt`
- `CV_MODEL_PATH=/app/CV/best.pt`
- `ML_MODEL_PATH=/app/ml/telemetry_power_model.h5`
- `ML_SCALER_X_PATH=/app/ml/telemetry_scaler_X.joblib`
- `ML_SCALER_Y_PATH=/app/ml/telemetry_scaler_y.joblib`
- `CV_ALLOW_HEURISTIC_FALLBACK=false`

## Build and push to ACR

PowerShell example:

```powershell
$RESOURCE_GROUP = "<your-resource-group>"
$ACR_NAME = "<your-acr-name>"
$IMAGE_NAME = "solarsense-backend"
$IMAGE_TAG = "azure-v1"

az acr build `
  --registry $ACR_NAME `
  --image "${IMAGE_NAME}:${IMAGE_TAG}" `
  --file Dockerfile `
  .
```

## Create the Container Apps environment

Run this once if you do not already have one:

```powershell
$LOCATION = "centralindia"
$CONTAINERAPPS_ENV = "<your-containerapps-environment>"

az containerapp env create `
  --name $CONTAINERAPPS_ENV `
  --resource-group $RESOURCE_GROUP `
  --location $LOCATION
```

## Deploy the container app

```powershell
$APP_NAME = "solarsense-backend"
$ACR_LOGIN_SERVER = az acr show --name $ACR_NAME --query loginServer -o tsv
$ACR_USERNAME = az acr credential show --name $ACR_NAME --query username -o tsv
$ACR_PASSWORD = az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv

az containerapp create `
  --name $APP_NAME `
  --resource-group $RESOURCE_GROUP `
  --environment $CONTAINERAPPS_ENV `
  --image "${ACR_LOGIN_SERVER}/${IMAGE_NAME}:${IMAGE_TAG}" `
  --target-port 8000 `
  --ingress external `
  --registry-server $ACR_LOGIN_SERVER `
  --registry-username $ACR_USERNAME `
  --registry-password $ACR_PASSWORD `
  --cpu 2.0 `
  --memory 4.0Gi `
  --min-replicas 1 `
  --max-replicas 1 `
  --env-vars `
    SUPABASE_BUCKET=mission_images `
    CV_CLASSIFICATION_MODEL_PATH=/app/CV/best-cls.pt `
    CV_MODEL_PATH=/app/CV/best.pt `
    ML_MODEL_PATH=/app/ml/telemetry_power_model.h5 `
    ML_SCALER_X_PATH=/app/ml/telemetry_scaler_X.joblib `
    ML_SCALER_Y_PATH=/app/ml/telemetry_scaler_y.joblib `
    CV_ALLOW_HEURISTIC_FALLBACK=false `
    CORS_ALLOWED_ORIGINS=https://<your-frontend-domain> `
  --secrets `
    DATABASE_URL="<your-database-url>" `
    SUPABASE_URL="<your-supabase-url>" `
    SUPABASE_KEY="<your-supabase-service-key-or-anon-key>"
```

Then bind secret-backed env vars:

```powershell
az containerapp update `
  --name $APP_NAME `
  --resource-group $RESOURCE_GROUP `
  --set-env-vars `
    DATABASE_URL=secretref:DATABASE_URL `
    SUPABASE_URL=secretref:SUPABASE_URL `
    SUPABASE_KEY=secretref:SUPABASE_KEY
```

## Verify after deploy

Check these endpoints:

- `https://<your-container-app-domain>/health`
- `https://<your-container-app-domain>/api/v1/cv/status`

Expected:

- `/health` returns HTTP `200`
- `/api/v1/cv/status` should show `"available": true` and `"/app/CV/best-cls.pt"` as the preferred classifier model path

## Most likely reasons it still fails

- `DATABASE_URL` is missing or incorrect.
- The Container App target port is not `8000`.
- The image in ACR is still the older large image.
- The app was created without registry credentials.
- `CORS_ALLOWED_ORIGINS` does not include your frontend URL.
