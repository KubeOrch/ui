# UI Container Releases

KubeOrch UI release tags publish one OCI image index for these supported
platforms:

- `linux/amd64`
- `linux/arm64`

The `Release` workflow accepts `v*` tags whose commit is contained in `main`.
It builds and smoke-tests both platform images before publishing the versioned
image. Each smoke test verifies the image architecture, the Node runtime
architecture, non-root execution, container health, and a browser request to
the configured Core API URL.

Release runs share a non-cancelling concurrency queue so versioned publication
and promotion of `latest` cannot overlap.

## Runtime API Configuration

The standalone server requires `NEXT_PUBLIC_API_URL` when the container starts.
Despite the established variable name, the value is not baked into the image.
The server validates it and serves it from a no-store initialization script
before browser hydration, allowing the same image digest to run in different
environments.

The value must be either an absolute HTTP(S) URL or a same-origin path. It must
not contain credentials, a query, or a fragment. The supported OrchCLI contract
is:

```text
NEXT_PUBLIC_API_URL=http://localhost:3000/v1/api
```

`localhost` is correct for this contract because the browser, not the UI
container, sends API requests to the host-published Core port.

## Published Evidence

The workflow first pushes a uniquely named release candidate containing
BuildKit-generated SPDX SBOM and SLSA provenance attestations. It also creates a
GitHub build attestation for the immutable index digest. After all evidence
checks pass, the same index is promoted to the version tag and `latest`, and its
digest is recorded in the GitHub Release.

Use the digest from the GitHub Release instead of trusting a mutable tag:

```bash
IMAGE=ghcr.io/kubeorch/ui@sha256:<release-digest>
SOURCE_COMMIT=<release-source-commit>

docker buildx imagetools inspect "$IMAGE"
docker buildx imagetools inspect "$IMAGE" --format '{{ json .SBOM }}'
docker buildx imagetools inspect "$IMAGE" --format '{{ json .Provenance.SLSA }}'
gh attestation verify "oci://$IMAGE" \
  --repo KubeOrch/ui \
  --bundle-from-oci \
  --signer-workflow KubeOrch/ui/.github/workflows/docker-publish.yml \
  --source-digest "$SOURCE_COMMIT"
```

The manifest list can also be checked mechanically. Attestation descriptors
use `unknown/unknown`; filter those descriptors when asserting runnable image
platforms.

```bash
docker buildx imagetools inspect "$IMAGE" --raw \
  | jq -r '.manifests[] | .platform | select(.os != "unknown") | "\(.os)/\(.architecture)"'
```

The output must contain `linux/amd64` and `linux/arm64`.

## Failure Diagnosis

The release stops before publication if either architecture cannot build or
pass its container and browser smoke test. Logs identify the failing platform
and include UI or mock Core logs only on failure. The smoke environment uses no
production credentials.

If candidate publication succeeds but manifest or attestation verification
fails, the workflow does not create the version tag, update `latest`, or create
the GitHub Release. Inspect the `Verify platforms and attestations` step for an
unexpected platform set, missing SBOM/provenance data, source revision mismatch,
or GitHub attestation verification error.
