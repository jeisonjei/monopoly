from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Ensure default demo user accounts exist"

    def handle(self, *args, **options):
        User = get_user_model()

        for username in ("user1", "user2"):
            password = username
            email = f"{username}@local.dev"

            user, created = User.objects.get_or_create(username=username, defaults={"email": email})
            if user.is_staff:
                user.is_staff = False
            if user.is_superuser:
                user.is_superuser = False
            if user.email != email:
                user.email = email

            user.set_password(password)
            user.save()

            if created:
                self.stdout.write(self.style.SUCCESS(f"Created default demo user: {username}/{password}"))
            else:
                self.stdout.write(self.style.SUCCESS(f"Updated default demo user: {username}/{password}"))
