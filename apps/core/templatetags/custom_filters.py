"""
Custom template filters for PeerLearn.
"""
from django import template

register = template.Library()

@register.filter
def split(value, arg):
    """
    Splits a string by the provided delimiter and returns a list.
    If value is already a list, it's returned unchanged.
    Usage: {{ value|split:"," }}
    """
    if isinstance(value, list):
        return value
    elif isinstance(value, str):
        return value.split(arg)
    return []

@register.filter
def strip(value):
    """
    Strips whitespace from a string.
    Usage: {{ value|strip }}
    """
    if isinstance(value, str):
        return value.strip()
    return value