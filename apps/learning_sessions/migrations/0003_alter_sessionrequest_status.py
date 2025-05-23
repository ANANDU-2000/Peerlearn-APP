# Generated by Django 5.2.1 on 2025-05-13 12:29

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('learning_sessions', '0002_domain_alter_sessionrequest_domain'),
    ]

    operations = [
        migrations.AlterField(
            model_name='sessionrequest',
            name='status',
            field=models.CharField(choices=[('pending', 'Pending'), ('offered', 'Offered'), ('accepted', 'Accepted'), ('declined', 'Declined'), ('countered', 'Countered')], default='pending', help_text='Current status of the request.', max_length=10),
        ),
    ]
