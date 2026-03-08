# Filter Players by Logged-In State

Only players who are actively connected via WebSocket should appear in the game's player list.

## Root Cause

`PlayerState` rows persist in the DB for every user who has ever visited the game page — `views.py` creates a seat for any authenticated user on REST GET. These rows have `connection_count = 0` when that user is not connected via WS.

Two problems:

1. **REST endpoint** (`views.py`) returns **all** `PlayerState` rows for the game, regardless of `connection_count`. A single logged-in user sees all 6 registered accounts.
2. **WS broadcasts** (`consumers.py`) call `PlayerState.list_for_game_async()` which also returns every row — the `players_updated` event sent to all clients includes disconnected players too.

`is_connected` is already derived correctly from `connection_count > 0` in `to_dict()`, and `visiblePlayers()` was simplified in a previous session to show all players with no filter — so there is **no frontend filter left** to hide the disconnected ones.

## Fix

### `models.py`
- Add `list_connected_for_game_async(game_id)` — same as `list_for_game_async` but with `.filter(connection_count__gt=0)`.

### `views.py`
- Filter the players queryset to `connection_count__gt=0`, **but always include the current user's own row** (they haven't opened WS yet at REST time, so their `connection_count` is still 0).

### `consumers.py`
- Replace `list_for_game_async` with `list_connected_for_game_async` in all paths that feed `players_updated` broadcasts: `connect`, `disconnect`, roll dice, end turn, buy property, reset game, resolve board event.
- Keep `list_for_game_async` in internal logic: turn normalization (`_normalize_turn`, `_get_next_occupied_seat`) and `money_from/to_each_player` — those need the full roster.

### `game.page.ts`
- No change needed. `visiblePlayers()` will naturally reflect only connected players because the backend now only sends them.

## Affected files
| File | Change |
|---|---|
| `server/game/models.py` | Add `list_connected_for_game_async` |
| `server/game/views.py` | Filter players to `connection_count__gt=0`, always include requesting user |
| `server/game/consumers.py` | Use `list_connected_for_game_async` in all broadcast-facing calls |
