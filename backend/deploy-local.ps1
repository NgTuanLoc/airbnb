# Deploys the AppHost to Docker Desktop's Kubernetes cluster (src/Airbnb.AppHost/LocalCluster.cs), then prints where
# to open it. Run from anywhere: pwsh backend/deploy-local.ps1. Remove it with: helm uninstall airbnb -n airbnb
$ErrorActionPreference = "Stop"

# aspire deploy installs into kubectl's current context, whatever it is: only ever Docker Desktop's here.
$context = kubectl config current-context
if ($context -ne "docker-desktop") {
    throw "kubectl's context is '$context', not docker-desktop. Switch with: kubectl config use-context docker-desktop"
}

# The registry the images are pushed to (LocalCluster.RegistryPort), kept between deploys.
if (-not (docker ps --quiet --filter "name=^airbnb-registry$")) {
    if (docker ps --all --quiet --filter "name=^airbnb-registry$") { docker start airbnb-registry | Out-Null }
    else { docker run --detach --restart=always --publish 5001:5000 --name airbnb-registry registry:2 | Out-Null }
}

Push-Location (Join-Path $PSScriptRoot "src/Airbnb.AppHost")
try { aspire deploy @args; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
finally { Pop-Location }

Write-Host @"

Deployed to the 'airbnb' namespace. Open:
  App              http://localhost:3000
  Aspire dashboard http://localhost:18888   (traces, logs, metrics)
  Mailpit          http://localhost:8025
  Keycloak         http://kubernetes.docker.internal:8080
Pods: kubectl get pods -n airbnb
"@
