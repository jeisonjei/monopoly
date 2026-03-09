from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("game", "0006_game_winner_playerstate_gameplay_flags"),
    ]

    operations = [
        migrations.AddField(
            model_name="propertystate",
            name="is_mortgaged",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="propertystate",
            name="level",
            field=models.PositiveSmallIntegerField(default=0),
        ),
    ]
