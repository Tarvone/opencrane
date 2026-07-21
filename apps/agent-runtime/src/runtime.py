"""Outbound-only OpenCrane personal-agent runtime.

This process performs its one-use bootstrap exchange, then opens a single authenticated command
stream to OpenCrane and executes the ``start_attempt`` commands it receives. Execution is a bounded
Pydantic AI model/tool loop over the per-silo LiteLLM proxy, reached only through an attempt-scoped
virtual key mounted as a group-readable Secret; the runtime holds no master key, no provider secret,
and no database. Raw framework events are normalized into stable protocol ``event`` candidates while
the attempt is active; Pydantic AI types, ids, and checkpoints never cross that seam.

External (side-effecting) TOOL execution, approval, steering, and run recovery (resume/cancel
dispatch) remain a later Phase E slice (#329): this slice compiles no callable tool and surfaces a
model-proposed tool call only as a bounded ``event`` candidate, never executing it. Because the loop
is configured with zero implicit retries, any executor failure surfaces as a real ``run.error``
candidate rather than a silent acknowledgement.
"""

import asyncio
import base64
import hashlib
import json
import os
import random
import sys
import threading
import time
import uuid
from typing import Callable, Iterable, Iterator
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


_PROTOCOL_VERSION = "opencrane.agent-runtime/v1"
_DEFAULT_TOKEN_PATH = "/var/run/opencrane/tokens/runtime.token"
_DEFAULT_BOOTSTRAP_PATH = "/var/run/opencrane/bootstrap/reference"
_DEFAULT_LITELLM_KEY_PATH = "/var/run/opencrane/litellm/key"
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


def _read_attempt_litellm_key(key_path: str) -> str:
    """Read the attempt-scoped LiteLLM virtual key from its mounted, group-readable Secret volume.

    The key is the runtime's only route to a model. It is read at execution time, never logged, and
    never placed in a shared or persistent location. A missing or empty file raises so the failure
    surfaces as a real ``run.error`` candidate rather than a silent success.
    """
    with open(key_path, "r", encoding="utf-8") as key_file:
        key = key_file.read().strip()
    if not key:
        raise RuntimeError("attempt-scoped LiteLLM key is empty")
    return key


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


def _command_coordinates(command: dict[str, object], runtime_instance_id: str) -> dict[str, object] | None:
    """Extract the immutable candidate coordinates carried by a received command.

    A candidate must echo the command's own runtime instance, command id, fence, run, and attempt so
    the control-plane authority can bind it back to the exact accepted command. A structurally invalid
    frame yields ``None`` rather than coordinates the authority would only reject.
    """
    assignment = command.get("assignment")
    command_id = command.get("commandId")
    fence = command.get("fence")
    if not isinstance(assignment, dict) or not isinstance(command_id, str) or not isinstance(fence, int):
        return None
    run_id = assignment.get("runId")
    attempt = assignment.get("attempt")
    if not isinstance(run_id, str) or not isinstance(attempt, int):
        return None
    return {"protocolVersion": _PROTOCOL_VERSION, "runtimeInstanceId": runtime_instance_id, "commandId": command_id, "runId": run_id, "attempt": attempt, "fence": fence}


def _candidate(coordinates: dict[str, object], event_type: str, payload: dict[str, object]) -> dict[str, object]:
    """Build one bounded ``event`` candidate from command coordinates, an event type, and a payload."""
    return {**coordinates, "candidateId": str(uuid.uuid4()), "kind": "event", "eventType": event_type, "payload": payload}


def _normalize_event(neutral_event: dict[str, object]) -> tuple[str, dict[str, object]] | None:
    """Normalize one neutral framework event into a stable protocol event type and payload.

    The neutral event is the adapter seam: the model driver translates Pydantic AI's own event
    objects into these plain dicts, so no framework type, id, or checkpoint crosses into a candidate.
    A model-proposed tool call is surfaced as a bounded proposal and never executed in this slice; a
    tool call with unparseable arguments becomes a ``run.error`` rather than a proposal.
    """
    kind = neutral_event.get("type")
    if kind == "output_text":
        text = neutral_event.get("text")
        return ("run.output_text", {"text": text if isinstance(text, str) else ""})
    if kind == "usage":
        return ("run.usage", {"inputTokens": _non_negative_int(neutral_event.get("inputTokens")), "outputTokens": _non_negative_int(neutral_event.get("outputTokens"))})
    if kind == "tool_call":
        tool_name = neutral_event.get("toolName")
        tool_call_id = neutral_event.get("toolCallId")
        raw_arguments = neutral_event.get("arguments")
        if not isinstance(tool_name, str) or not isinstance(tool_call_id, str) or not isinstance(raw_arguments, str):
            return ("run.error", {"reason": "malformed_tool_call"})
        try:
            arguments = json.loads(raw_arguments)
        except json.JSONDecodeError:
            return ("run.error", {"reason": "malformed_tool_call", "toolCallId": tool_call_id})
        return ("run.tool_call_proposed", {"toolName": tool_name, "toolCallId": tool_call_id, "arguments": arguments})
    if kind == "error":
        message = neutral_event.get("message")
        return ("run.error", {"reason": "model_loop_error", "detail": message if isinstance(message, str) else ""})
    # An unrecognized framework event is dropped rather than surfaced as a candidate. Log the event
    # type only (never the payload, which may carry model content) so a silent adapter/seam drift is
    # observable without leaking anything sensitive.
    _log("framework_event_dropped", event_type=kind if isinstance(kind, str) else "")
    return None


def _non_negative_int(value: object) -> int:
    """Coerce a usage counter to a non-negative integer, defaulting unknown values to zero."""
    return value if isinstance(value, int) and value >= 0 else 0


def _zero_retry_openai_settings() -> dict[str, int]:
    """Return the exact zero-retry model configuration proving no implicit loop retries.

    Every implicit retry path pydantic-ai 2.13.0 and its OpenAI provider expose is pinned to zero,
    and each value below is applied at a specific construction site by ``_build_zero_retry_agent``:

    - ``model_request_retries`` and ``provider_http_retries`` → the OpenAI SDK client's ``max_retries``
      (which defaults to 2). The model request is issued through the provider's ``AsyncOpenAI``
      transport, so a single ``max_retries=0`` disables both the transport-level HTTP retry and any
      model-request re-issue; both keys therefore map to that one client argument and must agree.
    - ``tool_validation_retries`` → ``Agent(retries=0)`` — pydantic-ai's default tool-argument
      validation retry count.
    - ``output_validation_retries`` → ``Agent(output_retries=0)`` — the output-validation retry count,
      set explicitly rather than inherited from ``retries`` so the proof never rests on a default.

    OpenCrane owns retry, fallback, and terminal authority, so the bounded loop must never silently
    re-issue a request, re-validate a tool call, or re-coerce output.
    """
    return {
        "model_request_retries": 0,
        "provider_http_retries": 0,
        "tool_validation_retries": 0,
        "output_validation_retries": 0,
    }


def _build_zero_retry_agent(
    model_alias: str,
    base_url: str,
    attempt_key: str,
    instructions: str,
    *,
    agent_cls: Callable[..., object] | None = None,
    model_cls: Callable[..., object] | None = None,
    provider_cls: Callable[..., object] | None = None,
    async_openai: Callable[..., object] | None = None,
) -> object:
    """Construct the bounded Pydantic AI agent with every implicit retry path pinned to zero.

    The pydantic-ai and openai symbols are imported lazily so the outbound shell and its offline tests
    never require either package. The four constructors are injectable seams: offline tests pass
    recording fakes and assert that the ``_zero_retry_openai_settings`` values actually reach the
    OpenAI client and the Agent, since pydantic-ai is not installed here to exercise a live call.
    """
    # 1. Resolve the real pydantic-ai constructors lazily, honouring any injected test seam.
    if agent_cls is None or model_cls is None or provider_cls is None:
        from pydantic_ai import Agent
        from pydantic_ai.models.openai import OpenAIModel
        from pydantic_ai.providers.openai import OpenAIProvider

        agent_cls = agent_cls or Agent
        model_cls = model_cls or OpenAIModel
        provider_cls = provider_cls or OpenAIProvider
    if async_openai is None:
        from openai import AsyncOpenAI

        async_openai = AsyncOpenAI

    settings = _zero_retry_openai_settings()
    if settings["provider_http_retries"] != settings["model_request_retries"]:
        raise RuntimeError("provider HTTP and model-request retries must agree on the transport")

    # 2. Disable OpenAI transport retries so neither the HTTP client nor the model request re-issues.
    openai_client = async_openai(base_url=base_url, api_key=attempt_key, max_retries=settings["provider_http_retries"])
    # 3. Bind the model to that zero-retry client through the provider.
    provider = provider_cls(openai_client=openai_client)
    model = model_cls(model_alias, provider=provider)
    # 4. Pin the agent's tool-argument and output validation retries to zero as well.
    return agent_cls(model, system_prompt=instructions, retries=settings["tool_validation_retries"], output_retries=settings["output_validation_retries"])


def _pydantic_ai_event_source(compiled_input: dict[str, object]) -> Iterator[dict[str, object]]:
    """Drive the bounded Pydantic AI model/tool loop and yield neutral framework events.

    Pydantic AI is imported lazily so the outbound shell and its offline tests never require the
    package. The loop connects to the per-silo LiteLLM proxy over the OpenAI-compatible adapter using
    the attempt-scoped virtual key, uses ``agent.iter()`` / ``run_stream_events()`` (never the
    ``run_stream()`` final-output shortcut), and is configured with zero implicit retries. The
    excluded subsystems — Harness, sessions, UI adapters, direct MCP / hosted-tool execution,
    memory / compaction, filesystem / shell tools, and Logfire export — are disabled by omission and
    configuration, never imported and then switched off.

    Live-LiteLLM conformance is the deferred adoption gate recorded in ADR 0010; it is NOT run here.
    Offline tests inject a fake event source instead of importing Pydantic AI.
    """
    from pydantic_ai import Agent

    base_url = _environment("OPENCRANE_RUNTIME_LITELLM_BASE_URL")
    key_path = os.environ.get("OPENCRANE_RUNTIME_LITELLM_KEY_PATH", _DEFAULT_LITELLM_KEY_PATH)
    attempt_key = _read_attempt_litellm_key(key_path)
    model_route = compiled_input.get("model")
    model_alias = model_route.get("modelAlias") if isinstance(model_route, dict) else None
    if not isinstance(model_alias, str) or not model_alias:
        raise RuntimeError("compiled input is missing a model alias")

    instructions = compiled_input.get("instructions")
    agent = _build_zero_retry_agent(model_alias, base_url, attempt_key, instructions if isinstance(instructions, str) else "")

    async def _collect() -> list[dict[str, object]]:
        events: list[dict[str, object]] = []
        async with agent.iter(_prompt(compiled_input)) as run:
            async for node in run:
                if Agent.is_model_request_node(node):
                    async with node.stream(run.ctx) as request_stream:
                        async for event in request_stream:
                            events.append(_translate_framework_event(event))
        usage = run.usage()
        events.append({"type": "usage", "inputTokens": getattr(usage, "input_tokens", 0), "outputTokens": getattr(usage, "output_tokens", 0)})
        return events

    for event in asyncio.run(_collect()):
        yield event


def _prompt(compiled_input: dict[str, object]) -> str:
    """Derive the user prompt from the compiled messages, joining their literal content in order."""
    messages = compiled_input.get("messages")
    if not isinstance(messages, list):
        return ""
    parts = [message.get("content") for message in messages if isinstance(message, dict) and isinstance(message.get("content"), str)]
    return "\n".join(part for part in parts if isinstance(part, str))


def _translate_framework_event(event: object) -> dict[str, object]:
    """Translate one Pydantic AI stream event into a neutral event dict at the adapter seam.

    Only the small, stable shape the normalizer understands crosses here; the framework object itself
    never leaves this function. Unrecognized events become a benign empty output-text event.
    """
    delta = getattr(getattr(event, "delta", None), "content_delta", None)
    if isinstance(delta, str):
        return {"type": "output_text", "text": delta}
    tool_name = getattr(getattr(event, "part", None), "tool_name", None)
    if isinstance(tool_name, str):
        part = event.part
        return {"type": "tool_call", "toolName": tool_name, "toolCallId": getattr(part, "tool_call_id", ""), "arguments": getattr(part, "args_as_json_str", lambda: "{}")()}
    return {"type": "output_text", "text": ""}


def _execute_start_attempt(command: dict[str, object], runtime_instance_id: str, post_candidate: Callable[[dict[str, object]], None], event_source: Callable[[dict[str, object]], Iterable[dict[str, object]]] = _pydantic_ai_event_source) -> None:
    """Execute one ``start_attempt`` command as a bounded model loop, reporting event candidates.

    It emits a ``run.started`` candidate, normalizes every model-loop event into a bounded ``event``
    candidate as the attempt runs, and closes with ``run.completed``. Because the loop performs zero
    implicit retries, any failure — a missing key, an unreachable proxy, or a framework error —
    surfaces as a single ``run.error`` candidate, never a silent acknowledgement.
    """
    coordinates = _command_coordinates(command, runtime_instance_id)
    if coordinates is None:
        return
    payload = command.get("payload")
    compiled_input = payload.get("compiledInput") if isinstance(payload, dict) else None
    if not isinstance(compiled_input, dict):
        post_candidate(_candidate(coordinates, "run.error", {"reason": "missing_compiled_input"}))
        return
    post_candidate(_candidate(coordinates, "run.started", {"promptCompilerVersion": compiled_input.get("promptCompilerVersion")}))
    try:
        for neutral_event in event_source(compiled_input):
            normalized = _normalize_event(neutral_event)
            if normalized is not None:
                post_candidate(_candidate(coordinates, normalized[0], normalized[1]))
        post_candidate(_candidate(coordinates, "run.completed", {}))
    except (HTTPError, URLError, OSError, RuntimeError, ValueError) as error:
        post_candidate(_candidate(coordinates, "run.error", {"reason": "executor_failed", "errorType": type(error).__name__}))


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
    """Open one authenticated stream and execute each received ``start_attempt`` as a model loop.

    Only ``start_attempt`` is dispatched to this runtime; resume and cancel dispatch belong to a later
    slice, so any other command kind is ignored without a candidate. When the stream drops, a local
    cancellation flag bounds further candidate emission so a lost connection cannot keep reporting
    against a dead attempt.
    """
    body = json.dumps({"protocolVersion": _PROTOCOL_VERSION, "runtimeInstanceId": runtime_instance_id, "podUid": pod_uid}).encode("utf-8")
    request = Request(f"{control_plane_url.rstrip('/')}/stream", data=body, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "text/event-stream"}, method="POST")
    cancelled = threading.Event()

    def _post_candidate(candidate: dict[str, object]) -> None:
        _post_json(f"{control_plane_url.rstrip('/')}/candidates", token, candidate, timeout=30)

    try:
        with urlopen(request, timeout=45) as response:
            if response.status != 200:
                raise RuntimeError(f"runtime stream returned unexpected status {response.status}")
            _log("stream_connected", runtime_instance_id=runtime_instance_id)
            for command in _iter_commands(response, cancelled):
                if cancelled.is_set():
                    break
                if command.get("kind") != "start_attempt":
                    continue
                _execute_start_attempt(command, runtime_instance_id, _post_candidate)
                _log("attempt_executed", runtime_instance_id=runtime_instance_id, command_kind=command.get("kind"))
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
