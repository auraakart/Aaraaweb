# S3-compatible object storage for provider media

Aaraagate provider media uses the vendor-neutral `ObjectStoragePort`. The S3-compatible adapter is enabled only when `OBJECT_STORAGE_DRIVER=s3` is set; otherwise the existing unconfigured adapter remains active and upload operations fail closed.

## Required object-storage environment variables

- `OBJECT_STORAGE_DRIVER=s3`
- `OBJECT_STORAGE_S3_ENDPOINT` — S3-compatible service endpoint, for example `https://<account>.r2.cloudflarestorage.com` or a compatible object-store endpoint.
- `OBJECT_STORAGE_S3_BUCKET` — bucket name used for provider media.
- `OBJECT_STORAGE_S3_REGION` — signing region. Use the provider's documented region value; providers such as R2 may use `auto`.
- `OBJECT_STORAGE_S3_ACCESS_KEY_ID` — access key ID for server-side signing.
- `OBJECT_STORAGE_S3_SECRET_ACCESS_KEY` — secret access key. Never expose this to browser/mobile clients or logs.
- `OBJECT_STORAGE_PUBLIC_BASE_URL` — delivery base reserved for approved media. This is intentionally separate from the private upload/control endpoint.

Optional:

- `OBJECT_STORAGE_S3_PRESIGN_TTL_SECONDS` — upload URL lifetime. Default `300`; allowed range `60`–`900` seconds.

## Required malware-scanner environment variables

Production object storage may be enabled only with the ClamAV adapter configured:

- `MEDIA_SAFETY_SCANNER_DRIVER=clamav`
- `CLAMAV_HOST` — clamd host reachable from the API runtime. Prefer a sidecar or private service endpoint; do not expose clamd directly to the public internet.

Optional:

- `CLAMAV_PORT` — clamd TCP port. Default `3310`; allowed range `1`–`65535`.
- `CLAMAV_TIMEOUT_MS` — per-scan socket timeout. Default `10000`; allowed range `1000`–`30000` ms.

The adapter uses the standard clamd `INSTREAM` protocol over TCP and has no third-party Node runtime dependency. Provider media remains capped at 5 MB. Before scanning, the API performs a bounded signed S3 GET and verifies that the downloaded byte length still matches the previously validated object metadata.

## Security model

- Storage keys remain server-generated under the provider namespace.
- Browser/provider clients receive only short-lived signed PUT URLs and required upload headers.
- Secret keys are used only inside the API process and are never included in upload intents.
- Upload confirmation performs a signed HEAD request and verifies actual MIME type and byte length before safety scanning.
- The scanner reads the object through a short-lived signed GET that is server-side only and bounded to the provider-media maximum size.
- Every uploaded object starts with `malwareScanStatus=PENDING`.
- Only a `CLEAN` ClamAV result makes media eligible for platform moderation.
- `INFECTED` media is marked removed immediately and physical object deletion is attempted.
- Scanner connectivity, timeout, protocol errors, missing objects, or byte-length changes fail closed; affected media remains ineligible for moderation or resident display.
- Platform moderation also requires `malwareScanStatus=CLEAN`, so approval cannot bypass the scan gate.
- Delete operations are signed server-side.
- Storage HTTP errors fail closed through the provider-media service behavior.
- `OBJECT_STORAGE_PUBLIC_BASE_URL` must point to a delivery surface that does not expose `PENDING`, `REJECTED`, `REMOVED`, scan-pending, scan-error, or infected objects.

## Scanner deployment boundary

`MediaSafetyScannerPort` remains vendor-neutral, while the first concrete production adapter targets ClamAV/clamd. This keeps the marketplace service independent from scanner-provider details and allows a future ICAP or managed-scanning adapter without changing the media lifecycle.

Run clamd on a private network path reachable only by trusted application infrastructure. Keep virus definitions updated using the standard ClamAV update mechanism and include definition freshness in deployment/operations monitoring. The Aaraagate API never treats scanner unavailability as clean: any scanner failure is recorded as an error and the media remains non-reviewable.

## Compatibility

The object-storage adapter signs path-style S3 requests with AWS Signature Version 4 and does not depend on a specific storage vendor or SDK. Validate endpoint/path-style support with the chosen provider before enabling production uploads.

## Production enablement gate

Do not enable `OBJECT_STORAGE_DRIVER=s3` in production until all of the following are true:

1. `MEDIA_SAFETY_SCANNER_DRIVER=clamav` is configured and clamd connectivity is validated from the API runtime.
2. ClamAV definitions are updating successfully and operational monitoring covers scanner availability/freshness.
3. Bucket/CORS rules allow only the intended signed PUT workflow.
4. Public delivery cannot expose unapproved or non-clean objects.
5. Credentials are stored in the deployment secret manager, not source control.
6. Upload, HEAD verification, bounded GET, malware scanning, moderation, and deletion have passed staging smoke tests against the selected storage provider.
7. Scanner timeout/unavailability and infected-object cleanup have been exercised in staging.
