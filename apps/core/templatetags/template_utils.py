"""
Custom template tags and filters for PeerLearn.
"""

from django import template
from django.template.defaultfilters import stringfilter
import math

register = template.Library()

@register.filter
def get_item(dictionary, key):
    """
    Get an item from a dictionary using key.
    Usage: {{ mydict|get_item:key_variable }}
    """
    if not dictionary:
        return []
    return dictionary.get(key, [])

@register.filter
def range_list(count):
    """
    Generate a range of numbers from 0 to count-1.
    Usage: {% for i in count|range_list %}
    """
    try:
        count = int(count)
        return range(count)
    except (ValueError, TypeError):
        return range(0)

@register.filter
def add(value, arg):
    """
    Add two values.
    Usage: {{ value|add:arg }}
    """
    try:
        return int(value) + int(arg)
    except (ValueError, TypeError):
        return value

@register.filter
def subtract(value, arg):
    """
    Subtract arg from value.
    Usage: {{ value|subtract:arg }}
    """
    try:
        return int(value) - int(arg)
    except (ValueError, TypeError):
        return value

@register.filter
def divide_by(value, arg):
    """
    Divide value by arg, returning ceiling of result.
    Usage: {{ value|divide_by:arg }}
    """
    try:
        return math.ceil(int(value) / int(arg))
    except (ValueError, TypeError, ZeroDivisionError):
        return 0

@register.filter
def multiply(value, arg):
    """
    Multiply value by arg.
    Usage: {{ value|multiply:arg }}
    """
    try:
        return int(value) * int(arg)
    except (ValueError, TypeError):
        return value