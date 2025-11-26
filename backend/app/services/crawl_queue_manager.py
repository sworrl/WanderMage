"""
Crawl Queue Manager - Stub for managing POI crawl queues.
"""

from typing import Any


class QueueManager:
    """Stub queue manager."""

    def get_status(self):
        return {"status": "idle", "queue_length": 0}

    def add_job(self, job_type: str, params: dict = None):
        pass

    def cancel_job(self, job_id: str):
        pass


_queue_manager = None


def get_queue_manager() -> QueueManager:
    """Get the singleton queue manager."""
    global _queue_manager
    if _queue_manager is None:
        _queue_manager = QueueManager()
    return _queue_manager
