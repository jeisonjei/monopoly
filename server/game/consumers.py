import random

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone

from .models import Game, PlayerState, PropertyState


class GameConsumer(AsyncJsonWebsocketConsumer):
    group_name = "game"
    board_size = 40
    active_connections = {}

    property_tiles = {
        1,
        3,
        5,
        6,
        8,
        9,
        11,
        12,
        13,
        14,
        15,
        16,
        18,
        19,
        21,
        23,
        24,
        25,
        26,
        27,
        28,
        29,
        31,
        32,
        34,
        35,
        37,
        39,
    }

    async def connect(self):
        user = self.scope.get("user")
        if user is None or user.is_anonymous:
            await self.close(code=4401)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        await self._ensure_player_seat()
        self._mark_user_connected(user.id)
        game = await Game.get_singleton_async()
        await self._normalize_turn(game.id)
        await self._send_snapshot()

    async def disconnect(self, close_code):
        user = self.scope.get("user")
        if user is not None and not user.is_anonymous:
            self._mark_user_disconnected(user.id)
            game = await Game.get_singleton_async()
            await self._normalize_turn(game.id)
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    @classmethod
    def _mark_user_connected(cls, user_id: int):
        cls.active_connections[user_id] = cls.active_connections.get(user_id, 0) + 1

    @classmethod
    def _mark_user_disconnected(cls, user_id: int):
        current = cls.active_connections.get(user_id, 0)
        if current <= 1:
            cls.active_connections.pop(user_id, None)
            return
        cls.active_connections[user_id] = current - 1

    @classmethod
    def _is_user_connected(cls, user_id: int) -> bool:
        return cls.active_connections.get(user_id, 0) > 0

    async def receive_json(self, content, **kwargs):
        msg_type = content.get("type")
        if msg_type == "roll_dice":
            await self._handle_roll_dice()
        elif msg_type == "end_turn":
            await self._handle_end_turn()
        elif msg_type == "buy_property":
            await self._handle_buy_property()
        elif msg_type == "claim_first_turn":
            await self._handle_claim_first_turn()
        elif msg_type == "reset_game":
            await self._handle_reset_game()

    async def _ensure_player_seat(self):
        user = self.scope["user"]
        game = await Game.get_singleton_async()
        player = await PlayerState.get_or_create_for_user_async(game_id=game.id, user_id=user.id)
        if player is None:
            await self.send_json({"type": "error", "message": "Game is full"})
            return

        await self._normalize_turn(game.id)

    async def _normalize_turn(self, game_id: int):
        game = await Game.get_singleton_async()
        players = await PlayerState.list_for_game_async(game_id=game_id)
        occupied = [p.seat_index for p in players if self._is_user_connected(p.user_id)]
        if not occupied:
            occupied = [p.seat_index for p in players]
        if not occupied:
            return

        if game.turn_seat_index in occupied:
            return

        game.turn_seat_index = occupied[0]
        game.state_version += 1
        await game.asave(update_fields=["turn_seat_index", "state_version"])

    async def _get_next_occupied_seat(self, game_id: int, current_seat_index: int):
        players = await PlayerState.list_for_game_async(game_id=game_id)
        occupied = sorted(p.seat_index for p in players if self._is_user_connected(p.user_id))
        if not occupied:
            occupied = sorted(p.seat_index for p in players)
        if not occupied:
            return current_seat_index

        for seat in occupied:
            if seat > current_seat_index:
                return seat
        return occupied[0]

    async def _send_snapshot(self):
        game = await Game.get_singleton_async()
        await self._normalize_turn(game.id)
        game = await Game.get_singleton_async()
        players = await PlayerState.list_for_game_async(game_id=game.id)
        properties = [
            p async for p in PropertyState.objects.filter(game_id=game.id).order_by("tile_index").aiterator()
        ]
        await self.send_json(
            {
                "type": "state_snapshot",
                "game": game.to_dict(),
                "players": [p.to_dict() for p in players],
                "properties": [p.to_dict() for p in properties],
            }
        )

    async def _ensure_property_exists(self, game_id: int, tile_index: int) -> PropertyState:
        existing = await PropertyState.objects.filter(game_id=game_id, tile_index=tile_index).afirst()
        if existing is not None:
            return existing

        purchase_price = 100 + (tile_index % 10) * 10
        base_rent = max(10, purchase_price // 10)
        return await PropertyState.objects.acreate(
            game_id=game_id,
            tile_index=tile_index,
            purchase_price=purchase_price,
            base_rent=base_rent,
        )

    async def _handle_roll_dice(self):
        user = self.scope["user"]
        game = await Game.get_singleton_async()
        await self._normalize_turn(game.id)
        game = await Game.get_singleton_async()
        player = await PlayerState.get_for_user_async(game_id=game.id, user_id=user.id)
        if player is None:
            return

        if game.turn_seat_index != player.seat_index:
            await self.send_json({"type": "error", "message": "Not your turn"})
            return

        player.pending_buy_tile_index = None
        await player.asave(update_fields=["pending_buy_tile_index"])

        d1 = random.randint(1, 6)
        d2 = random.randint(1, 6)
        steps = d1 + d2

        game.last_dice_1 = d1
        game.last_dice_2 = d2
        game.last_roll_at = timezone.now()
        game.state_version += 1
        await game.asave(update_fields=["last_dice_1", "last_dice_2", "last_roll_at", "state_version"])

        player.position_index = (player.position_index + steps) % self.board_size
        await player.asave(update_fields=["position_index"])

        landed_tile = player.position_index
        if landed_tile in self.property_tiles:
            prop = await self._ensure_property_exists(game_id=game.id, tile_index=landed_tile)

            if prop.owner_seat_index is None:
                player.pending_buy_tile_index = landed_tile
                await player.asave(update_fields=["pending_buy_tile_index"])
            elif prop.owner_seat_index != player.seat_index:
                rent = int(prop.base_rent)
                payer = player
                owner = await PlayerState.objects.filter(game_id=game.id, seat_index=prop.owner_seat_index).afirst()
                if owner is not None and rent > 0:
                    payer.money -= rent
                    owner.money += rent
                    await payer.asave(update_fields=["money"])
                    await owner.asave(update_fields=["money"])

        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "dice_rolled",
                "seat_index": player.seat_index,
                "d1": d1,
                "d2": d2,
                "state_version": game.state_version,
            },
        )

        players = await PlayerState.list_for_game_async(game_id=game.id)
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "players_updated",
                "players": [p.to_dict() for p in players],
                "state_version": game.state_version,
            },
        )

        properties = [
            p async for p in PropertyState.objects.filter(game_id=game.id).order_by("tile_index").aiterator()
        ]
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "properties_updated",
                "properties": [p.to_dict() for p in properties],
                "state_version": game.state_version,
            },
        )

    async def _handle_buy_property(self):
        user = self.scope["user"]
        game = await Game.get_singleton_async()
        await self._normalize_turn(game.id)
        game = await Game.get_singleton_async()
        player = await PlayerState.get_for_user_async(game_id=game.id, user_id=user.id)
        if player is None:
            return

        if game.turn_seat_index != player.seat_index:
            await self.send_json({"type": "error", "message": "Not your turn"})
            return

        tile = player.pending_buy_tile_index
        if tile is None or tile != player.position_index:
            await self.send_json({"type": "error", "message": "Nothing to buy"})
            return

        prop = await self._ensure_property_exists(game_id=game.id, tile_index=tile)
        if prop.owner_seat_index is not None:
            player.pending_buy_tile_index = None
            await player.asave(update_fields=["pending_buy_tile_index"])
            await self.send_json({"type": "error", "message": "Already owned"})
            return

        if player.money < prop.purchase_price:
            await self.send_json({"type": "error", "message": "Not enough money"})
            return

        prop.owner_seat_index = player.seat_index
        await prop.asave(update_fields=["owner_seat_index"])

        player.money -= int(prop.purchase_price)
        player.pending_buy_tile_index = None
        await player.asave(update_fields=["money", "pending_buy_tile_index"])

        game.state_version += 1
        await game.asave(update_fields=["state_version"])

        players = await PlayerState.list_for_game_async(game_id=game.id)
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "players_updated",
                "players": [p.to_dict() for p in players],
                "state_version": game.state_version,
            },
        )

        properties = [
            p async for p in PropertyState.objects.filter(game_id=game.id).order_by("tile_index").aiterator()
        ]
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "properties_updated",
                "properties": [p.to_dict() for p in properties],
                "state_version": game.state_version,
            },
        )

    async def _handle_claim_first_turn(self):
        user = self.scope["user"]
        game = await Game.get_singleton_async()
        player = await PlayerState.get_for_user_async(game_id=game.id, user_id=user.id)
        if player is None:
            return

        if game.last_roll_at is not None:
            await self.send_json({"type": "error", "message": "Starting player is already locked in"})
            return

        game.turn_seat_index = player.seat_index
        game.state_version += 1
        await game.asave(update_fields=["turn_seat_index", "state_version"])

        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "turn_changed",
                "turn_seat_index": game.turn_seat_index,
                "state_version": game.state_version,
            },
        )

    async def _handle_reset_game(self):
        game = await Game.get_singleton_async()
        players = await PlayerState.list_for_game_async(game_id=game.id)

        for player in players:
            player.money = 1500
            player.position_index = 0
            player.pending_buy_tile_index = None
            player.in_jail = False
            player.jail_turns_left = 0
            await player.asave(
                update_fields=[
                    "money",
                    "position_index",
                    "pending_buy_tile_index",
                    "in_jail",
                    "jail_turns_left",
                ]
            )

        properties = [
            p async for p in PropertyState.objects.filter(game_id=game.id).order_by("tile_index").aiterator()
        ]
        for prop in properties:
            if prop.owner_seat_index is not None:
                prop.owner_seat_index = None
                await prop.asave(update_fields=["owner_seat_index"])

        next_turn = await self._get_next_occupied_seat(game.id, -1)
        game.turn_seat_index = next_turn
        game.last_dice_1 = None
        game.last_dice_2 = None
        game.last_roll_at = None
        game.state_version += 1
        await game.asave(
            update_fields=[
                "turn_seat_index",
                "last_dice_1",
                "last_dice_2",
                "last_roll_at",
                "state_version",
            ]
        )

        players = await PlayerState.list_for_game_async(game_id=game.id)
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "players_updated",
                "players": [p.to_dict() for p in players],
                "state_version": game.state_version,
            },
        )

        properties = [
            p async for p in PropertyState.objects.filter(game_id=game.id).order_by("tile_index").aiterator()
        ]
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "properties_updated",
                "properties": [p.to_dict() for p in properties],
                "state_version": game.state_version,
            },
        )

        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "turn_changed",
                "turn_seat_index": game.turn_seat_index,
                "state_version": game.state_version,
            },
        )

    async def _handle_end_turn(self):
        user = self.scope["user"]
        game = await Game.get_singleton_async()
        await self._normalize_turn(game.id)
        game = await Game.get_singleton_async()
        player = await PlayerState.get_for_user_async(game_id=game.id, user_id=user.id)
        if player is None:
            return

        if game.turn_seat_index != player.seat_index:
            await self.send_json({"type": "error", "message": "Not your turn"})
            return

        game.turn_seat_index = await self._get_next_occupied_seat(game.id, game.turn_seat_index)
        game.state_version += 1
        await game.asave(update_fields=["turn_seat_index", "state_version"])

        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "turn_changed",
                "turn_seat_index": game.turn_seat_index,
                "state_version": game.state_version,
            },
        )

    async def dice_rolled(self, event):
        await self.send_json(
            {
                "type": "dice_rolled",
                "seat_index": event["seat_index"],
                "d1": event["d1"],
                "d2": event["d2"],
                "state_version": event["state_version"],
            }
        )

    async def turn_changed(self, event):
        await self.send_json(
            {
                "type": "turn_changed",
                "turn_seat_index": event["turn_seat_index"],
                "state_version": event["state_version"],
            }
        )

    async def players_updated(self, event):
        await self.send_json(
            {
                "type": "players_updated",
                "players": event["players"],
                "state_version": event["state_version"],
            }
        )

    async def properties_updated(self, event):
        await self.send_json(
            {
                "type": "properties_updated",
                "properties": event["properties"],
                "state_version": event["state_version"],
            }
        )
