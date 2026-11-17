#!/usr/bin/env python3
"""Home Assistant's own words for the Studio's terms, per language.

    python3 tools/i18n/ha_glossary.py <ha-translations-dir> <out.json> [lang ...]

<ha-translations-dir> is hass_frontend/static/translations from a Home
Assistant install (copy it out of the rig: `docker cp ha-sandbox:/usr/local/
lib/python3.14/site-packages/hass_frontend/static/translations <dir>`). It
holds the main file per language plus fragment folders (config/, lovelace/, …).

Terms: every English message of src/i18n/en.ts of at most four words, plus
the extra words below. For each term, every Home Assistant string whose
English text is exactly the term (ignoring case) is looked up in each
language; the most common translation wins, with its count and a few keys
as evidence. Terms Home Assistant doesn't use are listed under "missing".
"""
import collections
import glob
import json
import os
import re
import sys

EXTRA = [
    'Entity', 'Card', 'Icon', 'Color', 'Background', 'Border', 'Font', 'Text', 'Title', 'Name', 'State',
    'Attribute', 'Condition', 'Default', 'Settings', 'Language', 'Save', 'Cancel', 'Delete', 'Rename',
    'Duplicate', 'Add', 'Remove', 'Reset', 'Preview', 'Advanced', 'Opacity', 'Brightness', 'Size', 'Width',
    'Height', 'Theme', 'Dashboard', 'Edit', 'Value', 'Above', 'Below', 'On', 'Off', 'Features', 'Primary',
    'Secondary', 'Heading', 'Subtitle', 'Alignment', 'Left', 'Center', 'Right', 'Bold', 'Normal', 'Custom',
    'None', 'Auto', 'Always', 'Never', 'Grid', 'Vertical stack', 'Horizontal stack', 'Conditional',
    'Entity filter', 'Tile', 'Gauge', 'Thermostat', 'Copy', 'Paste', 'Clipboard', 'Import', 'Export',
    'Close', 'Search', 'Move up', 'Move down', 'Visibility', 'Rows', 'Row', 'Position', 'Inline', 'Bottom',
    'Top', 'Spacing', 'Corner radius', 'Red', 'Pink', 'Purple', 'Blue', 'Cyan', 'Teal', 'Green', 'Yellow',
    'Orange', 'Grey', 'Unavailable', 'Unknown', 'Apply', 'Done', 'Enable', 'Disable', 'Enabled', 'Disabled',
    'Version', 'Integration', 'Integrations', 'Devices & services', 'Card features', 'Show code editor',
]


def leaves(o, p=''):
    if isinstance(o, dict):
        for k, v in o.items():
            yield from leaves(v, f'{p}.{k}' if p else k)
    elif isinstance(o, str):
        yield p, o


def load(root, lang):
    out = {}
    pattern = re.compile(rf'^{re.escape(lang)}-[0-9a-f]+\.json$')
    for f in glob.glob(os.path.join(root, '*.json')) + glob.glob(os.path.join(root, '*', '*.json')):
        if not pattern.match(os.path.basename(f)):
            continue
        part = os.path.basename(os.path.dirname(f)) if os.path.dirname(f) != root.rstrip('/') else 'main'
        with open(f, encoding='utf-8') as fh:
            for k, v in leaves(json.load(fh)):
                out[f'{part}:{k}'] = v
    return out


def studio_terms():
    src = open(os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'i18n', 'en.ts'), encoding='utf-8').read()
    terms = set(EXTRA)
    for m in re.finditer(r"^\s*'[\w.]+':\s*'((?:[^'\\]|\\.)*)',?$", src, re.M):
        text = m.group(1).replace("\\'", "'")
        if '{' in text or len(text.split()) > 4 or not re.search(r'[A-Za-z]', text):
            continue
        terms.add(text.strip().rstrip('…').rstrip(':').strip())
    return sorted(t for t in terms if t)


def main():
    root, out_path, *langs = sys.argv[1:]
    if not langs:
        langs = ['de', 'nl', 'fr', 'es', 'it', 'pl', 'pt', 'pt-BR', 'sv', 'da', 'nb', 'cs', 'sk', 'hu', 'fi',
                 'ru', 'uk', 'zh-Hans', 'zh-Hant', 'ja', 'ko']
    en = load(root, 'en')
    by_text = collections.defaultdict(list)
    for k, v in en.items():
        by_text[v.strip().lower()].append(k)
    terms = studio_terms()
    result = {'source': 'Home Assistant frontend translations', 'terms': {}, 'missing': []}
    tables = {lang: load(root, lang) for lang in langs}
    for term in terms:
        keys = by_text.get(term.lower(), [])
        if not keys:
            result['missing'].append(term)
            continue
        entry = {'ha_keys': len(keys), 'example_keys': keys[:3], 'translations': {}}
        for lang in langs:
            vals = [tables[lang][k] for k in keys if tables[lang].get(k)]
            if vals:
                best, n = collections.Counter(vals).most_common(1)[0]
                entry['translations'][lang] = {'text': best, 'votes': n, 'of': len(vals)}
        result['terms'][term] = entry
    with open(out_path, 'w', encoding='utf-8') as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1)
    print(f"{len(result['terms'])} terms found in Home Assistant, {len(result['missing'])} not used by it")


if __name__ == '__main__':
    main()
