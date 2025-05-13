"""
Command to create initial domain data.
"""
from django.core.management.base import BaseCommand
from apps.learning_sessions.models import Domain

class Command(BaseCommand):
    """Create initial domain data for the PeerLearn platform."""
    
    help = 'Creates initial domain data for the PeerLearn platform'
    
    def handle(self, *args, **options):
        """Create initial domain data."""
        domains = [
            {
                'name': 'Programming',
                'description': 'Software development, web development, mobile app development, etc.',
                'icon': 'code'
            },
            {
                'name': 'Data Science',
                'description': 'Data analysis, machine learning, artificial intelligence, etc.',
                'icon': 'bar-chart-2'
            },
            {
                'name': 'Design',
                'description': 'UI/UX design, graphic design, motion design, etc.',
                'icon': 'pen-tool'
            },
            {
                'name': 'Business',
                'description': 'Marketing, entrepreneurship, finance, etc.',
                'icon': 'briefcase'
            },
            {
                'name': 'Languages',
                'description': 'English, Spanish, French, etc.',
                'icon': 'message-circle'
            },
            {
                'name': 'Mathematics',
                'description': 'Algebra, calculus, statistics, etc.',
                'icon': 'plus'
            },
            {
                'name': 'Science',
                'description': 'Physics, chemistry, biology, etc.',
                'icon': 'thermometer'
            },
            {
                'name': 'Music',
                'description': 'Guitar, piano, music theory, etc.',
                'icon': 'music'
            },
            {
                'name': 'Photography',
                'description': 'Digital photography, photo editing, etc.',
                'icon': 'camera'
            },
            {
                'name': 'Writing',
                'description': 'Creative writing, content writing, technical writing, etc.',
                'icon': 'edit-3'
            },
        ]
        
        for domain_data in domains:
            domain, created = Domain.objects.get_or_create(
                name=domain_data['name'],
                defaults={
                    'description': domain_data['description'],
                    'icon': domain_data['icon']
                }
            )
            
            if created:
                self.stdout.write(self.style.SUCCESS(f'Created domain: {domain.name}'))
            else:
                self.stdout.write(f'Domain already exists: {domain.name}')
        
        self.stdout.write(self.style.SUCCESS('Created initial domain data'))