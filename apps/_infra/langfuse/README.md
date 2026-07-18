# Langfuse

This deployment project owns the pinned upstream Langfuse deployment contract. OpenCrane does not fork the chart: `apps/_infra/deploy-k8s/Chart.yaml` consumes upstream `langfuse` version `1.5.37` directly so the existing parent values, release names, and rendered objects remain stable. The pin is also recorded in `upstream.yaml` and must be changed deliberately with the umbrella lockfile.

When enabled, that upstream wrapper owns all six rendered pod classes:

- Langfuse web Deployment
- Langfuse worker Deployment
- S3-compatible object-store Deployment
- ClickHouse StatefulSet
- Redis primary StatefulSet
- ZooKeeper StatefulSet
