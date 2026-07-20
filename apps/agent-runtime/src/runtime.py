"""Outbound-only OpenCrane personal-agent runtime shell.

This process deliberately has no model driver, tool implementation, HTTP listener, or durable
tenant storage. It only proves the projected-identity and control-plane-stream boundary that a
later run controller will populate with immutable commands.
"""

import json
import os
import random
import sys
import time
import uuid
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


_PROTOCOL_VERSION = "opencrane.agent-runtime/v1"
_DEFAULT_TOKEN_PATH = "/var/run/opencrane/tokens/runtime.token"


def _environment(name: str, default: str | None = None) -> str:
    """Read a required runtime setting without echoing its possibly sensitive value."""
    value = os.environ.get(name, default)
    if not value:
        raise RuntimeError(f"{name} must be configured")
    return value


def _log(event: str, **fields: object) -> None:
    """Emit one safe structured log line; callers must never pass credentials."""
    print(json.dumps({"component": "agent-runtime", "event": event, **fields}, sort_keys=True), flush=True)


def _read_projected_token(token_path: str) -> str:
    """Read the short-lived projected token only at connection time."""
    with open(token_path, "r", encoding="utf-8") as token_file:
        token = token_file.read().strip()
    if not token:
        raise RuntimeError("projected runtime token is empty")
    return token


def _open_stream(control_plane_url: str, token: str, runtime_instance_id: str, pod_uid: str) -> int:
    """Open one authenticated stream without treating received commands as executable authority.

    This shell validates only the transport boundary. It reads bounded frames so deployment and
    identity wiring can be exercised, but intentionally ignores command bodies until a later slice
    binds them to a durable run assignment and executor.
    """
    body = json.dumps({"protocolVersion": _PROTOCOL_VERSION, "runtimeInstanceId": runtime_instance_id, "podUid": pod_uid}).encode("utf-8")
    request = Request(
        f"{control_plane_url.rstrip('/')}/stream",
        data=body,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "text/event-stream"},
        method="POST",
    )
    with urlopen(request, timeout=45) as response:
        if response.status != 200:
            raise RuntimeError(f"runtime stream returned unexpected status {response.status}")
        _log("stream_connected", runtime_instance_id=runtime_instance_id)
        # Commands are intentionally not executed in this shell. Reading the bounded SSE stream
        # keeps the transport exercised while later slices add verified command dispatch.
        for raw_line in response:
            if len(raw_line) > 65_536:
                raise RuntimeError("runtime stream frame exceeds the 64KiB boundary")
            if raw_line.startswith(b"event: command"):
                _log("command_ignored_until_executor", runtime_instance_id=runtime_instance_id)
        return 0


def _retry_delay(attempt: int) -> float:
    """Use bounded jittered reconnects so a missing authority cannot create a retry storm."""
    return min(30.0, (2 ** min(attempt, 5)) + random.uniform(0.0, 1.0))


def run_forever(open_stream: Callable[[str, str, str, str], int] = _open_stream) -> None:
    """Maintain the sole outbound control stream for this Pod's lifetime.

    The projected token is reread for each connection so kubelet rotation takes effect without a
    process restart. Failures are logged without credential contents and retried with bounded jitter;
    this function never falls back to a static token or local durable queue.
    """
    control_plane_url = _environment("OPENCRANE_RUNTIME_STREAM_URL")
    token_path = _environment("OPENCRANE_RUNTIME_TOKEN_PATH", _DEFAULT_TOKEN_PATH)
    pod_uid = _environment("POD_UID")
    runtime_instance_id = str(uuid.uuid4())
    attempts = 0
    _log("runtime_started", runtime_instance_id=runtime_instance_id)
    while True:
        try:
            open_stream(control_plane_url, _read_projected_token(token_path), runtime_instance_id, pod_uid)
            attempts = 0
        except (HTTPError, URLError, OSError, RuntimeError) as error:
            attempts += 1
            delay_seconds = _retry_delay(attempts)
            _log("stream_disconnected", runtime_instance_id=runtime_instance_id, error_type=type(error).__name__, retry_in_seconds=round(delay_seconds, 2))
            time.sleep(delay_seconds)


if __name__ == "__main__":
    try:
        run_forever()
    except KeyboardInterrupt:
        _log("runtime_stopped")
        sys.exit(0)
