# OpenCrane migrate

This deploy-only application owns the pre-install and pre-upgrade Prisma migration Job. It deliberately reuses the exact immutable `clustertenantManager.image` built for the OpenCrane server; it does not introduce a second image.

The Job receives only the database environment contract. It uses the namespace default ServiceAccount and does not request an API token, keeping migration authority database-only.
