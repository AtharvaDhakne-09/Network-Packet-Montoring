from __future__ import annotations

from collections import deque
from typing import Callable, Generic, Optional, TypeVar

T = TypeVar("T")


class HeapEntry(Generic[T]):
    __slots__ = ("priority", "sequence", "item")

    def __init__(self, priority: int, sequence: int, item: T) -> None:
        self.priority = priority
        self.sequence = sequence
        self.item = item

    def key(self) -> tuple[int, int]:
        return (self.priority, self.sequence)


class MinHeapPriorityQueue(Generic[T]):
    """Binary min-heap priority queue implemented from scratch.

    Lower numeric priority means higher scheduling precedence
    (1 = highest). Ties are broken by insertion order so that among equal
    priorities the earlier-arriving packet is extracted first.

    insert and extract_min are O(log n); peek is O(1). The heap is bounded:
    inserting into a full heap is rejected (drop-tail) and counted as overflow.
    """

    def __init__(
        self,
        capacity: int,
        priority_of: Optional[Callable[[T], int]] = None,
        trace_size: int = 64,
    ) -> None:
        if not isinstance(capacity, int) or capacity <= 0:
            raise ValueError("capacity must be a positive integer")
        self._capacity = capacity
        self._priority_of = priority_of or (lambda _item: 3)
        self._heap: list[HeapEntry[T]] = []
        self._sequence = 0
        self.insertion_count = 0
        self.extraction_count = 0
        self.overflow_count = 0
        self.swap_count = 0
        self._trace: deque[dict] = deque(maxlen=trace_size)

    def _record(self, op: str, index: Optional[int] = None, extra: Optional[dict] = None) -> None:
        entry = {"op": op, "index": index, "size": len(self._heap)}
        if extra:
            entry.update(extra)
        self._trace.append(entry)

    @staticmethod
    def _parent(i: int) -> int:
        return (i - 1) // 2

    @staticmethod
    def _left(i: int) -> int:
        return 2 * i + 1

    @staticmethod
    def _right(i: int) -> int:
        return 2 * i + 2

    def _swap(self, i: int, j: int) -> None:
        self._heap[i], self._heap[j] = self._heap[j], self._heap[i]
        self.swap_count += 1
        self._record("swap", j, {"with": i, "priority": self._heap[j].priority})

    def _sift_up(self, index: int) -> None:
        while index > 0:
            parent = self._parent(index)
            if self._heap[index].key() < self._heap[parent].key():
                self._swap(index, parent)
                index = parent
            else:
                break

    def _sift_down(self, index: int) -> None:
        size = len(self._heap)
        while True:
            smallest = index
            left = self._left(index)
            right = self._right(index)
            if left < size and self._heap[left].key() < self._heap[smallest].key():
                smallest = left
            if right < size and self._heap[right].key() < self._heap[smallest].key():
                smallest = right
            if smallest == index:
                break
            self._swap(index, smallest)
            index = smallest

    def insert(self, item: T) -> bool:
        if self.is_full():
            self.overflow_count += 1
            self._record("overflow", None, {"capacity": self._capacity})
            return False
        priority = int(self._priority_of(item))
        entry = HeapEntry(priority, self._sequence, item)
        self._sequence += 1
        self._heap.append(entry)
        self.insertion_count += 1
        self._record("insert", len(self._heap) - 1, {"priority": priority})
        self._sift_up(len(self._heap) - 1)
        return True

    def extract_min(self) -> Optional[T]:
        entry = self.extract_min_entry()
        return entry.item if entry is not None else None

    def extract_min_entry(self) -> Optional[HeapEntry[T]]:
        if self.is_empty():
            self._record("underflow")
            return None
        root = self._heap[0]
        last = self._heap.pop()
        if self._heap:
            self._heap[0] = last
            self._sift_down(0)
        self.extraction_count += 1
        self._record("extract", 0, {"priority": root.priority})
        return root

    def peek(self) -> Optional[T]:
        if self.is_empty():
            return None
        return self._heap[0].item

    def peek_entry(self) -> Optional[HeapEntry[T]]:
        if self.is_empty():
            return None
        return self._heap[0]

    def enqueue(self, item: T) -> bool:
        return self.insert(item)

    def dequeue(self) -> Optional[T]:
        return self.extract_min()

    def is_empty(self) -> bool:
        return len(self._heap) == 0

    def is_full(self) -> bool:
        return len(self._heap) >= self._capacity

    def get_size(self) -> int:
        return len(self._heap)

    def get_capacity(self) -> int:
        return self._capacity

    def get_contents(self) -> list[T]:
        return [entry.item for entry in self._heap]

    def __len__(self) -> int:
        return len(self._heap)

    def clear(self) -> None:
        self._heap = []
        self._record("clear", 0)

    def reset_stats(self) -> None:
        self.insertion_count = 0
        self.extraction_count = 0
        self.overflow_count = 0
        self.swap_count = 0
        self._trace.clear()

    def get_trace(self) -> list[dict]:
        return list(self._trace)

    def priority_order(self) -> list[T]:
        ordered = sorted(self._heap, key=lambda e: e.key())
        return [entry.item for entry in ordered]

    def get_tree_nodes(self) -> list[dict]:
        nodes: list[dict] = []
        for i, entry in enumerate(self._heap):
            nodes.append(
                {
                    "index": i,
                    "priority": entry.priority,
                    "sequence": entry.sequence,
                    "parent": self._parent(i) if i > 0 else None,
                    "left": self._left(i) if self._left(i) < len(self._heap) else None,
                    "right": self._right(i) if self._right(i) < len(self._heap) else None,
                    "item": entry.item,
                }
            )
        return nodes

    def snapshot(self) -> dict:
        root = self.peek_entry()
        return {
            "type": "min_heap",
            "capacity": self._capacity,
            "size": len(self._heap),
            "is_empty": self.is_empty(),
            "is_full": self.is_full(),
            "nodes": self.get_tree_nodes(),
            "highest_priority": root.item if root else None,
            "priority_order": self.priority_order(),
            "counters": {
                "insert": self.insertion_count,
                "extract": self.extraction_count,
                "overflow": self.overflow_count,
                "swaps": self.swap_count,
            },
            "trace": self.get_trace(),
            "complexity": {"insert": "O(log n)", "extract_min": "O(log n)", "peek": "O(1)"},
        }
