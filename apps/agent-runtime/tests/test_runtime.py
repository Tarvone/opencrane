"""Focused behavioral tests for the model-free runtime shell and its bootstrap exchange."""

import os
import tempfile
import threading
import unittest

from src import runtime
from src.runtime import (
    BootstrapDeniedError,
    _acknowledge_candidate,
    _iter_commands,
    _retry_delay,
    _rfc7638_thumbprint,
    run_forever,
)


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
    """Validate SSE command parsing and lifecycle acknowledgement."""

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

    def test_acknowledge_candidate_builds_bounded_event(self) -> None:
        """A valid command produces an ``event`` candidate carrying only its coordinates."""
        candidate = _acknowledge_candidate({"kind": "start_attempt", "commandId": "c1", "fence": 2, "assignment": {"runId": "r1", "attempt": 1}}, "instance-1234")
        self.assertIsNotNone(candidate)
        assert candidate is not None
        self.assertEqual(candidate["kind"], "event")
        self.assertEqual(candidate["eventType"], "run.attempt_acknowledged")
        self.assertEqual(candidate["runId"], "r1")
        self.assertEqual(candidate["fence"], 2)
        self.assertEqual(candidate["payload"], {"acknowledgedKind": "start_attempt"})

    def test_acknowledge_candidate_rejects_malformed_command(self) -> None:
        """A command missing its assignment yields no candidate rather than an invalid one."""
        self.assertIsNone(_acknowledge_candidate({"kind": "start_attempt", "commandId": "c1", "fence": 1}, "instance-1234"))


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
