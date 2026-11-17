#!/usr/bin/env python3
"""Where a translation's short message differs from Home Assistant's own word.

    python3 tools/i18n/glossary_diff.py <glossary.json> [lang ...]

<glossary.json> is the output of ha_glossary.py. For every message of
src/i18n/en.ts whose English text is exactly a glossary term (ignoring case),
each language's message is compared with Home Assistant's most common
translation of that term, and differences are listed with Home Assistant's
vote count. Not every difference is wrong: a noun inflected for the sentence
it is inserted into (`noun.*`), a term Home Assistant left in English, or a
term with few votes can stay; the list is for review.
"""
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')


def load(code):
    with open(os.path.join(ROOT, 'src', 'i18n', f'{code}.ts'), encoding='utf8') as f:
        src = f.read()
    return {m.group(1): re.sub(r'\\(.)', r'\1', m.group(3))
            for m in re.finditer(r"^\s*'([\w.]+)': (['\"])((?:\\.|(?!\2).)*)\2,", src, re.M)}


def main():
    terms = {k.lower(): v for k, v in json.load(open(sys.argv[1], encoding='utf8'))['terms'].items()}
    with open(os.path.join(ROOT, 'src', 'i18n', 'index.ts'), encoding='utf8') as f:
        codes = re.findall(r"^ {2}'?([\w-]+)'?: \{ name:", f.read(), re.M)
    wanted = sys.argv[2:] or [c for c in codes if c != 'en']
    en = load('en')
    total = 0
    for code in wanted:
        tr = load(code)
        diffs = []
        for key, text in en.items():
            ha = terms.get(text.strip().lower(), {}).get('translations', {}).get(code)
            if ha and tr[key].strip().lower() != ha['text'].strip().lower():
                diffs.append(f"  {key} [{text}] ours={tr[key]!r} HA={ha['text']!r} ({ha['votes']}/{ha['of']})")
        total += len(diffs)
        print(f'== {code}: {len(diffs)}')
        print('\n'.join(diffs)) if diffs else None
    print(f'{total} differences to review')


if __name__ == '__main__':
    main()
