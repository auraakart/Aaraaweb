# S3-compatible object storage for provider media

Aaraagate provider media uses the vendor-neutral `ObjectStoragePort`. The S3-compatible adapter is enabled only when `OBJECT_STORAGE_DRIVER=s3` is set; otherwise the existing unconfigured adapter remains active and upload operations fail closed.

## Required environment variables

- `OBJECT_STORAGE_DRIVER=s3`
- `OBJECT_STORAGE_S3_ENDPOINT` — S3-compatible service endpoint, for example `https://<account>.r2.cloudflarestorage.com` or a compatible object-store endpoint.
- `OBJECT_STORAGE_S3_BUCKET` — bucket name used for provider media.
- `OBJECT_STORAGE_S3_REGION` — signing region. Use the provider's documented region value; providers such as R2 may use `auto`.
- `OBJECT_STORAGE_S3_ACCESS_KEY_ID` — access key ID for server-side signing.
- `OBJECT_STORAGE_S3_SECRET_ACCESS_KEY` — secret access key. Never expose this to browser/mobile clients or logs.
- `OBJECT_STORAGE_PUBLIC_BASE_URL` — public/CDN delivery base used for approved media URLs. This is intentionally separate from the private upload/control endpoint.

Optional:

- `OBJECT_STORAGE_S3_PRESIGN_TTL_SECONDS` — upload URL lifetime. Default `300`; allowed range `60`–`900` seconds.

## Security model

- Storage keys remain server-generated under the provider namespace.
- Browser/provider clients receive only short-lived signed PUT URLs and required upload headers.
- Secret keys are used only inside the API process and are never included in upload intents.
- Upload confirmation still performs a signed HEAD request and verifies actual MIME type and byte length before media remains eligible for moderation.
- Delete operations are signed server-side.
- Storage HTTP errors fail closed through the existing provider-media service behavior.
- `OBJECT_STORAGE_PUBLIC_BASE_URL` should point to a delivery surface that does not expose unapproved objects. Production deployment should use private/quarantine storage or an equivalent policy until moderation and malware scanning are complete.

## Compatibility

The adapter signs path-style S3 requests with AWS Signature Version 4 and does not depend on a specific storage vendor or SDK. Validate endpoint/path-style support with the chosen provider before enabling production uploads.

## Production enablement gate

Do not enable `OBJECT_STORAGE_DRIVER=s3` in production until all of the following are true:

1. Bucket/CORS rules allow only the intended signed PUT workflow.
2. Public delivery does not expose `PENDING`, `REJECTED`, or `REMOVED` objects.
3. Credentials are stored in the deployment secret manager, not source control.
4. Upload, HEAD verification, moderation, and deletion have passed staging smoke tests against the selected provider.
5. Malware scanning/quarantine policy is implemented before broad public self-service upload rollout.
