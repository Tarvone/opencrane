# Cognee

This deployment project owns the release-local Cognee workload and its Service, storage, and network-policy resources. Its Helm library exports named templates; `apps/_infra/deploy-k8s` only composes them with the parent release context.
