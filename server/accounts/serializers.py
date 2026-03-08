from django.db import IntegrityError
from django.contrib.auth import get_user_model
from rest_framework import serializers


User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        error_messages={
            "blank": "Password is required.",
            "required": "Password is required.",
        },
    )
    email = serializers.EmailField(
        error_messages={
            "blank": "Email is required.",
            "invalid": "Enter a valid email address.",
            "required": "Email is required.",
        }
    )
    username = serializers.CharField(
        error_messages={
            "blank": "Username is required.",
            "required": "Username is required.",
        }
    )

    class Meta:
        model = User
        fields = ("email", "username", "password")
        extra_kwargs = {
            "username": {"required": True},
            "email": {"required": True},
        }

    def validate_username(self, value):
        normalized_value = value.strip()
        if not normalized_value:
            raise serializers.ValidationError("Username is required.")
        if User.objects.filter(username__iexact=normalized_value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return normalized_value

    def validate_email(self, value):
        normalized_value = value.strip().lower()
        if User.objects.filter(email__iexact=normalized_value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return normalized_value

    def create(self, validated_data):
        try:
            user = User.objects.create_user(
                username=validated_data["username"],
                email=validated_data["email"],
                password=validated_data["password"],
            )
        except IntegrityError as exc:
            raise serializers.ValidationError(
                {"detail": "A user with this username or email already exists."}
            ) from exc
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(
        write_only=True,
        error_messages={
            "blank": "New password is required.",
            "required": "New password is required.",
        },
    )
