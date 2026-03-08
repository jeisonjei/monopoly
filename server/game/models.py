from asgiref.sync import sync_to_async
from django.conf import settings
from django.db import models, transaction
from django.db.models import F
from django.utils import timezone


class Game(models.Model):
    status = models.CharField(max_length=32, default="lobby")
    turn_seat_index = models.PositiveSmallIntegerField(default=0)
    state_version = models.PositiveIntegerField(default=0)
    last_dice_1 = models.PositiveSmallIntegerField(null=True, blank=True)
    last_dice_2 = models.PositiveSmallIntegerField(null=True, blank=True)
    last_roll_at = models.DateTimeField(null=True, blank=True)
    chance_deck = models.JSONField(default=list)
    community_chest_deck = models.JSONField(default=list)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    def to_dict(self):
        return {
            "id": self.id,
            "status": self.status,
            "turn_seat_index": self.turn_seat_index,
            "state_version": self.state_version,
            "last_dice_1": self.last_dice_1,
            "last_dice_2": self.last_dice_2,
            "last_roll_at": self.last_roll_at.isoformat() if self.last_roll_at else None,
            "chance_deck": self.chance_deck,
            "community_chest_deck": self.community_chest_deck,
        }

    @classmethod
    async def get_singleton_async(cls):
        game = await cls.objects.order_by("id").afirst()
        if game is not None:
            return game

        @sync_to_async
        def _create():
            existing = cls.objects.order_by("id").first()
            if existing is not None:
                return existing
            return cls.objects.create()

        return await _create()


class PlayerState(models.Model):
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="players")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    seat_index = models.PositiveSmallIntegerField()
    connection_count = models.PositiveSmallIntegerField(default=0)
    money = models.IntegerField(default=1500)
    position_index = models.PositiveSmallIntegerField(default=0)
    pending_buy_tile_index = models.PositiveSmallIntegerField(null=True, blank=True)
    pending_event_tile_index = models.PositiveSmallIntegerField(null=True, blank=True)
    pending_event_kind = models.CharField(max_length=32, null=True, blank=True)
    pending_event_card_id = models.CharField(max_length=64, null=True, blank=True)
    in_jail = models.BooleanField(default=False)
    jail_turns_left = models.PositiveSmallIntegerField(default=0)
    chance_jail_free_cards = models.PositiveSmallIntegerField(default=0)
    community_chest_jail_free_cards = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["game", "seat_index"], name="uniq_game_seat"),
            models.UniqueConstraint(fields=["game", "user"], name="uniq_game_user"),
        ]

    def to_dict(self, *, is_connected: bool | None = None):
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "username": self.user.username,
            "seat_index": self.seat_index,
            "is_connected": bool(self.connection_count),
            "money": self.money,
            "position_index": self.position_index,
            "pending_buy_tile_index": self.pending_buy_tile_index,
            "pending_event_tile_index": self.pending_event_tile_index,
            "pending_event_kind": self.pending_event_kind,
            "pending_event_card_id": self.pending_event_card_id,
            "in_jail": self.in_jail,
            "jail_turns_left": self.jail_turns_left,
            "chance_jail_free_cards": self.chance_jail_free_cards,
            "community_chest_jail_free_cards": self.community_chest_jail_free_cards,
        }

        if is_connected is not None:
            data["is_connected"] = is_connected

        return data

    @classmethod
    async def get_for_user_async(cls, game_id: int, user_id: int):
        return await cls.objects.filter(game_id=game_id, user_id=user_id).afirst()

    @classmethod
    async def list_for_game_async(cls, game_id: int):
        return [
            p
            async for p in cls.objects.select_related("user")
            .filter(game_id=game_id)
            .order_by("seat_index")
            .aiterator()
        ]

    @classmethod
    async def list_connected_for_game_async(cls, game_id: int):
        return [
            p
            async for p in cls.objects.select_related("user")
            .filter(game_id=game_id, connection_count__gt=0)
            .order_by("seat_index")
            .aiterator()
        ]

    @classmethod
    async def get_or_create_for_user_async(cls, game_id: int, user_id: int):
        existing = await cls.get_for_user_async(game_id=game_id, user_id=user_id)
        if existing is not None:
            return existing

        @sync_to_async
        def _create_seat():
            with transaction.atomic():
                if cls.objects.filter(game_id=game_id, user_id=user_id).exists():
                    return cls.objects.get(game_id=game_id, user_id=user_id)

                taken = set(
                    cls.objects.filter(game_id=game_id).values_list("seat_index", flat=True)
                )
                for seat in range(6):
                    if seat not in taken:
                        return cls.objects.create(game_id=game_id, user_id=user_id, seat_index=seat)
                return None

        return await _create_seat()

    @classmethod
    async def mark_connected_async(cls, game_id: int, user_id: int):
        await cls.objects.filter(game_id=game_id, user_id=user_id).aupdate(connection_count=F("connection_count") + 1)

    @classmethod
    async def mark_disconnected_async(cls, game_id: int, user_id: int):
        @sync_to_async
        def _decrement():
            player = cls.objects.filter(game_id=game_id, user_id=user_id).first()
            if player is None:
                return
            player.connection_count = max(0, int(player.connection_count) - 1)
            player.save(update_fields=["connection_count", "updated_at"])

        await _decrement()

    @classmethod
    async def cleanup_inactive_for_game_async(cls, game_id: int, *, keep_user_id: int | None = None):
        @sync_to_async
        def _cleanup():
            with transaction.atomic():
                inactive_players = list(
                    cls.objects.filter(game_id=game_id, connection_count=0).exclude(user_id=keep_user_id)
                )
                if not inactive_players:
                    return

                inactive_seats = [player.seat_index for player in inactive_players]
                PropertyState.objects.filter(game_id=game_id, owner_seat_index__in=inactive_seats).update(owner_seat_index=None)
                cls.objects.filter(id__in=[player.id for player in inactive_players]).delete()

        await _cleanup()


class PropertyState(models.Model):
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="properties")
    tile_index = models.PositiveSmallIntegerField()
    owner_seat_index = models.PositiveSmallIntegerField(null=True, blank=True)
    purchase_price = models.PositiveIntegerField(default=100)
    base_rent = models.PositiveIntegerField(default=10)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["game", "tile_index"], name="uniq_game_tile"),
        ]

    def to_dict(self):
        return {
            "id": self.id,
            "tile_index": self.tile_index,
            "owner_seat_index": self.owner_seat_index,
            "purchase_price": self.purchase_price,
            "base_rent": self.base_rent,
        }
