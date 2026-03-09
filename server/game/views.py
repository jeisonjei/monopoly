from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Game, PlayerState, PropertyState


class GameStateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        game = Game.objects.order_by("id").first()
        if game is None:
            game = Game.objects.create()

        inactive_players = list(
            PlayerState.objects.filter(game=game, connection_count=0).exclude(user=request.user)
        )
        if inactive_players:
            inactive_seats = [player.seat_index for player in inactive_players]
            PropertyState.objects.filter(game=game, owner_seat_index__in=inactive_seats).update(owner_seat_index=None, level=0, is_mortgaged=False)
            PlayerState.objects.filter(id__in=[player.id for player in inactive_players]).delete()

        player = PlayerState.objects.filter(game=game, user=request.user).first()
        if player is None:
            taken = set(PlayerState.objects.filter(game=game).values_list("seat_index", flat=True))
            seat = None
            for i in range(6):
                if i not in taken:
                    seat = i
                    break

            if seat is None:
                return Response({"detail": "Game is full"}, status=409)

            player = PlayerState.objects.create(game=game, user=request.user, seat_index=seat)

        all_players = PlayerState.objects.select_related("user").filter(
            game=game,
        ).order_by("seat_index")
        occupied = list(all_players.filter(is_bankrupt=False).values_list("seat_index", flat=True))
        if occupied and game.turn_seat_index not in occupied:
            game.turn_seat_index = occupied[0]
            game.state_version += 1
            game.save(update_fields=["turn_seat_index", "state_version", "updated_at"])
        visible_player_ids = set(
            PlayerState.objects.filter(game=game, connection_count__gt=0).values_list("id", flat=True)
        )
        visible_player_ids.add(player.id)
        players = [p for p in all_players if p.id in visible_player_ids]
        properties = PropertyState.objects.filter(game=game).order_by("tile_index")
        return Response(
            {
                "game": game.to_dict(),
                "players": [p.to_dict() for p in players],
                "properties": [p.to_dict() for p in properties],
                "you": {"seat_index": player.seat_index},
            }
        )
