from __future__ import annotations

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.authentication import JWTAuthentication


@database_sync_to_async
def _get_user_for_token(token: str):
    jwt_auth = JWTAuthentication()
    validated = jwt_auth.get_validated_token(token)
    return jwt_auth.get_user(validated)


class JwtAuthMiddleware:
    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        scope["user"] = scope.get("user") or AnonymousUser()

        qs = parse_qs(scope.get("query_string", b"").decode())
        token = None

        if "token" in qs and qs["token"]:
            token = qs["token"][0]

        if token:
            try:
                scope["user"] = await _get_user_for_token(token)
            except Exception:
                scope["user"] = AnonymousUser()

        return await self.inner(scope, receive, send)


def JwtAuthMiddlewareStack(inner):
    return JwtAuthMiddleware(inner)
