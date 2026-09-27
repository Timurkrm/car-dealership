# Local infrastructure

`compose.yaml` at repository root starts PostGIS, Redis and MinIO. Host ports
bind only to loopback. Named volumes persist across `infra:down`; never use
`down -v` unless you intend to erase that environment's data.

Run `npm run env:init`, then `npm run infra:up`. Test infrastructure uses
`.env.test`, alternate ports, and the separate `marketplace-test` project.
Bucket initialization is idempotent and keeps objects private. These containers
and MinIO root credentials are for local development only; production requires
managed credentials, least-privilege bucket access and a deployment plan.

MinIO Community is no longer maintained ([upstream status](https://github.com/minio/minio)).
The legacy image is pinned from Quay because Docker Hub no longer serves it.
Use it only for isolated local tests; select a supported S3 provider for production.
