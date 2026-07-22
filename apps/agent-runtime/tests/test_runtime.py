"""Focused behavioral tests for the model-free runtime shell."""

import unittest

from src.runtime import _retry_delay


class RuntimeRetryDelayTests(unittest.TestCase):
    """Validate the shell's bounded reconnect behavior."""

    def test_retry_delay_is_bounded(self) -> None:
        """A permanently unavailable controller cannot make retries grow without bound."""
        self.assertLessEqual(_retry_delay(100), 31.0)


if __name__ == "__main__":
    unittest.main()
