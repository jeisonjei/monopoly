import random
import math

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone

from .board_tiles import create_shuffled_deck, create_special_card_payload, get_color_group, get_color_group_tiles, get_property_economics, get_street_estate, get_street_rent, get_tile_definition, is_ownable_tile, is_upgradable_street
from .models import Game, PlayerState, PropertyState


class GameConsumer(AsyncJsonWebsocketConsumer):
    group_name = "game"
    board_size = 40

    async def _owner_has_full_color_set(self, game_id: int, owner_seat_index: int, tile_index: int) -> bool:
        color_group = get_color_group(tile_index)
        if not color_group:
            return False

        required_tiles = get_color_group_tiles(color_group)
        owned_group_tiles = await PropertyState.objects.filter(
            game_id=game_id,
            owner_seat_index=owner_seat_index,
            tile_index__in=required_tiles,
        ).acount()
        return owned_group_tiles == len(required_tiles)

    async def _calculate_property_rent(self, game: Game, tile_index: int, owner_seat_index: int) -> int:
        tile = get_tile_definition(tile_index)
        prop = await PropertyState.objects.filter(game_id=game.id, tile_index=tile_index).afirst()
        if prop is not None and prop.is_mortgaged:
            return 0

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
        base_rent = int(economics["base_rent"])
        if tile["kind"] != "property" or not is_upgradable_street(tile_index):
            return base_rent

        has_full_color_set = await self._owner_has_full_color_set(game.id, owner_seat_index, tile_index)
        level = int(prop.level) if prop is not None else 0
        return get_street_rent(tile_index, level, has_full_color_set=has_full_color_set)

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

            if prop.owner_seat_index == player.seat_index:
                can_upgrade = (
                    landed_tile_definition["kind"] == "property"
                    and is_upgradable_street(landed_tile)
                    and not prop.is_mortgaged
                    and int(prop.level) < 5
                    and await self._owner_has_full_color_set(game.id, player.seat_index, landed_tile)
                )
                player.pending_buy_tile_index = landed_tile if can_upgrade else None
                await player.asave(update_fields=["pending_buy_tile_index"])
                return None

            owner = await PlayerState.objects.filter(game_id=game.id, seat_index=prop.owner_seat_index).afirst()
            if owner is not None and owner.connection_count > 0:
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

        if landed_tile_definition["kind"] == "go_to_jail":
            await self._send_to_jail(player)
            return None

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
        if owner is None or owner.connection_count == 0:
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

    async def _active_turn_seats(self, game_id: int) -> list[int]:
        players = await PlayerState.list_for_game_async(game_id=game_id)
        occupied = [p.seat_index for p in players if p.connection_count > 0 and not p.is_bankrupt]
        if not occupied:
            occupied = [p.seat_index for p in players if not p.is_bankrupt]
        return sorted(occupied)

    async def _broadcast_game(self, game: Game) -> None:
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "game_updated",
                "game": game.to_dict(),
                "state_version": game.state_version,
            },
        )

    async def _broadcast_turn(self, game: Game) -> None:
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "turn_changed",
                "turn_seat_index": game.turn_seat_index,
                "state_version": game.state_version,
            },
        )

    async def _broadcast_state(self, game: Game) -> None:
        players = await PlayerState.list_connected_for_game_async(game_id=game.id)
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "players_updated",
                "players": self._serialize_players(players),
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

        await self._broadcast_game(game)

    async def _send_to_jail(self, player: PlayerState) -> None:
        player.position_index = 10
        player.in_jail = True
        player.jail_turns_left = 3
        player.pending_buy_tile_index = None
        player.pending_event_tile_index = None
        player.pending_event_kind = None
        player.pending_event_card_id = None
        player.extra_turn_pending = False
        player.consecutive_doubles = 0
        await player.asave(
            update_fields=[
                "position_index",
                "in_jail",
                "jail_turns_left",
                "pending_buy_tile_index",
                "pending_event_tile_index",
                "pending_event_kind",
                "pending_event_card_id",
                "extra_turn_pending",
                "consecutive_doubles",
            ]
        )

    async def _evaluate_game_status(self, game: Game) -> None:
        players = await PlayerState.list_for_game_async(game_id=game.id)
        changed_player_ids: list[int] = []
        bankrupt_seats: list[int] = []

        for player in players:
            if player.is_bankrupt or player.money >= 0:
                continue

            player.is_bankrupt = True
            player.pending_buy_tile_index = None
            player.pending_event_tile_index = None
            player.pending_event_kind = None
            player.pending_event_card_id = None
            player.in_jail = False
            player.jail_turns_left = 0
            player.extra_turn_pending = False
            player.consecutive_doubles = 0
            bankrupt_seats.append(player.seat_index)
            changed_player_ids.append(player.id)
            await player.asave(
                update_fields=[
                    "is_bankrupt",
                    "pending_buy_tile_index",
                    "pending_event_tile_index",
                    "pending_event_kind",
                    "pending_event_card_id",
                    "in_jail",
                    "jail_turns_left",
                    "extra_turn_pending",
                    "consecutive_doubles",
                ]
            )

        if bankrupt_seats:
            await PropertyState.objects.filter(game_id=game.id, owner_seat_index__in=bankrupt_seats).aupdate(owner_seat_index=None, level=0, is_mortgaged=False)

        remaining_players = [player for player in await PlayerState.list_for_game_async(game_id=game.id) if not player.is_bankrupt]
        status_changed = False

        if len(remaining_players) == 1:
            if game.status != "finished" or game.winner_seat_index != remaining_players[0].seat_index:
                game.status = "finished"
                game.winner_seat_index = remaining_players[0].seat_index
                status_changed = True
        elif game.status == "finished" or game.winner_seat_index is not None:
            game.status = "active" if game.last_roll_at else "lobby"
            game.winner_seat_index = None
            status_changed = True

        if changed_player_ids:
            await self._normalize_turn(game.id)
            game = await Game.get_singleton_async()

        if status_changed:
            game.state_version += 1
            await game.asave(update_fields=["status", "winner_seat_index", "state_version"])

    async def connect(self):
        user = self.scope.get("user")
        if user is None or user.is_anonymous:
            await self.close(code=4401)
            return

        game = await Game.get_singleton_async()
        await PlayerState.cleanup_inactive_for_game_async(game_id=game.id, keep_user_id=user.id)

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        await self._ensure_player_seat()
        game = await Game.get_singleton_async()
        await PlayerState.mark_connected_async(game_id=game.id, user_id=user.id)
        await self._normalize_turn(game.id)
        game = await Game.get_singleton_async()
        await self._broadcast_state(game)
        await self._send_snapshot()

    async def disconnect(self, close_code):
        user = self.scope.get("user")
        if user is not None and not user.is_anonymous:
            game = await Game.get_singleton_async()
            await PlayerState.mark_disconnected_async(game_id=game.id, user_id=user.id)
            await PlayerState.cleanup_inactive_for_game_async(game_id=game.id)
            await self._normalize_turn(game.id)
            game = await Game.get_singleton_async()
            await self._broadcast_state(game)
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    @classmethod
    def _serialize_players(cls, players: list[PlayerState]) -> list[dict]:
        return [p.to_dict() for p in players]

    @staticmethod
    def _special_card_event(payload: dict, owner_seat_index: int, state_version: int) -> dict:
        return {
            "type": "special_card_drawn",
            "action": payload.get("action"),
            "actionButtonLabel": payload.get("actionButtonLabel"),
            "cardId": payload.get("cardId"),
            "cardKind": payload.get("cardKind"),
            "instruction": payload.get("instruction"),
            "owner_seat_index": owner_seat_index,
            "state_version": state_version,
            "tileIndex": payload.get("tileIndex"),
            "title": payload.get("title"),
        }

    async def receive_json(self, content, **kwargs):
        msg_type = content.get("type")
        if msg_type == "roll_dice":
            await self._handle_roll_dice()
        elif msg_type == "end_turn":
            await self._handle_end_turn()
        elif msg_type == "attempt_jail_roll":
            await self._handle_attempt_jail_roll()
        elif msg_type == "pay_jail_fine":
            await self._handle_pay_jail_fine()
        elif msg_type == "use_jail_free_card":
            await self._handle_use_jail_free_card()
        elif msg_type == "buy_property":
            await self._handle_buy_property()
        elif msg_type == "mortgage_property":
            await self._handle_mortgage_property(content)
        elif msg_type == "unmortgage_property":
            await self._handle_unmortgage_property(content)
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
        occupied = await self._active_turn_seats(game_id)
        if not occupied:
            return

        if game.turn_seat_index in occupied:
            return

        game.turn_seat_index = occupied[0]
        game.state_version += 1
        await game.asave(update_fields=["turn_seat_index", "state_version"])

    async def _get_next_occupied_seat(self, game_id: int, current_seat_index: int):
        occupied = await self._active_turn_seats(game_id)
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
        players = await PlayerState.list_connected_for_game_async(game_id=game.id)
        properties = [
            p async for p in PropertyState.objects.filter(game_id=game.id).order_by("tile_index").aiterator()
        ]
        await self.send_json(
            {
                "type": "state_snapshot",
                "game": game.to_dict(),
                "players": self._serialize_players(players),
                "properties": [p.to_dict() for p in properties],
            }
        )

    async def _send_dice_event(self, game: Game, player: PlayerState, d1: int, d2: int) -> None:
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

    async def _release_from_jail(self, player: PlayerState) -> None:
        player.in_jail = False
        player.jail_turns_left = 0
        await player.asave(update_fields=["in_jail", "jail_turns_left"])

    async def _advance_turn(self, game: Game) -> Game:
        game.turn_seat_index = await self._get_next_occupied_seat(game.id, game.turn_seat_index)
        game.state_version += 1
        await game.asave(update_fields=["turn_seat_index", "state_version"])
        return game

    async def _handle_post_action_updates(self, game: Game, *, broadcast_turn: bool = False) -> Game:
        await self._evaluate_game_status(game)
        game = await Game.get_singleton_async()
        await self._broadcast_state(game)
        await self._broadcast_turn(game)
        return game

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
            level=0,
            is_mortgaged=False,
        )

    def _building_purchase_cost(self, tile_index: int) -> int:
        return int(get_street_estate(tile_index)["building_cost"])

    def _mortgage_value(self, prop: PropertyState) -> int:
        if is_upgradable_street(prop.tile_index):
            return int(get_street_estate(prop.tile_index)["mortgage_value"])
        return int(prop.purchase_price // 2)

    def _unmortgage_cost(self, prop: PropertyState) -> int:
        mortgage_value = self._mortgage_value(prop)
        return int(math.ceil(mortgage_value * 1.1))

    async def _handle_roll_dice(self):
        user = self.scope["user"]
        game = await Game.get_singleton_async()
        await self._normalize_turn(game.id)
        game = await Game.get_singleton_async()
        player = await PlayerState.get_for_user_async(game_id=game.id, user_id=user.id)
        if player is None:
            return

        if player.is_bankrupt:
            await self.send_json({"type": "error", "message": "You are out of the game"})
            return

        if game.status == "finished":
            await self.send_json({"type": "error", "message": "Game is already finished"})
            return

        if game.turn_seat_index != player.seat_index:
            await self.send_json({"type": "error", "message": "Not your turn"})
            return

        if player.pending_event_tile_index is not None and player.pending_event_kind:
            await self.send_json({"type": "error", "message": "Resolve the board event first"})
            return

        if player.in_jail:
            await self.send_json({"type": "error", "message": "Choose a jail action first"})
            return

        if player.extra_turn_pending:
            player.extra_turn_pending = False
            await player.asave(update_fields=["extra_turn_pending"])

        player.pending_buy_tile_index = None
        player.pending_event_tile_index = None
        player.pending_event_kind = None
        player.pending_event_card_id = None
        await player.asave(update_fields=["pending_buy_tile_index", "pending_event_tile_index", "pending_event_kind", "pending_event_card_id"])

        d1 = random.randint(1, 6)
        d2 = random.randint(1, 6)
        steps = d1 + d2
        is_double = d1 == d2

        game.last_dice_1 = d1
        game.last_dice_2 = d2
        game.last_roll_at = timezone.now()
        if game.status == "lobby":
            game.status = "active"
        game.state_version += 1
        await game.asave(update_fields=["last_dice_1", "last_dice_2", "last_roll_at", "status", "state_version"])

        player.consecutive_doubles = player.consecutive_doubles + 1 if is_double else 0
        await player.asave(update_fields=["consecutive_doubles"])

        await self._send_dice_event(game, player, d1, d2)

        if player.consecutive_doubles >= 3:
            await self._send_to_jail(player)
            game = await self._advance_turn(game)
            await self._handle_post_action_updates(game, broadcast_turn=True)
            return

        await self._move_player_by_steps(player, steps, collect_go=True)
        board_event_payload = await self._ensure_landing_resolution(game, player)
        player = await PlayerState.get_for_user_async(game_id=game.id, user_id=user.id)
        if player is None:
            return

        player.extra_turn_pending = bool(is_double and not player.in_jail)
        if not is_double:
            player.consecutive_doubles = 0
        await player.asave(update_fields=["extra_turn_pending", "consecutive_doubles"])

        if board_event_payload is not None:
            await self.channel_layer.group_send(
                self.group_name,
                self._special_card_event(board_event_payload, player.seat_index, game.state_version),
            )

        await self._handle_post_action_updates(game)

    async def _handle_attempt_jail_roll(self):
        user = self.scope["user"]
        game = await Game.get_singleton_async()
        await self._normalize_turn(game.id)
        game = await Game.get_singleton_async()
        player = await PlayerState.get_for_user_async(game_id=game.id, user_id=user.id)
        if player is None:
            return

        if player.is_bankrupt:
            await self.send_json({"type": "error", "message": "You are out of the game"})
            return

        if game.status == "finished":
            await self.send_json({"type": "error", "message": "Game is already finished"})
            return

        if game.turn_seat_index != player.seat_index:
            await self.send_json({"type": "error", "message": "Not your turn"})
            return

        if not player.in_jail:
            await self.send_json({"type": "error", "message": "You are not in jail"})
            return

        if player.pending_event_tile_index is not None and player.pending_event_kind:
            await self.send_json({"type": "error", "message": "Resolve the board event first"})
            return

        d1 = random.randint(1, 6)
        d2 = random.randint(1, 6)
        steps = d1 + d2
        is_double = d1 == d2

        game.last_dice_1 = d1
        game.last_dice_2 = d2
        game.last_roll_at = timezone.now()
        game.state_version += 1
        await game.asave(update_fields=["last_dice_1", "last_dice_2", "last_roll_at", "state_version"])

        await self._send_dice_event(game, player, d1, d2)

        if is_double:
            await self._release_from_jail(player)
            await self._move_player_by_steps(player, steps, collect_go=True)
            payload = await self._ensure_landing_resolution(game, player)
            player = await PlayerState.get_for_user_async(game_id=game.id, user_id=user.id)
            if player is None:
                return
            player.extra_turn_pending = False
            player.consecutive_doubles = 0
            await player.asave(update_fields=["extra_turn_pending", "consecutive_doubles"])
            if payload is not None:
                await self.channel_layer.group_send(
                    self.group_name,
                    self._special_card_event(payload, player.seat_index, game.state_version),
                )
            await self._handle_post_action_updates(game)
            return

        player.jail_turns_left = max(0, int(player.jail_turns_left) - 1)
        if player.jail_turns_left == 0:
            player.money -= 50
            player.in_jail = False
            await player.asave(update_fields=["jail_turns_left", "money", "in_jail"])
            await self._move_player_by_steps(player, steps, collect_go=True)
            payload = await self._ensure_landing_resolution(game, player)
            if payload is not None:
                await self.channel_layer.group_send(
                    self.group_name,
                    self._special_card_event(payload, player.seat_index, game.state_version),
                )
            await self._handle_post_action_updates(game)
            return

        await player.asave(update_fields=["jail_turns_left"])
        game = await self._advance_turn(game)
        await self._handle_post_action_updates(game, broadcast_turn=True)

    async def _handle_pay_jail_fine(self):
        user = self.scope["user"]
        game = await Game.get_singleton_async()
        await self._normalize_turn(game.id)
        game = await Game.get_singleton_async()
        player = await PlayerState.get_for_user_async(game_id=game.id, user_id=user.id)
        if player is None:
            return

        if player.is_bankrupt:
            await self.send_json({"type": "error", "message": "You are out of the game"})
            return

        if game.turn_seat_index != player.seat_index:
            await self.send_json({"type": "error", "message": "Not your turn"})
            return

        if not player.in_jail:
            await self.send_json({"type": "error", "message": "You are not in jail"})
            return

        if player.money < 50:
            await self.send_json({"type": "error", "message": "Not enough money"})
            return

        player.money -= 50
        player.in_jail = False
        player.jail_turns_left = 0
        await player.asave(update_fields=["money", "in_jail", "jail_turns_left"])
        await self._handle_post_action_updates(game)

    async def _handle_use_jail_free_card(self):
        user = self.scope["user"]
        game = await Game.get_singleton_async()
        await self._normalize_turn(game.id)
        game = await Game.get_singleton_async()
        player = await PlayerState.get_for_user_async(game_id=game.id, user_id=user.id)
        if player is None:
            return

        if player.is_bankrupt:
            await self.send_json({"type": "error", "message": "You are out of the game"})
            return

        if game.turn_seat_index != player.seat_index:
            await self.send_json({"type": "error", "message": "Not your turn"})
            return

        if not player.in_jail:
            await self.send_json({"type": "error", "message": "You are not in jail"})
            return

        if player.chance_jail_free_cards > 0:
            player.chance_jail_free_cards -= 1
        elif player.community_chest_jail_free_cards > 0:
            player.community_chest_jail_free_cards -= 1
        else:
            await self.send_json({"type": "error", "message": "No get out of jail free card"})
            return

        player.in_jail = False
        player.jail_turns_left = 0
        await player.asave(update_fields=["chance_jail_free_cards", "community_chest_jail_free_cards", "in_jail", "jail_turns_left"])
        await self._handle_post_action_updates(game)

    async def _handle_resolve_board_event(self):
        user = self.scope["user"]
        game = await Game.get_singleton_async()
        await self._normalize_turn(game.id)
        game = await Game.get_singleton_async()
        player = await PlayerState.get_for_user_async(game_id=game.id, user_id=user.id)
        if player is None:
            return

        if player.is_bankrupt:
            await self.send_json({"type": "error", "message": "You are out of the game"})
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
                await self.channel_layer.group_send(
                    self.group_name,
                    self._special_card_event(follow_up_payload, player.seat_index, game.state_version),
                )
        elif action_kind == "move_absolute":
            await self._move_player_to_tile(player, int(action.get("target_tile_index") or 0), collect_go=True)
            follow_up_payload = await self._ensure_landing_resolution(game, player)
            if follow_up_payload is not None:
                await self.channel_layer.group_send(
                    self.group_name,
                    self._special_card_event(follow_up_payload, player.seat_index, game.state_version),
                )
        elif action_kind == "money_from_each_player":
            other_players = [p for p in await PlayerState.list_connected_for_game_async(game_id=game.id) if p.id != player.id]
            total = 0
            for other in other_players:
                payment = int(action_value)
                other.money -= payment
                total += payment
                await other.asave(update_fields=["money"])
            player.money += total
            await player.asave(update_fields=["money"])
        elif action_kind == "money_to_each_player":
            other_players = [p for p in await PlayerState.list_connected_for_game_async(game_id=game.id) if p.id != player.id]
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
            await self._send_to_jail(player)

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
        await self._handle_post_action_updates(game)

    async def _handle_buy_property(self):
        user = self.scope["user"]
        game = await Game.get_singleton_async()
        await self._normalize_turn(game.id)
        game = await Game.get_singleton_async()
        player = await PlayerState.get_for_user_async(game_id=game.id, user_id=user.id)
        if player is None:
            return

        if player.is_bankrupt:
            await self.send_json({"type": "error", "message": "You are out of the game"})
            return

        if game.status == "finished":
            await self.send_json({"type": "error", "message": "Game is already finished"})
            return

        if game.turn_seat_index != player.seat_index:
            await self.send_json({"type": "error", "message": "Not your turn"})
            return

        if player.pending_event_tile_index is not None and player.pending_event_kind:
            await self.send_json({"type": "error", "message": "Resolve the board event first"})
            return

        tile = player.pending_buy_tile_index
        if tile is None or tile != player.position_index:
            await self.send_json({"type": "error", "message": "Nothing to buy"})
            return

        prop = await self._ensure_property_exists(game_id=game.id, tile_index=tile)
        if prop.owner_seat_index is None:
            if player.money < prop.purchase_price:
                await self.send_json({"type": "error", "message": "Not enough money"})
                return

            prop.owner_seat_index = player.seat_index
            prop.level = 0
            prop.is_mortgaged = False
            await prop.asave(update_fields=["owner_seat_index", "level", "is_mortgaged"])
            player.money -= int(prop.purchase_price)
        else:
            if prop.owner_seat_index != player.seat_index:
                player.pending_buy_tile_index = None
                await player.asave(update_fields=["pending_buy_tile_index"])
                await self.send_json({"type": "error", "message": "Already owned"})
                return

            if get_tile_definition(tile)["kind"] != "property" or not is_upgradable_street(tile):
                await self.send_json({"type": "error", "message": "This property cannot be upgraded"})
                return

            if prop.is_mortgaged:
                await self.send_json({"type": "error", "message": "Mortgaged property cannot be upgraded"})
                return

            if int(prop.level) >= 5:
                await self.send_json({"type": "error", "message": "Property is already at maximum level"})
                return

            if not await self._owner_has_full_color_set(game.id, player.seat_index, tile):
                await self.send_json({"type": "error", "message": "You need the full color set first"})
                return

            upgrade_cost = self._building_purchase_cost(tile)
            if player.money < upgrade_cost:
                await self.send_json({"type": "error", "message": "Not enough money"})
                return

            prop.level = int(prop.level) + 1
            await prop.asave(update_fields=["level"])
            player.money -= upgrade_cost

        player.pending_buy_tile_index = None
        await player.asave(update_fields=["money", "pending_buy_tile_index"])

        game.state_version += 1
        await game.asave(update_fields=["state_version"])
        await self._handle_post_action_updates(game)

    async def _handle_mortgage_property(self, content: dict):
        user = self.scope["user"]
        game = await Game.get_singleton_async()
        await self._normalize_turn(game.id)
        game = await Game.get_singleton_async()
        player = await PlayerState.get_for_user_async(game_id=game.id, user_id=user.id)
        if player is None:
            return

        if player.is_bankrupt:
            await self.send_json({"type": "error", "message": "You are out of the game"})
            return

        if game.status == "finished":
            await self.send_json({"type": "error", "message": "Game is already finished"})
            return

        tile = content.get("tile_index")
        if tile is None:
            await self.send_json({"type": "error", "message": "Choose a property first"})
            return

        if game.turn_seat_index != player.seat_index:
            await self.send_json({"type": "error", "message": "Not your turn"})
            return

        if player.pending_event_tile_index is not None and player.pending_event_kind:
            await self.send_json({"type": "error", "message": "Resolve the board event first"})
            return

        prop = await self._ensure_property_exists(game_id=game.id, tile_index=int(tile))
        if prop.owner_seat_index != player.seat_index:
            await self.send_json({"type": "error", "message": "This property is not yours"})
            return

        if prop.is_mortgaged:
            await self.send_json({"type": "error", "message": "Property is already mortgaged"})
            return

        if int(prop.level) > 0:
            await self.send_json({"type": "error", "message": "Sell upgrades before mortgaging this property"})
            return

        prop.is_mortgaged = True
        await prop.asave(update_fields=["is_mortgaged"])
        player.money += self._mortgage_value(prop)
        await player.asave(update_fields=["money"])
        game.state_version += 1
        await game.asave(update_fields=["state_version"])
        await self._handle_post_action_updates(game)

    async def _handle_unmortgage_property(self, content: dict):
        user = self.scope["user"]
        game = await Game.get_singleton_async()
        await self._normalize_turn(game.id)
        game = await Game.get_singleton_async()
        player = await PlayerState.get_for_user_async(game_id=game.id, user_id=user.id)
        if player is None:
            return

        if player.is_bankrupt:
            await self.send_json({"type": "error", "message": "You are out of the game"})
            return

        if game.status == "finished":
            await self.send_json({"type": "error", "message": "Game is already finished"})
            return

        tile = content.get("tile_index")
        if tile is None:
            await self.send_json({"type": "error", "message": "Choose a property first"})
            return

        if game.turn_seat_index != player.seat_index:
            await self.send_json({"type": "error", "message": "Not your turn"})
            return

        if player.pending_event_tile_index is not None and player.pending_event_kind:
            await self.send_json({"type": "error", "message": "Resolve the board event first"})
            return

        prop = await self._ensure_property_exists(game_id=game.id, tile_index=int(tile))
        if prop.owner_seat_index != player.seat_index:
            await self.send_json({"type": "error", "message": "This property is not yours"})
            return

        if not prop.is_mortgaged:
            await self.send_json({"type": "error", "message": "Property is not mortgaged"})
            return

        unmortgage_cost = self._unmortgage_cost(prop)
        if player.money < unmortgage_cost:
            await self.send_json({"type": "error", "message": "Not enough money"})
            return

        prop.is_mortgaged = False
        await prop.asave(update_fields=["is_mortgaged"])
        player.money -= unmortgage_cost
        await player.asave(update_fields=["money"])
        game.state_version += 1
        await game.asave(update_fields=["state_version"])
        await self._handle_post_action_updates(game)

    async def _handle_claim_first_turn(self):
        user = self.scope["user"]
        game = await Game.get_singleton_async()
        player = await PlayerState.get_for_user_async(game_id=game.id, user_id=user.id)
        if player is None:
            return

        if player.is_bankrupt:
            await self.send_json({"type": "error", "message": "You are out of the game"})
            return

        if game.last_roll_at is not None:
            await self.send_json({"type": "error", "message": "Starting player is already locked in"})
            return

        game.turn_seat_index = player.seat_index
        game.state_version += 1
        await game.asave(update_fields=["turn_seat_index", "state_version"])
        await self._broadcast_turn(game)
        await self._broadcast_game(game)

    async def _handle_reset_game(self):
        game = await Game.get_singleton_async()
        players = await PlayerState.list_for_game_async(game_id=game.id)

        for player in players:
            player.is_bankrupt = False
            player.money = 1500
            player.position_index = 0
            player.pending_buy_tile_index = None
            player.pending_event_tile_index = None
            player.pending_event_kind = None
            player.pending_event_card_id = None
            player.in_jail = False
            player.jail_turns_left = 0
            player.extra_turn_pending = False
            player.consecutive_doubles = 0
            player.chance_jail_free_cards = 0
            player.community_chest_jail_free_cards = 0
            await player.asave(
                update_fields=[
                    "is_bankrupt",
                    "money",
                    "position_index",
                    "pending_buy_tile_index",
                    "pending_event_tile_index",
                    "pending_event_kind",
                    "pending_event_card_id",
                    "in_jail",
                    "jail_turns_left",
                    "extra_turn_pending",
                    "consecutive_doubles",
                    "chance_jail_free_cards",
                    "community_chest_jail_free_cards",
                ]
            )

        properties = [
            p async for p in PropertyState.objects.filter(game_id=game.id).order_by("tile_index").aiterator()
        ]
        for prop in properties:
            if prop.owner_seat_index is not None or prop.level != 0 or prop.is_mortgaged:
                prop.owner_seat_index = None
                prop.level = 0
                prop.is_mortgaged = False
                await prop.asave(update_fields=["owner_seat_index", "level", "is_mortgaged"])

        next_turn = await self._get_next_occupied_seat(game.id, -1)
        game.turn_seat_index = next_turn
        game.winner_seat_index = None
        game.status = "lobby"
        game.last_dice_1 = None
        game.last_dice_2 = None
        game.last_roll_at = None
        game.chance_deck = []
        game.community_chest_deck = []
        game.state_version += 1
        await game.asave(
            update_fields=[
                "status",
                "turn_seat_index",
                "winner_seat_index",
                "last_dice_1",
                "last_dice_2",
                "last_roll_at",
                "chance_deck",
                "community_chest_deck",
                "state_version",
            ]
        )
        await self._broadcast_state(game)
        await self._broadcast_turn(game)

    async def _handle_end_turn(self):
        user = self.scope["user"]
        game = await Game.get_singleton_async()
        await self._normalize_turn(game.id)
        game = await Game.get_singleton_async()
        player = await PlayerState.get_for_user_async(game_id=game.id, user_id=user.id)
        if player is None:
            return

        if player.is_bankrupt:
            await self.send_json({"type": "error", "message": "You are out of the game"})
            return

        if game.status == "finished":
            await self.send_json({"type": "error", "message": "Game is already finished"})
            return

        if game.turn_seat_index != player.seat_index:
            await self.send_json({"type": "error", "message": "Not your turn"})
            return

        if player.pending_event_tile_index is not None and player.pending_event_kind:
            await self.send_json({"type": "error", "message": "Resolve the board event first"})
            return

        if player.in_jail:
            await self.send_json({"type": "error", "message": "Choose a jail action first"})
            return

        if player.extra_turn_pending:
            await self.send_json({"type": "error", "message": "You rolled doubles and must roll again"})
            return

        player.consecutive_doubles = 0
        await player.asave(update_fields=["consecutive_doubles"])
        game = await self._advance_turn(game)
        await self._handle_post_action_updates(game, broadcast_turn=True)

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

    async def game_updated(self, event):
        await self.send_json(
            {
                "type": "game_updated",
                "game": event["game"],
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

    async def special_card_drawn(self, event):
        await self.send_json(
            {
                "type": "special_card_drawn",
                "action": event.get("action"),
                "actionButtonLabel": event.get("actionButtonLabel"),
                "cardId": event.get("cardId"),
                "cardKind": event.get("cardKind"),
                "instruction": event.get("instruction"),
                "owner_seat_index": event.get("owner_seat_index"),
                "state_version": event.get("state_version"),
                "tileIndex": event.get("tileIndex"),
                "title": event.get("title"),
            }
        )
