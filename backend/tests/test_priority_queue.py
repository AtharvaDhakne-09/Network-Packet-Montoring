import pytest

from app.data_structures.priority_queue import MinHeapPriorityQueue


class Item:
    def __init__(self, name, priority):
        self.name = name
        self.priority = priority

    def __repr__(self):
        return f"Item({self.name},{self.priority})"


def key_of(item):
    return item.priority


def test_capacity_validation():
    with pytest.raises(ValueError):
        MinHeapPriorityQueue(0)


def test_insert_and_extract_ordering():
    heap = MinHeapPriorityQueue(10, priority_of=key_of)
    for name, priority in [("a", 3), ("b", 1), ("c", 4), ("d", 2), ("e", 1)]:
        assert heap.insert(Item(name, priority)) is True
    assert heap.peek().priority == 1
    order = [heap.extract_min().name for _ in range(5)]
    assert order == ["b", "e", "d", "a", "c"]
    assert heap.is_empty()
    assert heap.extract_min() is None


def test_equal_priority_is_fifo():
    heap = MinHeapPriorityQueue(10, priority_of=key_of)
    for name in ["first", "second", "third"]:
        heap.insert(Item(name, 2))
    assert [heap.extract_min().name for _ in range(3)] == ["first", "second", "third"]


def test_overflow_is_drop_tail():
    heap = MinHeapPriorityQueue(2, priority_of=key_of)
    assert heap.insert(Item("a", 3)) is True
    assert heap.insert(Item("b", 3)) is True
    assert heap.insert(Item("c", 1)) is False
    assert heap.overflow_count == 1
    assert heap.get_size() == 2
    assert heap.peek().name == "a"


def test_heap_property_maintained():
    heap = MinHeapPriorityQueue(50, priority_of=key_of)
    priorities = [5, 3, 8, 1, 9, 2, 7, 4, 6, 0]
    for index, priority in enumerate(priorities):
        heap.insert(Item(str(index), priority))
    nodes = heap.get_tree_nodes()
    for node in nodes:
        if node["left"] is not None:
            assert node["priority"] <= nodes[node["left"]]["priority"]
        if node["right"] is not None:
            assert node["priority"] <= nodes[node["right"]]["priority"]
    extracted = [heap.extract_min().priority for _ in range(len(priorities))]
    assert extracted == sorted(priorities)


def test_priority_order_and_snapshot():
    heap = MinHeapPriorityQueue(5, priority_of=key_of)
    heap.insert(Item("a", 3))
    heap.insert(Item("b", 1))
    heap.insert(Item("c", 2))
    snapshot = heap.snapshot()
    assert snapshot["capacity"] == 5
    assert snapshot["size"] == 3
    assert snapshot["highest_priority"].name == "b"
    assert [item.name for item in snapshot["priority_order"]] == ["b", "c", "a"]
    assert snapshot["complexity"]["insert"] == "O(log n)"


def test_clear_and_get_contents():
    heap = MinHeapPriorityQueue(4, priority_of=key_of)
    heap.insert(Item("a", 2))
    heap.insert(Item("b", 1))
    assert len(heap.get_contents()) == 2
    heap.clear()
    assert heap.is_empty()
    assert heap.get_size() == 0
