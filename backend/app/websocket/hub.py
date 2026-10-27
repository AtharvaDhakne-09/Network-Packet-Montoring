from __future__ import annotations

import asyncio
import time
from typing import Any, Callable


class WsSubscriber:
    def __init__(
        self,
        queue_size: int = 2000,
        batch_size: int = 50,
        batch_interval: float = 0.15,
        name: str = "client",
    ) -> None:
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=queue_size)
        self.batch_size = batch_size
        self.batch_interval = batch_interval
        self.name = name
        self.connected_at = time.time()
        self.packets_received = 0
        self.packets_sent = 0
        self.frames_sent = 0
        self.dropped_items = 0
        self.slow_client = False

    def offer(self, item: Any, drop_oldest: bool = False) -> bool:
        try:
            self.queue.put_nowait(item)
            self.packets_received += 1
            return True
        except asyncio.QueueFull:
            if drop_oldest:
                try:
                    self.queue.get_nowait()
                    self.queue.put_nowait(item)
                    self.packets_received += 1
                except Exception:
                    pass
            self.dropped_items += 1
            if self.dropped_items > 100:
                self.slow_client = True
            return False

    def stats(self) -> dict:
        return {
            "name": self.name,
            "connected_seconds": round(time.time() - self.connected_at, 1),
            "packets_received": self.packets_received,
            "packets_sent": self.packets_sent,
            "frames_sent": self.frames_sent,
            "dropped_items": self.dropped_items,
            "slow_client": self.slow_client,
            "queue_depth": self.queue.qsize(),
        }


async def stream_packets(
    send_frame: Callable[[dict], Any],
    subscriber: WsSubscriber,
    frame_builder: Callable[[list[Any]], dict],
) -> None:
    loop = asyncio.get_event_loop()
    while True:
        first = await subscriber.queue.get()
        batch = [first]
        deadline = loop.time() + subscriber.batch_interval
        while len(batch) < subscriber.batch_size:
            remaining = deadline - loop.time()
            if remaining <= 0:
                break
            try:
                item = await asyncio.wait_for(subscriber.queue.get(), remaining)
                batch.append(item)
            except asyncio.TimeoutError:
                break
        frame = frame_builder(batch)
        await send_frame(frame)
        subscriber.packets_sent += len(batch)
        subscriber.frames_sent += 1


async def stream_messages(
    send_frame: Callable[[dict], Any],
    subscriber: WsSubscriber,
) -> None:
    while True:
        item = await subscriber.queue.get()
        await send_frame(item)
        subscriber.frames_sent += 1


class CaptureHub:
    def __init__(self) -> None:
        self._subs: dict[str, set[WsSubscriber]] = {}

    def subscribe(self, session_id: str, subscriber: WsSubscriber) -> None:
        self._subs.setdefault(session_id, set()).add(subscriber)

    def unsubscribe(self, session_id: str, subscriber: WsSubscriber) -> None:
        group = self._subs.get(session_id)
        if group:
            group.discard(subscriber)
            if not group:
                self._subs.pop(session_id, None)

    def publish(self, session_id: str, packet: Any) -> int:
        delivered = 0
        for sub in list(self._subs.get(session_id, ())):
            if sub.offer(packet):
                delivered += 1
        return delivered

    def subscriber_count(self, session_id: str) -> int:
        return len(self._subs.get(session_id, ()))

    def all_subscribers(self) -> list[WsSubscriber]:
        result: list[WsSubscriber] = []
        for group in self._subs.values():
            result.extend(group)
        return result

    def stats(self) -> dict:
        subs = self.all_subscribers()
        return {
            "subscribers": len(subs),
            "streamed_packets": sum(s.packets_sent for s in subs),
            "dropped_to_clients": sum(s.dropped_items for s in subs),
            "slow_clients": sum(1 for s in subs if s.slow_client),
        }


class SimulationHub:
    def __init__(self) -> None:
        self._subs: dict[str, set[WsSubscriber]] = {}

    def subscribe(self, sim_id: str, subscriber: WsSubscriber) -> None:
        self._subs.setdefault(sim_id, set()).add(subscriber)

    def unsubscribe(self, sim_id: str, subscriber: WsSubscriber) -> None:
        group = self._subs.get(sim_id)
        if group:
            group.discard(subscriber)
            if not group:
                self._subs.pop(sim_id, None)

    def publish(self, sim_id: str, message: dict) -> None:
        for sub in list(self._subs.get(sim_id, ())):
            sub.offer(message, drop_oldest=True)

    def subscriber_count(self, sim_id: str) -> int:
        return len(self._subs.get(sim_id, ()))
