import random

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone

from .board_tiles import create_shuffled_deck, create_special_card_payload, get_property_economics, get_tile_definition, is_ownable_tile
from .models import Game, PlayerState, PropertyState


class GameConsumer(AsyncJsonWebsocketConsumer):
    group_name = "game"
    board_size = 40
    active_connections = {}

    async def _calculate_property_rent(self, game: Game, tile_index: int, owner_seat_index: int) -> int:
        tile = get_tile_definition(tile_index)

        if tile["kind"] == "railroad" or tile["kind"] == "special_property":
            owned_railroads = await PropertyState.objects.filter(
                game_id=game.id,
                owner_seat_index=owner_seat_index,
                tile_index__in=[5, 15, 25, 35],
            ).acount()
            return 25 * max(1, 2 ** max(0, owned_railroads - 1))

        if tile["kind"] == "utility":
            owned_utilities = await PropertyState.objects.filter(
                game_id=game.id,
                owner_seat_index=owner_seat_index,
                tile_index__in=[12, 28],
            ).acount()
            return 10 if owned_utilities >= 2 else 4

        economics = get_property_economics(tile_index)
        return int(economics["base_rent"])

    async def _draw_card_for_tile(self, game: Game, tile_index: int) -> tuple[str, dict, list[str], str]:
        tile = get_tile_definition(tile_index)
        card_kind = tile["kind"]
        if card_kind not in {"community_chest", "chance"}:
            raise ValueError(f"Tile {tile_index} does not use a card deck")

        deck_field = "community_chest_deck" if card_kind == "community_chest" else "chance_deck"
        deck = list(getattr(game, deck_field) or [])
        if not deck:
            deck = create_shuffled_deck(card_kind)

        card_id = deck[0]
        payload = create_special_card_payload(tile_index, card_id)
        return deck_field, payload, deck, card_id

    async def _move_player_to_tile(self, player: PlayerState, tile_index: int, *, collect_go: bool) -> None:
        normalized_target = tile_index % self.board_size
        if collect_go and normalized_target <= player.position_index:
            player.money += 200

        player.position_index = normalized_target
        await player.asave(update_fields=["position_index", "money"])

    async def _move_player_by_steps(self, player: PlayerState, steps: int, *, collect_go: bool) -> None:
        target_tile = player.position_index + steps
        normalized_target = target_tile % self.board_size
        if collect_go and target_tile >= self.board_size:
            player.money += 200
        if collect_go and target_tile < 0:
            player.money -= 200

        player.position_index = normalized_target
        await player.asave(update_fields=["position_index", "money"])

    async def _ensure_landing_resolution(self, game: Game, player: PlayerState) -> dict | None:
        landed_tile = player.position_index
        landed_tile_definition = get_tile_definition(landed_tile)

        if is_ownable_tile(landed_tile):
            prop = await self._ensure_property_exists(game_id=game.id, tile_index=landed_tile)
            if prop.owner_seat_index is None:
                player.pending_buy_tile_index = landed_tile
                await player.asave(update_fields=["pending_buy_tile_index"])
                return None

            if prop.owner_seat_index != player.seat_index:
                owner = await PlayerState.objects.filter(game_id=game.id, seat_index=prop.owner_seat_index).afirst()
                if owner is not None:
                    if landed_tile_definition["kind"] == "utility":
                        rent_multiplier = await self._calculate_property_rent(game, landed_tile, prop.owner_seat_index)
                        rent = (int(game.last_dice_1 or 0) + int(game.last_dice_2 or 0)) * rent_multiplier
                    else:
                        rent = await self._calculate_property_rent(game, landed_tile, prop.owner_seat_index)
                    if rent > 0:
                        player.money -= rent
                        owner.money += rent
                        await player.asave(update_fields=["money"])
                        await owner.asave(update_fields=["money"])
            return None

        if landed_tile_definition["kind"] in {"community_chest", "chance"}:
            deck_field, payload, deck, card_id = await self._draw_card_for_tile(game, landed_tile)
            setattr(game, deck_field, deck)
            await game.asave(update_fields=[deck_field])
            player.pending_event_tile_index = landed_tile
            player.pending_event_kind = landed_tile_definition["kind"]
            player.pending_event_card_id = card_id
            await player.asave(update_fields=["pending_event_tile_index", "pending_event_kind", "pending_event_card_id"])
            return payload

        if landed_tile_definition["kind"] == "tax":
            player.pending_event_tile_index = landed_tile
            player.pending_event_kind = landed_tile_definition["kind"]
            player.pending_event_card_id = None
            await player.asave(update_fields=["pending_event_tile_index", "pending_event_kind", "pending_event_card_id"])
            return create_special_card_payload(landed_tile)

        return None

    async def _resolve_special_railroad_or_utility(self, game: Game, player: PlayerState, action_kind: str) -> None:
        current_tile = player.position_index
        if action_kind == "move_to_next_utility":
            candidates = [12, 28]
        else:
            candidates = [5, 15, 25, 35]

        target_tile = next((tile for tile in candidates if tile > current_tile), candidates[0])
        await self._move_player_to_tile(player, target_tile, collect_go=True)

        prop = await self._ensure_property_exists(game_id=game.id, tile_index=target_tile)
        if prop.owner_seat_index is None:
            player.pending_buy_tile_index = target_tile
            await player.asave(update_fields=["pending_buy_tile_index"])
            return

        if prop.owner_seat_index == player.seat_index:
            return

        owner = await PlayerState.objects.filter(game_id=game.id, seat_index=prop.owner_seat_index).afirst()
        if owner is None:
            return

        if action_kind == "move_to_next_utility":
            rent_roll = random.randint(1, 6) + random.randint(1, 6)
            rent = rent_roll * 10
        else:
            rent = await self._calculate_property_rent(game, target_tile, prop.owner_seat_index) * 2

        if rent > 0:
            player.money -= rent
            owner.money += rent
            await player.asave(update_fields=["money"])
            await owner.asave(update_fields=["money"])

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
        elif msg_type == "resolve_board_event":
            await self._handle_resolve_board_event()

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
        economics = get_property_economics(tile_index)
        if existing is not None:
            fields_to_update: list[str] = []
            if int(existing.purchase_price) != int(economics["purchase_price"]):
                existing.purchase_price = economics["purchase_price"]
                fields_to_update.append("purchase_price")
            if int(existing.base_rent) != int(economics["base_rent"]):
                existing.base_rent = economics["base_rent"]
                fields_to_update.append("base_rent")
            if fields_to_update:
                await existing.asave(update_fields=fields_to_update)
            return existing

        return await PropertyState.objects.acreate(
            game_id=game_id,
            tile_index=tile_index,
            purchase_price=economics["purchase_price"],
            base_rent=economics["base_rent"],
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

        if player.pending_event_tile_index is not None and player.pending_event_kind:
            await self.send_json({"type": "error", "message": "Resolve the board event first"})
            return

        player.pending_buy_tile_index = None
        player.pending_event_tile_index = None
        player.pending_event_kind = None
        player.pending_event_card_id = None
        await player.asave(update_fields=["pending_buy_tile_index", "pending_event_tile_index", "pending_event_kind", "pending_event_card_id"])

        d1 = random.randint(1, 6)
        d2 = random.randint(1, 6)
        steps = d1 + d2

        game.last_dice_1 = d1
        game.last_dice_2 = d2
        game.last_roll_at = timezone.now()
        game.state_version += 1
        await game.asave(update_fields=["last_dice_1", "last_dice_2", "last_roll_at", "state_version"])

        await self._move_player_by_steps(player, steps, collect_go=True)
        board_event_payload = await self._ensure_landing_resolution(game, player)
        if board_event_payload is not None:
            await self.send_json(board_event_payload)

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

    async def _handle_resolve_board_event(self):
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

        tile_index = player.pending_event_tile_index
        event_kind = player.pending_event_kind
        card_id = player.pending_event_card_id
        if tile_index is None or not event_kind:
            await self.send_json({"type": "error", "message": "No board event to resolve"})
            return

        payload = create_special_card_payload(tile_index, card_id)
        action = payload["action"]
        action_kind = action["kind"]
        action_value = action.get("value") or 0
        follow_up_payload = None

        if action_kind == "money_delta":
            player.money += int(action_value)
            await player.asave(update_fields=["money"])
        elif action_kind == "move_relative":
            await self._move_player_by_steps(player, int(action_value), collect_go=False)
            follow_up_payload = await self._ensure_landing_resolution(game, player)
            if follow_up_payload is not None:
                await self.send_json(follow_up_payload)
        elif action_kind == "move_absolute":
            await self._move_player_to_tile(player, int(action.get("target_tile_index") or 0), collect_go=True)
            follow_up_payload = await self._ensure_landing_resolution(game, player)
            if follow_up_payload is not None:
                await self.send_json(follow_up_payload)
        elif action_kind == "money_from_each_player":
            other_players = [p for p in await PlayerState.list_for_game_async(game_id=game.id) if p.id != player.id]
            total = 0
            for other in other_players:
                payment = int(action_value)
                other.money -= payment
                total += payment
                await other.asave(update_fields=["money"])
            player.money += total
            await player.asave(update_fields=["money"])
        elif action_kind == "money_to_each_player":
            other_players = [p for p in await PlayerState.list_for_game_async(game_id=game.id) if p.id != player.id]
            total = 0
            for other in other_players:
                payment = int(action_value)
                other.money += payment
                total += payment
                await other.asave(update_fields=["money"])
            player.money -= total
            await player.asave(update_fields=["money"])
        elif action_kind in {"move_to_next_utility", "move_to_next_railroad"}:
            await self._resolve_special_railroad_or_utility(game, player, action_kind)
        elif action_kind == "jail_free":
            if event_kind == "chance":
                player.chance_jail_free_cards += 1
                await player.asave(update_fields=["chance_jail_free_cards"])
            elif event_kind == "community_chest":
                player.community_chest_jail_free_cards += 1
                await player.asave(update_fields=["community_chest_jail_free_cards"])
        elif action_kind == "repair_cost":
            player.money -= int(action_value)
            await player.asave(update_fields=["money"])
        elif action_kind == "go_to_jail":
            player.position_index = 10
            player.in_jail = True
            player.jail_turns_left = 3
            await player.asave(update_fields=["position_index", "in_jail", "jail_turns_left"])

        if event_kind in {"community_chest", "chance"} and card_id:
            deck_field = "community_chest_deck" if event_kind == "community_chest" else "chance_deck"
            deck = list(getattr(game, deck_field) or [])
            if card_id in deck:
                deck.remove(card_id)
            if action_kind != "jail_free":
                deck.append(card_id)
            setattr(game, deck_field, deck)
            await game.asave(update_fields=[deck_field])

        if follow_up_payload is None:
            player.pending_event_tile_index = None
            player.pending_event_kind = None
            player.pending_event_card_id = None
            await player.asave(update_fields=["pending_event_tile_index", "pending_event_kind", "pending_event_card_id"])

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
            player.pending_event_tile_index = None
            player.pending_event_kind = None
            player.pending_event_card_id = None
            player.in_jail = False
            player.jail_turns_left = 0
            player.chance_jail_free_cards = 0
            player.community_chest_jail_free_cards = 0
            await player.asave(
                update_fields=[
                    "money",
                    "position_index",
                    "pending_buy_tile_index",
                    "pending_event_tile_index",
                    "pending_event_kind",
                    "pending_event_card_id",
                    "in_jail",
                    "jail_turns_left",
                    "chance_jail_free_cards",
                    "community_chest_jail_free_cards",
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
        game.chance_deck = []
        game.community_chest_deck = []
        game.state_version += 1
        await game.asave(
            update_fields=[
                "turn_seat_index",
                "last_dice_1",
                "last_dice_2",
                "last_roll_at",
                "chance_deck",
                "community_chest_deck",
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

        if player.pending_event_tile_index is not None and player.pending_event_kind:
            await self.send_json({"type": "error", "message": "Resolve the board event first"})
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
