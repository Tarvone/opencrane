"""Outbound-only OpenCrane personal-agent runtime shell.

This process performs its one-use bootstrap exchange, then opens a single authenticated command
stream to OpenCrane and reports lifecycle candidates for the commands it receives. It deliberately
has no model driver, tool implementation, HTTP listener, or durable tenant storage: a start, resume,
or cancel command is acknowledged with a bounded ``event`` candidate, never executed, until the
model and tool executor arrives in a later slice.
"""

import base64
import hashlib
import json
import os
import random
import sys
import threading
import time
import uuid
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


_PROTOCOL_VERSION = "opencrane.agent-runtime/v1"
_DEFAULT_TOKEN_PATH = "/var/run/opencrane/tokens/runtime.token"
_DEFAULT_BOOTSTRAP_PATH = "/var/run/opencrane/bootstrap/reference"
_MAX_FRAME_BYTES = 65_536


class BootstrapDeniedError(RuntimeError):
    """Raised when the control plane refuses the one-use bootstrap; the run must not proceed."""


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


def _read_bootstrap_reference(bootstrap_path: str) -> str:
    """Read the opaque, non-secret bootstrap reference projected into the Pod."""
    with open(bootstrap_path, "r", encoding="utf-8") as reference_file:
        reference = reference_file.read().strip()
    if not reference:
        raise RuntimeError("projected bootstrap reference is empty")
    return reference


def _base64url(raw: bytes) -> str:
    """Encode bytes as unpadded base64url, the encoding used by JOSE and RFC 7638."""
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _rfc7638_thumbprint(x_coordinate: str, y_coordinate: str) -> str:
    """Compute the RFC 7638 thumbprint of a P-256 public key from its base64url coordinates.

    The canonical member order for an EC key is exactly ``crv``, ``kty``, ``x``, ``y`` with no
    whitespace, so two runtimes deriving a thumbprint for the same key always agree with the server.
    """
    canonical = json.dumps({"crv": "P-256", "kty": "EC", "x": x_coordinate, "y": y_coordinate}, separators=(",", ":"), sort_keys=False)
    return _base64url(hashlib.sha256(canonical.encode("utf-8")).digest())


def _generate_proof_key() -> dict[str, object]:
    """Generate one per-run ES256 keypair and return its public JWK, thumbprint, and private key.

    The private key is retained only in memory for the process lifetime; the public half is bound to
    the run by the bootstrap exchange so a later slice can sign capability proofs. It is never
    written to disk, logged, or sent anywhere but as the public JWK in the bootstrap claim.
    """
    from cryptography.hazmat.primitives.asymmetric import ec

    private_key = ec.generate_private_key(ec.SECP256R1())
    numbers = private_key.public_key().public_numbers()
    x_coordinate = _base64url(numbers.x.to_bytes(32, "big"))
    y_coordinate = _base64url(numbers.y.to_bytes(32, "big"))
    public_jwk = {"kty": "EC", "crv": "P-256", "x": x_coordinate, "y": y_coordinate}
    return {"privateKey": private_key, "publicJwk": public_jwk, "thumbprint": _rfc7638_thumbprint(x_coordinate, y_coordinate)}


def _post_json(url: str, token: str, body: dict[str, object], timeout: float) -> int:
    """POST one bounded JSON body with the projected bearer token and return the HTTP status."""
    request = Request(url, data=json.dumps(body).encode("utf-8"), headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json"}, method="POST")
    with urlopen(request, timeout=timeout) as response:
        return response.status


def _perform_bootstrap(control_plane_url: str, token: str, bootstrap_reference: str, proof_key: dict[str, object]) -> None:
    """Bind this run's public proof key exactly once, failing closed on any refusal.

    A 2xx confirms the single binding. A 4xx is a permanent refusal (already consumed, unknown, or
    mismatched) and must stop the run rather than retry, so a replayed bootstrap can never quietly
    succeed. A transport or 5xx error is raised unchanged so the caller can retry with backoff.
    """
    body = {"bootstrapReference": bootstrap_reference, "proofPublicJwk": proof_key["publicJwk"], "proofKeyThumbprint": proof_key["thumbprint"]}
    try:
        status = _post_json(f"{control_plane_url.rstrip('/')}/bootstrap", token, body, timeout=30)
    except HTTPError as error:
        if 400 <= error.code < 500:
            raise BootstrapDeniedError(f"bootstrap refused with status {error.code}") from error
        raise
    if status < 200 or status >= 300:
        raise BootstrapDeniedError(f"bootstrap returned unexpected status {status}")
    _log("bootstrap_bound", thumbprint=proof_key["thumbprint"])


def _acknowledge_candidate(command: dict[str, object], runtime_instance_id: str) -> dict[str, object] | None:
    """Build a bounded ``event`` candidate that acknowledges one received command.

    The candidate carries only the command's own coordinates plus a stable acknowledgement event; it
    proposes no durable write and no tool call. Returning ``None`` for a structurally invalid command
    keeps a malformed frame from producing a candidate the control plane would only reject.
    """
    assignment = command.get("assignment")
    kind = command.get("kind")
    command_id = command.get("commandId")
    fence = command.get("fence")
    if not isinstance(assignment, dict) or not isinstance(kind, str) or not isinstance(command_id, str) or not isinstance(fence, int):
        return None
    run_id = assignment.get("runId")
    attempt = assignment.get("attempt")
    if not isinstance(run_id, str) or not isinstance(attempt, int):
        return None
    return {"protocolVersion": _PROTOCOL_VERSION, "runtimeInstanceId": runtime_instance_id, "commandId": command_id, "candidateId": str(uuid.uuid4()), "runId": run_id, "attempt": attempt, "fence": fence, "kind": "event", "eventType": "run.attempt_acknowledged", "payload": {"acknowledgedKind": kind}}


def _iter_commands(response: object, cancelled: threading.Event) -> object:
    """Yield each parsed command object from a bounded server-sent-event response.

    It tracks the current SSE event name and parses the ``data`` line only for ``command`` events.
    Reading stops as soon as the connection drops so command handling is bounded to a live stream.
    """
    current_event = ""
    for raw_line in response:
        if cancelled.is_set():
            break
        if len(raw_line) > _MAX_FRAME_BYTES:
            raise RuntimeError("runtime stream frame exceeds the 64KiB boundary")
        line = raw_line.rstrip(b"\n")
        if line.startswith(b"event: "):
            current_event = line[len(b"event: "):].decode("utf-8", "replace")
        elif line.startswith(b"data: ") and current_event == "command":
            yield json.loads(line[len(b"data: "):].decode("utf-8"))
        elif line == b"":
            current_event = ""


def _open_stream(control_plane_url: str, token: str, runtime_instance_id: str, pod_uid: str) -> int:
    """Open one authenticated stream and acknowledge each received command with a candidate.

    A start, resume, or cancel command is acknowledged and never executed in this slice. When the
    stream drops, a local cancellation flag bounds any further candidate emission so a lost
    connection cannot keep reporting against a dead attempt.
    """
    body = json.dumps({"protocolVersion": _PROTOCOL_VERSION, "runtimeInstanceId": runtime_instance_id, "podUid": pod_uid}).encode("utf-8")
    request = Request(f"{control_plane_url.rstrip('/')}/stream", data=body, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "text/event-stream"}, method="POST")
    cancelled = threading.Event()
    try:
        with urlopen(request, timeout=45) as response:
            if response.status != 200:
                raise RuntimeError(f"runtime stream returned unexpected status {response.status}")
            _log("stream_connected", runtime_instance_id=runtime_instance_id)
            for command in _iter_commands(response, cancelled):
                if cancelled.is_set():
                    break
                candidate = _acknowledge_candidate(command, runtime_instance_id)
                if candidate is not None:
                    _post_json(f"{control_plane_url.rstrip('/')}/candidates", token, candidate, timeout=30)
                    _log("command_acknowledged", runtime_instance_id=runtime_instance_id, command_kind=command.get("kind"))
    finally:
        # Bounded local cancellation: once the stream context exits, no further candidate is emitted.
        cancelled.set()
    return 0


def _retry_delay(attempt: int) -> float:
    """Use bounded jittered reconnects so a missing authority cannot create a retry storm."""
    return min(30.0, (2 ** min(attempt, 5)) + random.uniform(0.0, 1.0))


def run_forever(open_stream: Callable[[str, str, str, str], int] = _open_stream, perform_bootstrap: Callable[[str, str, str, dict[str, object]], None] = _perform_bootstrap) -> None:
    """Perform the one-use bootstrap, then maintain the sole outbound command stream for this Pod.

    The bootstrap runs exactly once: a permanent refusal ends the process fail-closed, while a
    transient error retries with bounded jitter. The projected token is reread for each connection so
    kubelet rotation takes effect without a process restart; failures are logged without credential
    contents and retried with bounded jitter. This function never falls back to a static token,
    a second bootstrap, or a local durable queue.
    """
    control_plane_url = _environment("OPENCRANE_RUNTIME_STREAM_URL")
    token_path = _environment("OPENCRANE_RUNTIME_TOKEN_PATH", _DEFAULT_TOKEN_PATH)
    bootstrap_path = _environment("OPENCRANE_RUNTIME_BOOTSTRAP_PATH", _DEFAULT_BOOTSTRAP_PATH)
    pod_uid = _environment("POD_UID")
    runtime_instance_id = str(uuid.uuid4())
    proof_key = _generate_proof_key()
    bootstrap_reference = _read_bootstrap_reference(bootstrap_path)
    _log("runtime_started", runtime_instance_id=runtime_instance_id)

    # 1. Bind the public proof key exactly once before any command stream is opened.
    attempts = 0
    while True:
        try:
            perform_bootstrap(control_plane_url, _read_projected_token(token_path), bootstrap_reference, proof_key)
            break
        except BootstrapDeniedError as error:
            _log("bootstrap_denied", runtime_instance_id=runtime_instance_id, error_type=type(error).__name__)
            return
        except (HTTPError, URLError, OSError, RuntimeError) as error:
            attempts += 1
            delay_seconds = _retry_delay(attempts)
            _log("bootstrap_retry", runtime_instance_id=runtime_instance_id, error_type=type(error).__name__, retry_in_seconds=round(delay_seconds, 2))
            time.sleep(delay_seconds)

    # 2. Maintain the single command stream, reconnecting with bounded jitter on any loss.
    attempts = 0
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
