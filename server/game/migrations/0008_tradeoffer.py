from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("game", "0007_propertystate_estate_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="TradeOffer",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("tile_index", models.PositiveSmallIntegerField()),
                ("buyer_seat_index", models.PositiveSmallIntegerField()),
                ("seller_seat_index", models.PositiveSmallIntegerField()),
                ("offered_amount", models.PositiveIntegerField()),
                ("status", models.CharField(default="pending", max_length=16)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("game", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="trade_offers", to="game.game")),
            ],
        ),
        migrations.AddConstraint(
            model_name="tradeoffer",
            constraint=models.UniqueConstraint(condition=models.Q(("status", "pending")), fields=("game", "tile_index"), name="uniq_pending_trade_offer_per_property"),
        ),
    ]
