# Generated by Django 5.2.1 on 2025-05-15 10:26

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='customuser',
            name='_rating_average',
            field=models.FloatField(db_column='rating_average', default=0),
        ),
        migrations.AddField(
            model_name='customuser',
            name='_rating_count',
            field=models.IntegerField(db_column='rating_count', default=0),
        ),
    ]
