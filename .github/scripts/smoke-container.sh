#!/usr/bin/env bash
set -Eeuo pipefail

image="${1:?usage: smoke-container.sh <image> <amd64|arm64>}"
expected_arch="${2:?usage: smoke-container.sh <image> <amd64|arm64>}"

case "$expected_arch" in
  amd64)
    expected_node_arch="x64"
    ;;
  arm64)
    expected_node_arch="arm64"
    ;;
  *)
    echo "Unsupported architecture: $expected_arch" >&2
    exit 2
    ;;
esac

ui_port="${UI_SMOKE_PORT:-31081}"
core_port="${CORE_SMOKE_PORT:-31080}"
ui_origin="http://127.0.0.1:${ui_port}"
api_url="http://127.0.0.1:${core_port}/v1/api"
container="kubeorch-ui-smoke-${expected_arch}-${RANDOM}"
log_dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/kubeorch-ui-smoke-${expected_arch}"
mock_pid=""

mkdir -p "$log_dir"

cleanup() {
  docker rm --force "$container" >/dev/null 2>&1 || true
  if [[ -n "$mock_pid" ]]; then
    kill "$mock_pid" >/dev/null 2>&1 || true
    wait "$mock_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

report_failure() {
  exit_code="$?"
  set +e
  echo "UI smoke test failed for linux/$expected_arch" >&2
  if docker inspect "$container" >/dev/null 2>&1; then
    docker logs "$container" >&2
  fi
  if [[ -f "$log_dir/mock-core.log" ]]; then
    cat "$log_dir/mock-core.log" >&2
  fi
  exit "$exit_code"
}
trap report_failure ERR

actual_arch="$(docker image inspect "$image" --format '{{.Architecture}}')"
if [[ "$actual_arch" != "$expected_arch" ]]; then
  echo "Image architecture is $actual_arch, expected $expected_arch" >&2
  exit 1
fi

runtime_uid="$(
  docker run --rm --platform "linux/$expected_arch" --entrypoint id "$image" -u
)"
if [[ "$runtime_uid" != "1001" ]]; then
  echo "UI image runs as uid $runtime_uid, expected 1001" >&2
  exit 1
fi

node_arch="$(
  docker run --rm --platform "linux/$expected_arch" \
    --entrypoint node "$image" -p 'process.arch'
)"
if [[ "$node_arch" != "$expected_node_arch" ]]; then
  echo "Node architecture is $node_arch, expected $expected_node_arch" >&2
  exit 1
fi

node .github/scripts/mock-core.mjs "$core_port" "$ui_origin" \
  >"$log_dir/mock-core.log" 2>&1 &
mock_pid="$!"

mock_ready=false
for _ in $(seq 1 15); do
  if curl --fail --silent --output /dev/null \
    -X OPTIONS "$api_url/auth/methods"; then
    mock_ready=true
    break
  fi
  sleep 1
done
if [[ "$mock_ready" != true ]]; then
  echo "Mock Core did not start" >&2
  cat "$log_dir/mock-core.log" >&2
  exit 1
fi

docker run --detach \
  --name "$container" \
  --platform "linux/$expected_arch" \
  --publish "127.0.0.1:${ui_port}:3000" \
  --env "NEXT_PUBLIC_API_URL=$api_url" \
  --health-interval 2s \
  --health-timeout 5s \
  --health-start-period 1s \
  --health-retries 15 \
  "$image" >/dev/null

ui_ready=false
for _ in $(seq 1 45); do
  health_status="$(
    docker inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}'
  )"
  if [[ "$health_status" == "healthy" ]]; then
    ui_ready=true
    break
  fi
  if [[ "$(docker inspect "$container" --format '{{.State.Running}}')" != "true" ]]; then
    break
  fi
  sleep 2
done
if [[ "$ui_ready" != true ]]; then
  echo "UI did not become healthy" >&2
  docker inspect "$container" >&2
  docker logs "$container" >&2
  exit 1
fi

node .github/scripts/smoke-browser.mjs "$ui_origin" "$api_url"

if ! grep -F 'GET /v1/api/auth/methods' "$log_dir/mock-core.log" >/dev/null; then
  echo "Mock Core did not observe the configured browser request" >&2
  cat "$log_dir/mock-core.log" >&2
  exit 1
fi

echo "Smoke test passed for linux/$expected_arch as uid $runtime_uid"
