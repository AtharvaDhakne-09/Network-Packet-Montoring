import pytest

from app.data_structures.circular_queue import CircularQueue


def test_capacity_validation():
    with pytest.raises(ValueError):
        CircularQueue(0)
    with pytest.raises(ValueError):
        CircularQueue(-3)


def test_enqueue_dequeue_fifo_order():
    queue = CircularQueue(4)
    assert queue.is_empty()
    assert queue.get_size() == 0
    assert queue.get_capacity() == 4
    for i in range(4):
        assert queue.enqueue(i) is True
    assert queue.is_full()
    assert queue.get_size() == 4
    assert queue.get_contents() == [0, 1, 2, 3]
    assert queue.peek() == 0
    assert [queue.dequeue() for _ in range(4)] == [0, 1, 2, 3]
    assert queue.is_empty()
    assert queue.dequeue() is None
    assert queue.underflow_count == 1


def test_drop_tail_when_full_and_no_overwrite():
    queue = CircularQueue(3)
    queue.enqueue("a")
    queue.enqueue("b")
    queue.enqueue("c")
    assert queue.enqueue("d") is False
    assert queue.overflow_count == 1
    assert queue.get_contents() == ["a", "b", "c"]
    assert queue.dequeue() == "a"
    assert queue.enqueue("d") is True
    assert queue.get_contents() == ["b", "c", "d"]


def test_wraparound_indices():
    queue = CircularQueue(4)
    for i in range(4):
        queue.enqueue(i)
    for _ in range(3):
        queue.dequeue()
    assert queue._front == 3
    assert queue._rear == 0
    queue.enqueue(100)
    assert queue._rear == 1
    assert queue.wraparound_count >= 1
    assert queue.get_contents() == [3, 100]
    snapshot = queue.snapshot()
    assert snapshot["front"] == 3
    assert snapshot["rear"] == 1
    assert snapshot["size"] == 2
    assert snapshot["capacity"] == 4
    assert len(snapshot["buffer"]) == 4


def test_clear_resets_state():
    queue = CircularQueue(3)
    queue.enqueue(1)
    queue.enqueue(2)
    queue.clear()
    assert queue.is_empty()
    assert queue.get_size() == 0
    assert queue.get_contents() == []
    assert queue.peek() is None


def test_peek_does_not_remove():
    queue = CircularQueue(2)
    queue.enqueue("x")
    assert queue.peek() == "x"
    assert queue.get_size() == 1
    assert queue.dequeue() == "x"


def test_trace_records_operations():
    queue = CircularQueue(1)
    queue.enqueue("a")
    queue.enqueue("b")
    queue.dequeue()
    ops = [entry["op"] for entry in queue.get_trace()]
    assert ops == ["enqueue", "overflow", "dequeue"]
