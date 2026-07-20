# Tenancy server capabilities

Tenancy capabilities connect fleet state to a silo and make effective tenant state explicit.

- `tenants` owns tenant lifecycle and suspension.
- `cluster-tenants` owns fleet-to-cluster tenant assignment and provisioning seams.
- `projection` owns fleet read-model repair and lifecycle.
- `contract` renders the effective tenant contract.
- `connections` owns tenant connection lifecycle.

This group contains lifecycle capabilities that remain until their direct replacements are ready.
Keep new agent, gateway, and knowledge behaviour in its owning group rather than tenancy.
