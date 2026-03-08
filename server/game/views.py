from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .consumers import GameConsumer
from .models import Game, PlayerState, PropertyState


class GameStateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        game = Game.objects.order_by("id").first()
        if game is None:
            game = Game.objects.create()

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

        players = PlayerState.objects.select_related("user").filter(
            game=game,
        ).order_by("seat_index")
        occupied = list(players.values_list("seat_index", flat=True))
        if occupied and game.turn_seat_index not in occupied:
            game.turn_seat_index = occupied[0]
            game.state_version += 1
            game.save(update_fields=["turn_seat_index", "state_version", "updated_at"])
        properties = PropertyState.objects.filter(game=game).order_by("tile_index")
        return Response(
            {
                "game": game.to_dict(),
                "players": [
                    p.to_dict(is_connected=GameConsumer._is_user_connected(p.user_id))
                    for p in players
                ],
                "properties": [p.to_dict() for p in properties],
                "you": {"seat_index": player.seat_index},
            }
        )
