#!/usr/bin/env python3
"""
Script to fix the consumer.py file by replacing property function calls with property access.
"""

import re
import sys

# File path
file_path = 'apps/learning_sessions/consumers.py'

# Read the file content
with open(file_path, 'r') as file:
    content = file.read()

# Replace all instances of session.can_go_live() with session.can_go_live
content = re.sub(r'session\.can_go_live\(\)', 'session.can_go_live', content)

# We need to also add a can_edit property or function to the Session model
# For now, let's replace all session.can_edit() with a simple condition
content = re.sub(r'session\.can_edit\(\)', "session.status in ['draft', 'scheduled']", content)

# Write the modified content back to the file
with open(file_path, 'w') as file:
    file.write(content)

print(f"Fixed property calls in {file_path}")