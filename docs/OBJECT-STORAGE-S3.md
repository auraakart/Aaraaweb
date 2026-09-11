# S3-compatible object storage for provider media

Aaraagate provider media uses the vendor-neutral `ObjectStoragePort`. The S3-compatible adapter is enabled only when `OBJECT_STORAGE_DRIVER=s3` is set; otherwise the existing unconfigured adapter remains active and upload operations fail closed.

## Required environment variables

- `OBJECT_STORAGE_DRIVER=s3`
- `OBJECT_STORAGE_S3_ENDPOINT` — S3-compatible service endpoint, for example `https://<account>.r2.cloudflarestorage.com` or a compatible object-store endpoint.
- `OBJECT_STORAGE_S3_BUCKET` — bucket name used for provider media.
- `OBJECT_STORAGE_S3_REGION` — signing region. Use the provider's documented region value; providers such as R2 may use `auto`.
- `OBJECT_STORAGE_S3_ACCESS_KEY_ID` — access key ID for server-side signing.
- `OBJECT_STORAGE_S3_SECRET_ACCESS_KEY` — secret access key. Never expose this to browser/mobile clients or logs.
- `OBJECT_STORAGE_PUBLIC_BASE_URL` — delivery base reserved for approved media. This is intentionally separate from the private upload/control endpoint.

Optional:

- `OBJECT_STORAGE_S3_PRESIGN_TTL_SECONDS` — upload URL lifetime. Default `300`; allowed range `60`–`900` seconds.

## Security model

- Storage keys remain server-generated under the provider namespace.
- Browser/provider clients receive only short-lived signed PUT URLs and required upload headers.
- Secret keys are used only inside the API process and are never included in upload intents.
- Upload confirmation performs a signed HEAD request and verifies actual MIME type and byte length before safety scanning.
- Every uploaded object starts with `malwareScanStatus=PENDING`.
- Only a `CLEAN` safety-scan result makes media eligible for platform moderation.
- `INFECTED` media is marked removed immediately and physical object deletion is attempted.
- Scanner errors fail closed; affected media remains ineligible for moderation or resident display.
- Platform moderation also requires `malwareScanStatus=CLEAN`, so approval cannot bypass the scan gate.
- Delete operations are signed server-side.
- Storage HTTP errors fail closed through the provider-media service behavior.
- `OBJECT_STORAGE_PUBLIC_BASE_URL` must point to a delivery surface that does not expose `PENDING`, `REJECTED`, `REMOVED`, scan-pending, scan-error, or infected objects.

## Scanner boundary

The repository now defines a vendor-neutral `MediaSafetyScannerPort`, but deliberately does not ship a fake/no-op production scanner. The default scanner implementation fails closed. Production preflight therefore blocks `OBJECT_STORAGE_DRIVER=s3` until a real runtime scanner adapter is implemented and validated.

This keeps scanner-provider selection reversible. A future adapter may use ClamAV, an ICAP service, a managed malware-scanning API, or another approved implementation, but it must return only authoritative `CLEAN` or `INFECTED` results to the marketplace service.

## Compatibility

The object-storage adapter signs path-style S3 requests with AWS Signature Version 4 and does not depend on a specific storage vendor or SDK. Validate endpoint/path-style support with the chosen provider before enabling production uploads.

## Production enablement gate

Do not enable `OBJECT_STORAGE_DRIVER=s3` in production until all of the following are true:

1. A real `MediaSafetyScannerPort` adapter is implemented and staging-validated.
2. Bucket/CORS rules allow only the intended signed PUT workflow.
3. Public delivery cannot expose unapproved or non-clean objects.
4. Credentials are stored in the deployment secret manager, not source control.
5. Upload, HEAD verification, malware scanning, moderation, and deletion have passed staging smoke tests against the selected provider.
6. Scanner failure behavior and infected-object cleanup have been exercised in staging.
