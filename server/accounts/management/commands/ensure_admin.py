from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Ensure default admin account exists"

    def handle(self, *args, **options):
        User = get_user_model()

        username = "admin"
        password = "admin"
        email = "admin@local.dev"

        user, created = User.objects.get_or_create(username=username, defaults={"email": email})
        if not user.is_staff:
            user.is_staff = True
        if not user.is_superuser:
            user.is_superuser = True
        if user.email != email:
            user.email = email

        user.set_password(password)
        user.save()

        if created:
            self.stdout.write(self.style.SUCCESS("Created default admin user: admin/admin"))
        else:
            self.stdout.write(self.style.SUCCESS("Updated default admin user: admin/admin"))
