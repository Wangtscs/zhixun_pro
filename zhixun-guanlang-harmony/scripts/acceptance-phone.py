"""Capture native phone acceptance evidence using the SDK's documented uitest CLI."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import time

HDC = r'D:\DevEco\DevEcoStudio\sdk\default\openharmony\toolchains\hdc.exe'
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs/acceptance/2026-11-10-runtime'
OUT.mkdir(exist_ok=True)


def hdc(*args):
    return subprocess.run([HDC, '-t', '127.0.0.1:5555', *args], check=True,
                          capture_output=True, encoding='utf-8', errors='replace').stdout


def layout():
    hdc('shell', 'uitest', 'dumpLayout', '-p', '/data/local/tmp/make-check.json')
    hdc('file', 'recv', '/data/local/tmp/make-check.json', str(OUT / 'layout.json'))
    result = []

    def walk(node):
        attr = node.get('attributes', {})
        if attr.get('visible') == 'true':
            result.append(attr)
        for child in node.get('children', []):
            walk(child)
    walk(json.loads((OUT / 'layout.json').read_text(encoding='utf-8')))
    return result


def center(node):
    x1, y1, x2, y2 = map(int, re.findall(r'-?\d+', node['bounds']))
    return str((x1+x2)//2), str((y1+y2)//2)


parser = argparse.ArgumentParser()
parser.add_argument('action', choices=['dump', 'tap', 'input', 'back', 'snap', 'click'])
parser.add_argument('value', nargs='?', default='')
parser.add_argument('extra', nargs='?', default='')
args = parser.parse_args()
if args.action == 'snap':
    assert re.fullmatch(r'[a-zA-Z0-9_-]+', args.value)
    time.sleep(0.7)
    remote = '/data/local/tmp/make-' + args.value + '-' + str(time.time_ns()) + '.png'
    hdc('shell', 'uitest', 'screenCap', '-p', remote)
    print(hdc('file', 'recv', remote, str(OUT / (args.value + '.png'))))
    (OUT / (args.value + '.json')).write_text(json.dumps(layout(), ensure_ascii=False, indent=2), encoding='utf-8')
elif args.action == 'back':
    print(hdc('shell', 'uitest', 'uiInput', 'keyEvent', 'Back'))
elif args.action == 'click':
    print(hdc('shell', 'uitest', 'uiInput', 'click', str(int(args.value)), str(int(args.extra))))
else:
    nodes = layout()
    if args.action == 'dump':
        for node in nodes:
            if node.get('text') or node.get('type') in ('TextInput', 'TextArea'):
                print(json.dumps({k: node.get(k) for k in ('type', 'text', 'hint', 'bounds', 'enabled', 'focused')}, ensure_ascii=False))
    elif args.action == 'tap':
        matches = [n for n in nodes if n.get('text') == args.value or n.get('description') == args.value]
        if not matches:
            raise RuntimeError('Visible target not found: ' + args.value)
        print(hdc('shell', 'uitest', 'uiInput', 'click', *center(matches[-1])))
    elif args.action == 'input':
        fields = [n for n in nodes if n.get('type') in ('TextInput', 'TextArea')]
        print(hdc('shell', 'uitest', 'uiInput', 'inputText', *center(fields[int(args.value)]), args.extra))

if args.action in ('tap', 'input', 'back', 'click'):
    time.sleep(0.7)
