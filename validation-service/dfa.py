import re

def simulate(value, kind):
    prefix = 'VT-' if kind == 'aircraft' else 'GND'
    state = 0
    trace = [{'state': 'q0', 'character': ''}]
    for character in value:
        valid = state < 3 and character == prefix[state]
        if 3 <= state < 6:
            valid = 'A' <= character <= 'Z' if kind == 'aircraft' else '0' <= character <= '9'
        state = state + 1 if state != -1 and valid else -1
        trace.append({'state': 'dead' if state == -1 else f'q{state}', 'character': character})
    return {'accepted': state == 6, 'trace': trace, 'reason': None if state == 6 else f'Expected {"VT-[A-Z]{3}" if kind == "aircraft" else "GND[0-9]{3}"}; ended in {"dead" if state == -1 else f"q{state}"}'}

def compare(value, kind):
    dfa = simulate(value, kind)
    pattern = r'^VT-[A-Z]{3}$' if kind == 'aircraft' else r'^GND[0-9]{3}$'
    regex = re.fullmatch(pattern, value) is not None
    return {**dfa, 'input': value, 'regex': regex, 'agreement': regex == dfa['accepted']}
