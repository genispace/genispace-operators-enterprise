#!/usr/bin/env bash
set -euo pipefail

regions="${TEST_DEPLOY_REGIONS:-cn,global}"
case "$regions" in
  cn|global|cn,global|global,cn) ;;
  *) echo "Invalid TEST_DEPLOY_REGIONS: expected cn, global, cn,global or global,cn" >&2; exit 1 ;;
esac

IFS=',' read -r -a selected_regions <<< "$regions"
paths=()
for region in "${selected_regions[@]}"; do
  paths+=("apps/genispace/overlays/${region}/test/kustomization.yaml")
done
printf '%s\n' "${paths[*]}"
