from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("game", "0005_playerstate_connection_count"),
    ]

    operations = [
        migrations.AddField(
            model_name="game",
            name="winner_seat_index",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="playerstate",
            name="consecutive_doubles",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="playerstate",
            name="extra_turn_pending",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="playerstate",
            name="is_bankrupt",
            field=models.BooleanField(default=False),
        ),
    ]
