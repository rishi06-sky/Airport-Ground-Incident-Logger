import re
CATEGORIES = ['Safety-Breach', 'Damage', 'Equipment-Failure', 'FOD', 'Delay']
DEFAULTS = {
 'FOD': ['debris', 'foreign object', 'runway object', 'loose material'],
 'Damage': ['damage', 'collision', 'dent', 'crack'],
 'Delay': ['delay', 'late departure', 'postponed', 'ground delay'],
 'Safety-Breach': ['unsafe', 'safety violation', 'restricted area', 'injury', 'safety breach'],
 'Equipment-Failure': ['equipment failure', 'malfunction', 'conveyor breakdown', 'vehicle breakdown', 'machinery failure']}

def classify(description, keywords=None, urgency='Normal'):
    rules = DEFAULTS if keywords is None else keywords
    if set(rules) != set(CATEGORIES) or any(not isinstance(v, list) or not v or any(not isinstance(s, str) or not s.strip() or len(s)>100 for s in v) for v in rules.values()):
        raise ValueError('Configure nonempty keyword lists for exactly five categories')
    matched = [c for c in CATEGORIES if any(re.search(r'\b' + re.escape(k) + r'\b', description, re.I) for k in rules[c])]
    category = matched[0] if matched else None
    priority = 0 if urgency == 'Critical' or category == 'Safety-Breach' else 1 if urgency == 'High' or category == 'Damage' else 2
    return {'matchedCategories': matched, 'category': category, 'priority': priority, 'priorityRule': CATEGORIES, 'emergencyOverride': urgency == 'Critical'}
