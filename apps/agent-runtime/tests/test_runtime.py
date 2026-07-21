"""Focused behavioral tests for the runtime shell, its bootstrap exchange, and the model executor.

The executor is exercised offline against recorded neutral-event fixtures fed through the same
normalizer the live Pydantic AI driver feeds. Driving the real ``pydantic-ai`` package against a
fake OpenAI-compatible endpoint is the deferred adoption gate recorded in ADR 0010 and is not run
here; these tests import no framework package and reach no network.
"""

import contextlib
import importlib.util
import io
import os
import tempfile
import threading
import unittest

from src import runtime
from src.runtime import (
    BootstrapDeniedError,
    _candidate,
    _command_coordinates,
    _execute_start_attempt,
    _iter_commands,
    _normalize_event,
    _retry_delay,
    _rfc7638_thumbprint,
    _zero_retry_openai_settings,
    run_forever,
)


def _start_command() -> dict:
    """Build one structurally valid ``start_attempt`` command carrying a compiled input."""
    return {
        "kind": "start_attempt",
        "commandId": "c1",
        "fence": 2,
        "assignment": {"runId": "r1", "attempt": 1},
        "payload": {"compiledInput": {"promptCompilerVersion": "v1", "instructions": "be careful", "messages": [{"role": "user", "content": "hi"}], "tools": [], "model": {"modelAlias": "silo-default", "maxOutputTokens": None}, "budget": {}, "digest": "sha256:x"}},
    }


class RuntimeRetryDelayTests(unittest.TestCase):
    """Validate the shell's bounded reconnect behavior."""

    def test_retry_delay_is_bounded(self) -> None:
        """A permanently unavailable controller cannot make retries grow without bound."""
        self.assertLessEqual(_retry_delay(100), 31.0)


class RuntimeThumbprintTests(unittest.TestCase):
    """Validate the RFC 7638 thumbprint matches the canonical EC member order."""

    def test_thumbprint_is_deterministic_unpadded_base64url(self) -> None:
        """The digest is a stable 43-char unpadded base64url SHA-256 that changes with the key."""
        first = _rfc7638_thumbprint("x-coordinate", "y-coordinate")
        self.assertEqual(len(first), 43)
        self.assertNotIn("=", first)
        self.assertEqual(first, _rfc7638_thumbprint("x-coordinate", "y-coordinate"))
        self.assertNotEqual(first, _rfc7638_thumbprint("x-coordinate", "other-coordinate"))


class RuntimeCommandFramingTests(unittest.TestCase):
    """Validate SSE command parsing."""

    def test_iter_commands_parses_only_command_events(self) -> None:
        """Only ``command`` events yield a parsed body; heartbeats are ignored."""
        lines = [
            b"event: command\n",
            b'data: {"kind":"start_attempt","commandId":"c1","fence":1,"assignment":{"runId":"r1","attempt":1}}\n',
            b"\n",
            b"event: heartbeat\n",
            b'data: {"protocolVersion":"opencrane.agent-runtime/v1"}\n',
            b"\n",
        ]
        commands = list(_iter_commands(iter(lines), threading.Event()))
        self.assertEqual(len(commands), 1)
        self.assertEqual(commands[0]["commandId"], "c1")

    def test_iter_commands_stops_when_cancelled(self) -> None:
        """A set cancellation flag bounds command reading after stream loss."""
        cancelled = threading.Event()
        cancelled.set()
        self.assertEqual(list(_iter_commands(iter([b"event: command\n"]), cancelled)), [])


class RuntimeNormalizerTests(unittest.TestCase):
    """Validate the neutral-event normalizer that keeps framework types out of candidates."""

    def test_output_text_event(self) -> None:
        """A text delta becomes a bounded ``run.output_text`` payload."""
        self.assertEqual(_normalize_event({"type": "output_text", "text": "hello"}), ("run.output_text", {"text": "hello"}))

    def test_usage_event_coerces_counters(self) -> None:
        """Usage counters normalize to non-negative integers, defaulting unknown values to zero."""
        self.assertEqual(_normalize_event({"type": "usage", "inputTokens": 12, "outputTokens": None}), ("run.usage", {"inputTokens": 12, "outputTokens": 0}))

    def test_tool_call_proposal_parses_assembled_arguments(self) -> None:
        """A tool call with fully assembled JSON arguments surfaces as a bounded proposal."""
        event = {"type": "tool_call", "toolName": "search", "toolCallId": "tc1", "arguments": '{"q":"a"}'}
        self.assertEqual(_normalize_event(event), ("run.tool_call_proposed", {"toolName": "search", "toolCallId": "tc1", "arguments": {"q": "a"}}))

    def test_malformed_tool_call_arguments_become_error(self) -> None:
        """Unparseable tool arguments become a ``run.error`` rather than a proposal."""
        event = {"type": "tool_call", "toolName": "search", "toolCallId": "tc1", "arguments": '{"q":'}
        self.assertEqual(_normalize_event(event), ("run.error", {"reason": "malformed_tool_call", "toolCallId": "tc1"}))

    def test_missing_tool_fields_become_error(self) -> None:
        """A tool call missing its name or id is malformed and never a proposal."""
        self.assertEqual(_normalize_event({"type": "tool_call", "toolName": "search"}), ("run.error", {"reason": "malformed_tool_call"}))

    def test_unknown_event_is_dropped(self) -> None:
        """An unrecognized event yields no candidate but is logged for observability."""
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            self.assertIsNone(_normalize_event({"type": "mystery"}))
        logged = buffer.getvalue()
        self.assertIn("framework_event_dropped", logged)
        self.assertIn("mystery", logged)


class RuntimeZeroRetryTests(unittest.TestCase):
    """Prove the executor's model configuration performs zero implicit retries."""

    def test_every_retry_path_is_zero(self) -> None:
        """Model-request, provider-HTTP, tool-validation, and output-validation retries are all zero."""
        settings = _zero_retry_openai_settings()
        self.assertEqual(set(settings.values()), {0})
        self.assertEqual(settings["model_request_retries"], 0)
        self.assertEqual(settings["provider_http_retries"], 0)
        self.assertEqual(settings["tool_validation_retries"], 0)
        self.assertEqual(settings["output_validation_retries"], 0)

    def test_zero_retry_settings_reach_provider_and_agent(self) -> None:
        """The zero-retry values are actually passed to the OpenAI client and Agent, not merely returned."""
        recorded: dict = {}

        class _Client:
            def __init__(self, **kwargs: object) -> None:
                recorded["client"] = kwargs

        class _Provider:
            def __init__(self, **kwargs: object) -> None:
                recorded["provider"] = kwargs

        class _Model:
            def __init__(self, name: str, **kwargs: object) -> None:
                recorded["model"] = {"name": name, **kwargs}

        class _Agent:
            def __init__(self, model: object, **kwargs: object) -> None:
                recorded["agent"] = kwargs
                self.model = model

        runtime._build_zero_retry_agent(
            "silo-default",
            "http://litellm.svc.cluster.local",
            "sk-attempt",
            "be careful",
            agent_cls=_Agent,
            model_cls=_Model,
            provider_cls=_Provider,
            async_openai=_Client,
        )
        # Provider HTTP / model-request retries land on the OpenAI client transport as max_retries=0.
        self.assertEqual(recorded["client"]["max_retries"], 0)
        self.assertEqual(recorded["client"]["base_url"], "http://litellm.svc.cluster.local")
        self.assertEqual(recorded["client"]["api_key"], "sk-attempt")
        # The model is bound to that zero-retry client through the provider.
        self.assertIsInstance(recorded["provider"]["openai_client"], _Client)
        self.assertEqual(recorded["model"]["name"], "silo-default")
        # Tool-argument and output validation retries land on the Agent.
        self.assertEqual(recorded["agent"]["retries"], 0)
        self.assertEqual(recorded["agent"]["output_retries"], 0)


class RuntimeExecutorTests(unittest.TestCase):
    """Validate the ``start_attempt`` executor over recorded neutral-event fixtures."""

    def test_streams_started_events_and_completed(self) -> None:
        """A streaming run emits started, ordered per-event candidates, then completed."""
        emitted: list[dict] = []
        fixture = [
            {"type": "output_text", "text": "part-1"},
            {"type": "tool_call", "toolName": "alpha", "toolCallId": "t1", "arguments": "{}"},
            {"type": "tool_call", "toolName": "zulu", "toolCallId": "t2", "arguments": "{}"},
            {"type": "usage", "inputTokens": 5, "outputTokens": 7},
        ]
        _execute_start_attempt(_start_command(), "instance-1", emitted.append, event_source=lambda _compiled: iter(fixture))
        event_types = [candidate["eventType"] for candidate in emitted]
        self.assertEqual(event_types, ["run.started", "run.output_text", "run.tool_call_proposed", "run.tool_call_proposed", "run.usage", "run.completed"])
        self.assertEqual([emitted[2]["payload"]["toolName"], emitted[3]["payload"]["toolName"]], ["alpha", "zulu"])
        self.assertTrue(all(candidate["runId"] == "r1" and candidate["fence"] == 2 for candidate in emitted))

    def test_missing_compiled_input_is_a_real_error(self) -> None:
        """A start command without compiled input surfaces a ``run.error``, never a silent ack."""
        emitted: list[dict] = []
        command = _start_command()
        command["payload"] = {}
        _execute_start_attempt(command, "instance-1", emitted.append, event_source=lambda _compiled: iter([]))
        self.assertEqual([candidate["eventType"] for candidate in emitted], ["run.error"])
        self.assertEqual(emitted[0]["payload"]["reason"], "missing_compiled_input")

    def test_event_source_failure_surfaces_run_error(self) -> None:
        """An executor failure with zero retries produces started then a single ``run.error``."""
        emitted: list[dict] = []

        def _boom(_compiled: dict):
            raise RuntimeError("proxy unreachable")
            yield  # pragma: no cover - generator marker

        _execute_start_attempt(_start_command(), "instance-1", emitted.append, event_source=_boom)
        self.assertEqual([candidate["eventType"] for candidate in emitted], ["run.started", "run.error"])
        self.assertEqual(emitted[1]["payload"], {"reason": "executor_failed", "errorType": "RuntimeError"})

    def test_malformed_command_emits_no_candidate(self) -> None:
        """A command missing its assignment yields no coordinates and therefore no candidate."""
        emitted: list[dict] = []
        _execute_start_attempt({"kind": "start_attempt", "commandId": "c1", "fence": 1}, "instance-1", emitted.append, event_source=lambda _compiled: iter([]))
        self.assertEqual(emitted, [])

    def test_command_coordinates_bind_candidate_to_command(self) -> None:
        """Candidate coordinates echo the exact command instance, id, fence, run, and attempt."""
        coordinates = _command_coordinates(_start_command(), "instance-1")
        assert coordinates is not None
        candidate = _candidate(coordinates, "run.started", {})
        self.assertEqual(candidate["commandId"], "c1")
        self.assertEqual(candidate["attempt"], 1)
        self.assertEqual(candidate["kind"], "event")


class RuntimePydanticAiDriverTests(unittest.TestCase):
    """Guard the deferred live driver so its conformance gate is explicit, not silently skipped."""

    @unittest.skipUnless(importlib.util.find_spec("pydantic_ai") is not None, "pydantic-ai is installed only in the adoption/conformance environment")
    def test_driver_module_is_importable_when_present(self) -> None:  # pragma: no cover - adoption env only
        """When the pinned framework is present, the lazily imported driver symbols resolve."""
        from pydantic_ai import Agent  # noqa: F401
        from pydantic_ai.models.openai import OpenAIModel  # noqa: F401
        from pydantic_ai.providers.openai import OpenAIProvider  # noqa: F401


class RuntimeBootstrapGateTests(unittest.TestCase):
    """Validate the one-use bootstrap gate before any stream opens."""

    def setUp(self) -> None:
        """Point the shell at temp credential files and a fake proof key without cryptography."""
        self._token = tempfile.NamedTemporaryFile("w", suffix=".token", delete=False)
        self._token.write("projected-token")
        self._token.flush()
        self._token.close()
        self._bootstrap = tempfile.NamedTemporaryFile("w", suffix=".ref", delete=False)
        self._bootstrap.write("bootstrap-v1_" + "a" * 64)
        self._bootstrap.flush()
        self._bootstrap.close()
        os.environ["OPENCRANE_RUNTIME_STREAM_URL"] = "http://opencrane.svc/api/internal/agent-runtime"
        os.environ["OPENCRANE_RUNTIME_TOKEN_PATH"] = self._token.name
        os.environ["OPENCRANE_RUNTIME_BOOTSTRAP_PATH"] = self._bootstrap.name
        os.environ["POD_UID"] = "pod-1"
        self._original_generate = runtime._generate_proof_key
        runtime._generate_proof_key = lambda: {"privateKey": None, "publicJwk": {"kty": "EC", "crv": "P-256", "x": "a", "y": "b"}, "thumbprint": "t"}

    def tearDown(self) -> None:
        """Restore the real keygen and remove the temporary credential files."""
        runtime._generate_proof_key = self._original_generate
        os.unlink(self._token.name)
        os.unlink(self._bootstrap.name)
        for name in ("OPENCRANE_RUNTIME_STREAM_URL", "OPENCRANE_RUNTIME_TOKEN_PATH", "OPENCRANE_RUNTIME_BOOTSTRAP_PATH", "POD_UID"):
            os.environ.pop(name, None)

    def test_denied_bootstrap_never_opens_a_stream(self) -> None:
        """A refused bootstrap ends the process fail-closed without opening a command stream."""
        opened: list[str] = []

        def _deny(_url: str, _token: str, _reference: str, _key: dict) -> None:
            raise BootstrapDeniedError("already consumed")

        def _open(_url: str, _token: str, _instance: str, _pod: str) -> int:
            opened.append(_instance)
            return 0

        run_forever(open_stream=_open, perform_bootstrap=_deny)
        self.assertEqual(opened, [])

    def test_successful_bootstrap_precedes_the_stream(self) -> None:
        """The stream opens only after exactly one successful bootstrap binding."""
        calls: list[str] = []

        def _bind(_url: str, _token: str, _reference: str, _key: dict) -> None:
            calls.append("bootstrap")

        class _Stop(Exception):
            """Sentinel to break the otherwise infinite reconnect loop after one open."""

        def _open(_url: str, _token: str, _instance: str, _pod: str) -> int:
            calls.append("stream")
            raise _Stop()

        with self.assertRaises(_Stop):
            run_forever(open_stream=_open, perform_bootstrap=_bind)
        self.assertEqual(calls, ["bootstrap", "stream"])


if __name__ == "__main__":
    unittest.main()
