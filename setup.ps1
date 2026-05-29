$MonitoringDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DashboardDir = Join-Path $MonitoringDir "grafana\dashboards"

if (-not (Test-Path $DashboardDir)) {
    New-Item -ItemType Directory -Force -Path $DashboardDir | Out-Null
    Write-Host "Created dashboards directory at $DashboardDir"
}

Write-Host "Downloading Node Exporter Full dashboard (ID 1860)..."
Invoke-WebRequest -Uri "https://grafana.com/api/dashboards/1860/revisions/37/download" -OutFile (Join-Path $DashboardDir "node-exporter.json") -UseBasicParsing

Write-Host "Downloading Docker Container dashboard (ID 14282)..."
Invoke-WebRequest -Uri "https://grafana.com/api/dashboards/14282/revisions/1/download" -OutFile (Join-Path $DashboardDir "docker-containers.json") -UseBasicParsing

# Update datasource references
$NodeExporterPath = Join-Path $DashboardDir "node-exporter.json"
$DockerContainersPath = Join-Path $DashboardDir "docker-containers.json"

if (Test-Path $NodeExporterPath) {
    (Get-Content $NodeExporterPath) -replace '"datasource": "\${DS_PROMETHEUS}"', '"datasource": "Prometheus"' | Set-Content $NodeExporterPath
}
if (Test-Path $DockerContainersPath) {
    (Get-Content $DockerContainersPath) -replace '"datasource": "\${DS_PROMETHEUS}"', '"datasource": "Prometheus"' | Set-Content $DockerContainersPath
}

Write-Host "Setup complete! Dashboards downloaded successfully."
Write-Host "You can now run: docker compose up -d"
