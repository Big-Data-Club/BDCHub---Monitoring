#!/usr/bin/env bash
# =============================================================================
# setup.sh -- Initialize directories and download dashboards for monitoring
# =============================================================================
set -euo pipefail

MONITORING_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="$MONITORING_DIR/grafana/dashboards"

echo "Creating dashboards directory at $DASHBOARD_DIR..."
mkdir -p "$DASHBOARD_DIR"

echo "Downloading Node Exporter Full dashboard (ID 1860)..."
curl -sL "https://grafana.com/api/dashboards/1860/revisions/37/download" -o "$DASHBOARD_DIR/node-exporter.json"

echo "Downloading Docker Container dashboard (ID 14282)..."
curl -sL "https://grafana.com/api/dashboards/14282/revisions/1/download" -o "$DASHBOARD_DIR/docker-containers.json"

# Update datasource setting in Node Exporter dashboard JSON to use our default Prometheus
if command -v sed &> /dev/null; then
  echo "Updating dashboard datasource references..."
  # Replace datasource variable placeholders with "Prometheus" or null to use default
  sed -i 's/"datasource": "${DS_PROMETHEUS}"/"datasource": "Prometheus"/g' "$DASHBOARD_DIR/node-exporter.json" 2>/dev/null || true
  sed -i 's/"datasource": "${DS_PROMETHEUS}"/"datasource": "Prometheus"/g' "$DASHBOARD_DIR/docker-containers.json" 2>/dev/null || true
fi

echo "Setup complete! Dashboards downloaded successfully."
echo "You can now run: docker compose up -d"
