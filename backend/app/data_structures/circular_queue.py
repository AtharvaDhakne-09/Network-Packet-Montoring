from __future__ import annotations

from collections import deque
from typing import Generic, Iterator, Optional, TypeVar

T = TypeVar("T")


class CircularQueue(Generic[T]):
    """Fixed-capacity FIFO queue backed by a preallocated array.

    Indexing uses modular arithmetic: rear = (rear + 1) % capacity and
    front = (front + 1) % capacity. enqueue/dequeue are O(1).

    Overflow policy is drop-tail: when full, the arriving item is rejected
    and ``overflow_count`` is incremented. Queued items are never overwritten.
    """

    def __init__(self, capacity: int, trace_size: int = 64) -> None:
        if not isinstance(capacity, int) or capacity <= 0:
            raise ValueError("capacity must be a positive integer")
        self._capacity = capacity
        self._buffer: list[Optional[T]] = [None] * capacity
        self._front = 0
        self._rear = 0
        self._count = 0
        self.enqueue_count = 0
        self.dequeue_count = 0
        self.overflow_count = 0
        self.underflow_count = 0
        self.wraparound_count = 0
        self._trace: deque[dict] = deque(maxlen=trace_size)

    def _record(self, op: str, slot: Optional[int] = None, extra: Optional[dict] = None) -> None:
        entry = {"op": op, "slot": slot, "size": self._count}
        if extra:
            entry.update(extra)
        self._trace.append(entry)

    def enqueue(self, item: T) -> bool:
        if self.is_full():
            self.overflow_count += 1
            self._record("overflow", self._rear, {"capacity": self._capacity})
            return False
        self._buffer[self._rear] = item
        slot = self._rear
        self._rear = (self._rear + 1) % self._capacity
        self._count += 1
        self.enqueue_count += 1
        if self._rear == 0 and self._count > 0:
            self.wraparound_count += 1
        self._record("enqueue", slot)
        return True

    def dequeue(self) -> Optional[T]:
        if self.is_empty():
            self.underflow_count += 1
            self._record("underflow", self._front)
            return None
        item = self._buffer[self._front]
        slot = self._front
        self._buffer[self._front] = None
        self._front = (self._front + 1) % self._capacity
        self._count -= 1
        self.dequeue_count += 1
        self._record("dequeue", slot)
        return item

    def peek(self) -> Optional[T]:
        if self.is_empty():
            return None
        return self._buffer[self._front]

    def is_empty(self) -> bool:
        return self._count == 0

    def is_full(self) -> bool:
        return self._count == self._capacity

    def get_size(self) -> int:
        return self._count

    def get_capacity(self) -> int:
        return self._capacity

    def get_contents(self) -> list[T]:
        items: list[T] = []
        idx = self._front
        for _ in range(self._count):
            items.append(self._buffer[idx])  # type: ignore[arg-type]
            idx = (idx + 1) % self._capacity
        return items

    def __iter__(self) -> Iterator[T]:
        return iter(self.get_contents())

    def __len__(self) -> int:
        return self._count

    def clear(self) -> None:
        self._buffer = [None] * self._capacity
        self._front = 0
        self._rear = 0
        self._count = 0
        self._record("clear", 0)

    def reset_stats(self) -> None:
        self.enqueue_count = 0
        self.dequeue_count = 0
        self.overflow_count = 0
        self.underflow_count = 0
        self.wraparound_count = 0
        self._trace.clear()

    def get_trace(self) -> list[dict]:
        return list(self._trace)

    def snapshot(self) -> dict:
        return {
            "type": "circular_queue",
            "capacity": self._capacity,
            "size": self._count,
            "front": self._front,
            "rear": self._rear,
            "is_empty": self.is_empty(),
            "is_full": self.is_full(),
            "buffer": self._serialize_buffer(),
            "contents": self.get_contents(),
            "counters": {
                "enqueue": self.enqueue_count,
                "dequeue": self.dequeue_count,
                "overflow": self.overflow_count,
                "underflow": self.underflow_count,
                "wraparound": self.wraparound_count,
            },
            "trace": self.get_trace(),
            "complexity": {"enqueue": "O(1)", "dequeue": "O(1)", "peek": "O(1)", "search": "O(n)"},
        }

    def _serialize_buffer(self) -> list[dict]:
        cells: list[dict] = []
        for i, value in enumerate(self._buffer):
            role = "empty"
            if value is not None:
                role = "occupied"
            if i == self._front and self._count > 0:
                role = "front" if i != self._rear else "front_rear"
            elif i == self._rear and self._count > 0:
                role = "rear"
            if self.is_full() and value is not None:
                role = "front_rear" if i == self._front else "occupied"
            cells.append({"index": i, "item": value, "role": role})
        return cells
