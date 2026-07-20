# Personal session assembly

This package creates the one immutable `RunInputSnapshot` consumed by a personal or managed-agent
runtime. It reads injected authority ports and writes only through the injected snapshot store.

It does not select a runtime driver, approve a persona, issue capabilities, or read mutable
workspace files. The OpenCrane app will compose its ports with target authority adapters.
