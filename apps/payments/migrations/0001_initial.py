# Generated by Django 5.2.1 on 2025-05-13 06:44

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('learning_sessions', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Payment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, help_text='Amount of the payment.', max_digits=10)),
                ('razorpay_order_id', models.CharField(blank=True, help_text='Razorpay order ID.', max_length=255, null=True)),
                ('razorpay_payment_id', models.CharField(blank=True, help_text='Razorpay payment ID.', max_length=255, null=True)),
                ('razorpay_signature', models.CharField(blank=True, help_text='Razorpay signature for verification.', max_length=255, null=True)),
                ('status', models.CharField(choices=[('initiated', 'Initiated'), ('paid', 'Paid'), ('failed', 'Failed'), ('refunded', 'Refunded')], default='initiated', help_text='Current status of the payment.', max_length=10)),
                ('created_at', models.DateTimeField(auto_now_add=True, help_text='Date and time when the payment was created.')),
                ('updated_at', models.DateTimeField(auto_now=True, help_text='Date and time when the payment was last updated.')),
                ('currency', models.CharField(default='INR', help_text='Currency of the payment.', max_length=3)),
                ('mentor_share', models.DecimalField(blank=True, decimal_places=2, help_text='Amount to be paid to the mentor.', max_digits=10, null=True)),
                ('platform_fee', models.DecimalField(blank=True, decimal_places=2, help_text='Platform fee amount.', max_digits=10, null=True)),
                ('refund_reason', models.TextField(blank=True, help_text='Reason for refund if the payment was refunded.', null=True)),
                ('booking', models.OneToOneField(help_text='The booking this payment is for.', on_delete=django.db.models.deletion.CASCADE, related_name='payment', to='learning_sessions.booking')),
            ],
            options={
                'verbose_name': 'Payment',
                'verbose_name_plural': 'Payments',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='MentorPayout',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, help_text='Amount of the payout.', max_digits=10)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('completed', 'Completed'), ('failed', 'Failed')], default='pending', help_text='Current status of the payout.', max_length=10)),
                ('payout_id', models.CharField(blank=True, help_text='Payout ID from the payment processor.', max_length=255, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, help_text='Date and time when the payout was created.')),
                ('processed_at', models.DateTimeField(blank=True, help_text='Date and time when the payout was processed.', null=True)),
                ('notes', models.TextField(blank=True, help_text='Additional notes about the payout.', null=True)),
                ('mentor', models.ForeignKey(help_text='The mentor to whom the payout is made.', limit_choices_to={'role': 'mentor'}, on_delete=django.db.models.deletion.CASCADE, related_name='payouts', to=settings.AUTH_USER_MODEL)),
                ('payments', models.ManyToManyField(help_text='Payments included in this payout.', related_name='payouts', to='payments.payment')),
            ],
            options={
                'verbose_name': 'Mentor Payout',
                'verbose_name_plural': 'Mentor Payouts',
                'ordering': ['-created_at'],
            },
        ),
    ]
