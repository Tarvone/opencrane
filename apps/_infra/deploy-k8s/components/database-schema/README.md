# Database schema

This Helm component owns the pre-install and pre-upgrade Prisma schema-reconciliation Job. It deliberately reuses the exact immutable `clustertenantManager.image` built for the OpenCrane server; it does not introduce a second image or move application data.

The Job receives only the database environment contract. It uses the namespace default ServiceAccount and does not request an API token, keeping schema authority database-only. The Prisma schema and revision files remain owned by `apps/opencrane/prisma`.
