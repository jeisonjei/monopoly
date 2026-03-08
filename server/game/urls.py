from django.urls import path

from .views import GameStateView


urlpatterns = [
    path("state/", GameStateView.as_view(), name="game_state"),
]
